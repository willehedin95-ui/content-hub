import { createHash } from "crypto";
import sharp from "sharp";
import * as cheerio from "cheerio";

const MAX_IMAGES = 30;
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
  };
}

function sha1Buffer(buf: Buffer): string {
  return createHash("sha1").update(buf).digest("hex");
}

function generateDeployPath(originalUrl: string, slugPrefix: string): string {
  const hash = createHash("sha1").update(originalUrl).digest("hex").slice(0, 12);
  return `/${slugPrefix}/images/${hash}.webp`;
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
 */
function extractImageUrls(html: string): string[] {
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

  return Array.from(urls).slice(0, MAX_IMAGES);
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
 */
async function convertToWebP(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer)
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
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
  const urls = extractImageUrls(html);
  const urlMap = new Map<string, string>();
  const images: OptimizedImage[] = [];
  const stats = {
    total: urls.length,
    optimized: 0,
    skipped: 0,
    savedBytes: 0,
    errors: [] as string[],
  };

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

      const webpBuffer = await convertToWebP(downloaded.buffer);
      const deployPath = generateDeployPath(url, slugPrefix);

      const optimized: OptimizedImage = {
        originalUrl: url,
        deployPath,
        buffer: webpBuffer,
        sha1: sha1Buffer(webpBuffer),
        originalSize: downloaded.buffer.length,
        optimizedSize: webpBuffer.length,
      };

      urlMap.set(url, deployPath);
      images.push(optimized);
      stats.optimized++;
      stats.savedBytes += downloaded.buffer.length - webpBuffer.length;
      completed++;
      const detail = `${(downloaded.buffer.length / 1024).toFixed(0)}KB → ${(webpBuffer.length / 1024).toFixed(0)}KB`;
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
