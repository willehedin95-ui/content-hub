import { createHash } from "crypto";
import sharp from "sharp";
import * as cheerio from "cheerio";

// Raised 30→60 (audit 2026-07-07, P3): long listicles exceeded 30 and the
// overflow silently deployed with UNoptimized origin URLs. Overflow is now
// also surfaced via stats.truncated → publish warning.
const MAX_IMAGES = 60;
const CONCURRENCY = 5;
const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface OptimizedImage {
  originalUrl: string;
  deployPath: string;
  buffer: Buffer;
  sha1: string;
  originalSize: number;
  optimizedSize: number;
  width: number;
  height: number;
  /** AVIF version - same dimensions, smaller file. Optional (may fail). */
  avif?: {
    deployPath: string;
    buffer: Buffer;
    sha1: string;
    size: number;
  };
}

export interface OptimizationResult {
  urlMap: Map<string, string>;
  images: OptimizedImage[];
  stats: {
    total: number;
    optimized: number;
    skipped: number;
    savedBytes: number;
    errors: string[];
    /** Images beyond the MAX_IMAGES cap that were NOT optimized */
    truncated: number;
  };
}

function sha1Buffer(buf: Buffer): string {
  return createHash("sha1").update(buf).digest("hex");
}

function generateDeployPath(originalUrl: string, slugPrefix: string, ext: "webp" | "avif" = "webp"): string {
  const hash = createHash("sha1").update(originalUrl).digest("hex").slice(0, 12);
  return `/${slugPrefix}/images/${hash}.${ext}`;
}

function shouldSkipUrl(url: string): boolean {
  if (!url || url.startsWith("data:")) return true;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith(".svg")) return true;
  } catch {
    return true;
  }
  return false;
}

/**
 * Extract unique image URLs from HTML (img src and srcset attributes).
 * Returns the capped list plus how many were dropped by the cap.
 */
function extractImageUrls(html: string): { urls: string[]; truncated: number } {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $("img[src], source[src]").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (!shouldSkipUrl(src)) urls.add(src);
  });

  $("img[srcset], source[srcset]").each((_, el) => {
    const srcset = $(el).attr("srcset") || "";
    for (const entry of srcset.split(",")) {
      const url = entry.trim().split(/\s+/)[0];
      if (url && !shouldSkipUrl(url)) urls.add(url);
    }
  });

  const all = Array.from(urls);
  return { urls: all.slice(0, MAX_IMAGES), truncated: Math.max(0, all.length - MAX_IMAGES) };
}

/**
 * Download a single image with timeout and size limit.
 */
async function downloadImage(
  url: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_IMAGE_BYTES) return null;

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) return null;

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: res.headers.get("content-type") || "",
    };
  } catch {
    return null;
  }
}

/**
 * Convert an image buffer to compressed WebP using sharp.
 * Returns buffer AND dimensions (for emitting width/height on <img> tags,
 * which prevents layout shift and enables lazy-loading optimizations).
 */
async function convertToWebP(
  inputBuffer: Buffer
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const pipeline = sharp(inputBuffer)
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

/**
 * Convert an image buffer to AVIF. AVIF is ~20% smaller than WebP at same
 * visual quality (so ~50% smaller than JPEG). Modern browsers (Chrome,
 * Firefox, Safari 16+) support it natively; we serve via <picture> with
 * WebP fallback so older browsers still work.
 *
 * Slower to encode than WebP (~3-5x), but we do it once at publish time
 * so users get the speed benefit on every page load.
 */
async function convertToAvif(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer)
    .resize({ width: 1920, withoutEnlargement: true })
    .avif({ quality: 50, effort: 4 })
    .toBuffer();
}

/**
 * Process images with bounded concurrency.
 */
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null>
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

/**
 * Download, convert, and prepare all images from an HTML document for deploy.
 */
