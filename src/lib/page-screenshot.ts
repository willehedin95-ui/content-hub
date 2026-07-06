/**
 * Page thumbnail rendering. Screenshots a page with Puppeteer - from its published URL when
 * available, otherwise by rendering the stored HTML directly (setContent), so unpublished
 * pages get thumbnails too. Uploads to the page-thumbnails bucket and updates
 * pages.thumbnail_url. Falls back to extracting a hero <img> from the HTML when Puppeteer
 * is unavailable (e.g. Vercel cold environments where chromium fails).
 */

import { existsSync } from "fs";
import { createServerSupabase } from "@/lib/supabase-admin";

const LOCAL_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");
  let chromePath: string;
  let args: string[];
  if (existsSync(LOCAL_CHROME)) {
    chromePath = LOCAL_CHROME;
    args = ["--no-sandbox"];
  } else {
    const chromium = (await import("@sparticuz/chromium")).default;
    chromePath = await chromium.executablePath();
    args = chromium.args;
  }
  return puppeteer.default.launch({
    args,
    executablePath: chromePath,
    headless: true,
    defaultViewport: { width: 375, height: 700 },
  });
}

function heroImageFromHtml(html: string): string | null {
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];
    const url = match[1].replace(/&amp;/g, "&");
    const pathOnly = url.split("?")[0];
    if (url.startsWith("data:") || pathOnly.endsWith(".svg") || pathOnly.endsWith(".ico")) continue;
    if (/pixel|tracking|spacer|favicon/i.test(url)) continue;
    const w = tag.match(/width=["']?(\d+)/i);
    const h = tag.match(/height=["']?(\d+)/i);
    if (w && parseInt(w[1]) < 100) continue;
    if (h && parseInt(h[1]) < 100) continue;
    return url;
  }
  return null;
}

export async function renderPageThumbnail(
  pageId: string,
): Promise<{ thumbnail_url: string; method: "screenshot" | "html_fallback" } | { error: string }> {
  const db = createServerSupabase();

  // Prefer a published translation; fall back to any translation's HTML, then the page original.
  const { data: translations } = await db
    .from("translations")
    .select("published_url, translated_html, status")
    .eq("page_id", pageId)
    .limit(5);
  const published = (translations ?? []).find((t) => t.status === "published" && t.published_url);
  const anyHtml = published?.translated_html || (translations ?? []).find((t) => t.translated_html)?.translated_html;

  let html: string | null = anyHtml ?? null;
  if (!html) {
    const { data: page } = await db.from("pages").select("original_html").eq("id", pageId).single();
    html = (page?.original_html as string) ?? null;
  }

  if (!published?.published_url && !html) return { error: "No published URL or HTML found" };

  try {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      if (published?.published_url) {
        await page.goto(published.published_url, { waitUntil: "networkidle2", timeout: 20000 });
      } else {
        await page.setContent(html!, { waitUntil: "networkidle2", timeout: 20000 });
      }
      await new Promise((r) => setTimeout(r, 1500));
      const screenshot = await page.screenshot({ type: "jpeg", quality: 85 });

      const filename = `${pageId}.jpg`;
      const { error: uploadError } = await db.storage
        .from("page-thumbnails")
        .upload(filename, screenshot, { contentType: "image/jpeg", upsert: true });
      if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

      const { data: { publicUrl } } = db.storage.from("page-thumbnails").getPublicUrl(filename);
      const thumbnailUrl = `${publicUrl}?v=${Date.now()}`;
      await db.from("pages").update({ thumbnail_url: thumbnailUrl }).eq("id", pageId);
      return { thumbnail_url: thumbnailUrl, method: "screenshot" };
    } finally {
      await browser.close();
    }
  } catch (err) {
    // Puppeteer failed - hero-image fallback from HTML.
    if (html) {
      const hero = heroImageFromHtml(html);
      if (hero) {
        await db.from("pages").update({ thumbnail_url: hero }).eq("id", pageId);
        return { thumbnail_url: hero, method: "html_fallback" };
      }
    }
    return { error: err instanceof Error ? err.message : "Screenshot failed" };
  }
}
