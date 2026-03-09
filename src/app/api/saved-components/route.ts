import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export const maxDuration = 60;

const TAG_CATEGORY_MAP: Record<string, string> = {
  SECTION: "section",
  HEADER: "section",
  FOOTER: "section",
  NAV: "section",
  MAIN: "section",
  ARTICLE: "section",
  ASIDE: "section",
  H1: "text",
  H2: "text",
  H3: "text",
  H4: "text",
  H5: "text",
  H6: "text",
  P: "text",
  BLOCKQUOTE: "text",
  IMG: "media",
  PICTURE: "media",
  VIDEO: "media",
  BUTTON: "button",
  A: "button",
  DIV: "section",
};

function detectCategory(html: string): string {
  const match = html.trim().match(/^<(\w+)/i);
  if (!match) return "container";
  const tag = match[1].toUpperCase();
  return TAG_CATEGORY_MAP[tag] ?? "container";
}

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const url = new URL(req.url);
  const product = url.searchParams.get("product");

  let query = db
    .from("saved_components")
    .select("*")
    .order("created_at", { ascending: false });

  if (product) {
    query = query.or(`product.eq.${product},product.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    return safeError(error, "Failed to fetch saved components");
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const body = await req.json();
  const { name, html, product } = body as {
    name?: string;
    html?: string;
    product?: string;
  };

  if (!name || !html) {
    return NextResponse.json(
      { error: "Missing required fields: name and html" },
      { status: 400 }
    );
  }

  const category = detectCategory(html);

  // Generate thumbnail
  let thumbnail_url: string | null = null;
  let browser;
  try {
    const isLocal = process.env.NODE_ENV === "development";
    browser = await puppeteer.launch({
      args: isLocal ? ["--no-sandbox"] : chromium.args,
      executablePath: isLocal
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : await chromium.executablePath(),
      headless: true,
      defaultViewport: { width: 800, height: 600 },
    });

    const page = await browser.newPage();
    const shell = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body { margin:0; padding:16px; background:white; font-family:system-ui,sans-serif; }</style></head><body>${html}</body></html>`;
    await page.setContent(shell, { waitUntil: "networkidle0" });
    const screenshot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 800, height: 600 },
    });
    await browser.close();
    browser = null;

    const filename = `thumb_${Date.now()}.png`;
    const { error: uploadError } = await db.storage
      .from("component-thumbnails")
      .upload(filename, screenshot, {
        contentType: "image/png",
        upsert: false,
      });

    if (!uploadError) {
      const {
        data: { publicUrl },
      } = db.storage.from("component-thumbnails").getPublicUrl(filename);
      thumbnail_url = publicUrl;
    } else {
      console.error(
        "[saved-components] Thumbnail upload failed:",
        uploadError.message
      );
    }
  } catch (err) {
    if (browser) await browser.close();
    console.error(
      "[saved-components] Thumbnail generation failed:",
      err instanceof Error ? err.message : err
    );
    // Continue without thumbnail — not a blocker
  }

  const { data: saved, error } = await db
    .from("saved_components")
    .insert({
      name,
      html,
      product: product || null,
      category,
      thumbnail_url,
    })
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to save component");
  }

  return NextResponse.json(saved, { status: 201 });
}