export async function optimizeImages(
  html: string,
  slugPrefix: string,
  onProgress?: (current: number, total: number, detail: string) => void
): Promise<OptimizationResult> {
  const { urls, truncated } = extractImageUrls(html);
  const urlMap = new Map<string, string>();
  const images: OptimizedImage[] = [];
  const stats = {
    total: urls.length,
    optimized: 0,
    skipped: 0,
    savedBytes: 0,
    errors: [] as string[],
    truncated,
  };

  if (truncated > 0) {
    console.warn(
      `[image-optimizer] ${truncated} image(s) beyond the ${MAX_IMAGES}-image cap will NOT be optimized`
    );
  }

  if (urls.length === 0) {
    return { urlMap, images, stats };
  }

  console.log(`[image-optimizer] Found ${urls.length} images to optimize`);

  let completed = 0;
  await processWithConcurrency(urls, CONCURRENCY, async (url) => {
    try {
      const downloaded = await downloadImage(url);
      if (!downloaded) {
        stats.skipped++;
        stats.errors.push(`Download failed: ${url}`);
        completed++;
        console.log(`[image-optimizer] [${completed}/${urls.length}] SKIP ${url.slice(0, 80)}`);
        onProgress?.(completed, urls.length, `Skipped (download failed)`);
        return null;
      }

      const { buffer: webpBuffer, width, height } = await convertToWebP(downloaded.buffer);
      const deployPath = generateDeployPath(url, slugPrefix, "webp");

      // AVIF version - parallel format, ~20% smaller than WebP. Best-effort;
      // if AVIF encoding fails (rare, usually corrupt input), fall through
      // with just WebP - browsers will pick whatever <source> they support.
      let avif: OptimizedImage["avif"];
      try {
        const avifBuffer = await convertToAvif(downloaded.buffer);
        // Only emit AVIF if it's actually smaller than WebP (very small/simple
        // images sometimes compress better in WebP; avoid wasted bytes).
        if (avifBuffer.length < webpBuffer.length) {
          avif = {
            deployPath: generateDeployPath(url, slugPrefix, "avif"),
            buffer: avifBuffer,
            sha1: sha1Buffer(avifBuffer),
            size: avifBuffer.length,
          };
        }
      } catch (err) {
        console.warn(`[image-optimizer] AVIF failed for ${url.slice(0, 80)} (using WebP only):`, err instanceof Error ? err.message : err);
      }

      const optimized: OptimizedImage = {
        originalUrl: url,
        deployPath,
        buffer: webpBuffer,
        sha1: sha1Buffer(webpBuffer),
        originalSize: downloaded.buffer.length,
        optimizedSize: webpBuffer.length,
        width,
        height,
        avif,
      };

      urlMap.set(url, deployPath);
      images.push(optimized);
      stats.optimized++;
      stats.savedBytes += downloaded.buffer.length - webpBuffer.length;
      if (avif) {
        // AVIF additional savings (we still ship WebP for fallback so this is
        // bonus for modern browsers).
        stats.savedBytes += webpBuffer.length - avif.size;
      }
      completed++;
      const avifStr = avif ? ` + AVIF ${(avif.size / 1024).toFixed(0)}KB` : "";
      const detail = `${(downloaded.buffer.length / 1024).toFixed(0)}KB → WebP ${(webpBuffer.length / 1024).toFixed(0)}KB${avifStr}`;
      console.log(`[image-optimizer] [${completed}/${urls.length}] OK ${detail} ${url.slice(0, 80)}`);
      onProgress?.(completed, urls.length, detail);
    } catch (err) {
      stats.skipped++;
      stats.errors.push(
        `Conversion failed for ${url}: ${err instanceof Error ? err.message : "unknown"}`
      );
      completed++;
      console.log(`[image-optimizer] [${completed}/${urls.length}] ERR ${url.slice(0, 80)}: ${err instanceof Error ? err.message : "unknown"}`);
      onProgress?.(completed, urls.length, `Failed`);
    }

    return null;
  });

  console.log(
    `[image-optimizer] Done: ${stats.optimized}/${stats.total} optimized, ` +
      `${(stats.savedBytes / 1024).toFixed(0)}KB saved`
  );

  return { urlMap, images, stats };
}

/**
 * Add performance attributes to <img> tags in article body:
 *   - width/height from sharp metadata (prevents CLS layout shift)
 *   - loading="lazy" + decoding="async" on all but the first image
 *   - fetchpriority="high" on the first image (the hero, above the fold)
 *
 * Call this AFTER optimizeImages has replaced URLs in the HTML and you have
 * an `OptimizedImage[]` with dimensions.
 *
 * Matches tags by their resolved src (either the original URL or the deploy
 * path) so it works before or after URL substitution.
 */
export function enhanceImageTags(
  html: string,
  images: OptimizedImage[]
): string {
  if (images.length === 0) return html;

  const $ = cheerio.load(html, { xmlMode: false });
  // Lookup by both original URL and deploy path
  const infoBySrc = new Map<string, OptimizedImage>();
  for (const img of images) {
    infoBySrc.set(img.originalUrl, img);
    infoBySrc.set(img.deployPath, img);
  }

  let isFirstImage = true;

  $("img").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src") || "";
    const info = infoBySrc.get(src);

    // Skip if already wrapped in <picture> (don't double-wrap)
    const parent = $el.parent();
    const alreadyWrapped = parent.length > 0 && parent[0].type === "tag" && parent[0].name === "picture";

    // Set width/height when known. Only set if missing.
    if (info) {
      if (!$el.attr("width")) $el.attr("width", String(info.width));
      if (!$el.attr("height")) $el.attr("height", String(info.height));
    }

    // First image (hero) eager with fetchpriority=high; rest lazy.
    if (isFirstImage) {
      if (!$el.attr("fetchpriority")) $el.attr("fetchpriority", "high");
      if (!$el.attr("decoding")) $el.attr("decoding", "async");
      isFirstImage = false;
    } else {
      if (!$el.attr("loading")) $el.attr("loading", "lazy");
      if (!$el.attr("decoding")) $el.attr("decoding", "async");
    }

    // If we have an AVIF version, wrap in <picture> with both AVIF + WebP
    // sources. Modern browsers (Chrome/FF/Safari 16+) load AVIF, older
    // fall back to WebP via the <img> tag.
    if (info?.avif && !alreadyWrapped) {
      const avifSource = `<source type="image/avif" srcset="${info.avif.deployPath}">`;
      const webpSource = `<source type="image/webp" srcset="${info.deployPath}">`;
      const imgHtml = $.html($el);
      $el.replaceWith(`<picture>${avifSource}${webpSource}${imgHtml}</picture>`);
    }
  });

  return $.html();
}
