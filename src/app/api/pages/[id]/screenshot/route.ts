import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

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
    .select("published_url")
    .eq("page_id", id)
    .eq("status", "published")
    .not("published_url", "is", null)
    .limit(1)
    .single();

  if (!translation?.published_url) {
    return NextResponse.json({ error: "No published URL found" }, { status: 404 });
  }

  let browser;
  try {
    const isLocal = process.env.NODE_ENV === "development";
    browser = await puppeteer.launch({
      args: isLocal ? ["--no-sandbox"] : chromium.args,
      executablePath: isLocal
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : await chromium.executablePath(),
      headless: true,
      defaultViewport: { width: 375, height: 812 },
    });

    const page = await browser.newPage();
    await page.goto(translation.published_url, { waitUntil: "networkidle2", timeout: 30000 });
    const screenshot = await page.screenshot({ type: "jpeg", quality: 80 });
    await browser.close();
    browser = null;

    // Upload to Supabase Storage
    const filename = `${id}.jpg`;
    const { error: uploadError } = await db.storage
      .from("page-thumbnails")
      .upload(filename, screenshot, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = db.storage
      .from("page-thumbnails")
      .getPublicUrl(filename);

    // Save to pages table
    await db
      .from("pages")
      .update({ thumbnail_url: publicUrl })
      .eq("id", id);

    return NextResponse.json({ thumbnail_url: publicUrl });
  } catch (err) {
    if (browser) await browser.close();
    const message = err instanceof Error ? err.message : "Screenshot failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
