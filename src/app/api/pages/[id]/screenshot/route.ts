import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Find a published translation with a URL
  const { data: translation } = await db
    .from("translations")
    .select("published_url, translated_html")
    .eq("page_id", id)
    .eq("status", "published")
    .not("published_url", "is", null)
    .limit(1)
    .single();

  if (!translation?.published_url) {
    return NextResponse.json({ error: "No published URL found" }, { status: 404 });
  }

  // Try Puppeteer screenshot (works locally, may fail on Vercel)
  try {
    const puppeteer = await import("puppeteer-core");
    const isLocal = process.env.NODE_ENV === "development";

    let executablePath: string;
    let args: string[];

    if (isLocal) {
      executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      args = ["--no-sandbox"];
    } else {
      const chromium = (await import("@sparticuz/chromium")).default;
      executablePath = await chromium.executablePath();
      args = chromium.args;
    }

    const browser = await puppeteer.default.launch({
      args,
      executablePath,
      headless: true,
      defaultViewport: { width: 375, height: 700 },
    });

    const page = await browser.newPage();
    await page.goto(translation.published_url, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1500));
    const screenshot = await page.screenshot({ type: "jpeg", quality: 85 });
    await browser.close();

    // Upload to Supabase Storage
    const filename = `${id}.jpg`;
    const { error: uploadError } = await db.storage
      .from("page-thumbnails")
      .upload(filename, screenshot, { contentType: "image/jpeg", upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = db.storage
      .from("page-thumbnails")
      .getPublicUrl(filename);

    // Add cache-bust to avoid stale thumbnails
    const thumbnailUrl = `${publicUrl}?v=${Date.now()}`;

    await db.from("pages").update({ thumbnail_url: thumbnailUrl }).eq("id", id);
    return NextResponse.json({ thumbnail_url: thumbnailUrl });
  } catch (err) {
    // Puppeteer failed (common on Vercel) — fall back to extracting hero image from HTML
    if (translation.translated_html) {
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
      let match;
      while ((match = imgRegex.exec(translation.translated_html)) !== null) {
        const tag = match[0];
        const url = match[1].replace(/&amp;/g, "&");
        const pathOnly = url.split("?")[0];
        if (url.startsWith("data:") || pathOnly.endsWith(".svg") || pathOnly.endsWith(".ico")) continue;
        if (/pixel|tracking|spacer|favicon/i.test(url)) continue;
        const w = tag.match(/width=["']?(\d+)/i);
        const h = tag.match(/height=["']?(\d+)/i);
        if (w && parseInt(w[1]) < 100) continue;
        if (h && parseInt(h[1]) < 100) continue;
        await db.from("pages").update({ thumbnail_url: url }).eq("id", id);
        return NextResponse.json({ thumbnail_url: url, method: "html_fallback" });
      }
    }
    const message = err instanceof Error ? err.message : "Screenshot failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
