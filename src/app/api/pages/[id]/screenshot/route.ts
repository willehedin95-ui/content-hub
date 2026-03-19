import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Find a published translation with HTML
  const { data: translation } = await db
    .from("translations")
    .select("translated_html")
    .eq("page_id", id)
    .eq("status", "published")
    .not("translated_html", "is", null)
    .limit(1)
    .single();

  if (!translation?.translated_html) {
    return NextResponse.json({ error: "No published translation found" }, { status: 404 });
  }

  // Extract the first significant <img src> from the HTML
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  let thumbnailUrl: string | null = null;

  while ((match = imgRegex.exec(translation.translated_html)) !== null) {
    const src = match[0];
    const url = match[1];

    // Unescape HTML entities
    const clean = url.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

    // Skip tiny icons, data URIs, SVGs, tracking pixels
    if (clean.startsWith("data:")) continue;
    const pathOnly = clean.split("?")[0];
    if (pathOnly.endsWith(".svg") || pathOnly.endsWith(".ico")) continue;
    if (clean.includes("pixel") || clean.includes("tracking") || clean.includes("spacer")) continue;
    if (clean.includes("favicon")) continue;

    // Skip images with explicit small dimensions (badges, icons)
    const widthMatch = src.match(/width=["']?(\d+)/i);
    const heightMatch = src.match(/height=["']?(\d+)/i);
    if (widthMatch && parseInt(widthMatch[1]) < 80) continue;
    if (heightMatch && parseInt(heightMatch[1]) < 80) continue;

    thumbnailUrl = clean;
    break;
  }

  if (!thumbnailUrl) {
    return NextResponse.json({ error: "No suitable image found in page HTML" }, { status: 404 });
  }

  // Save directly to pages table — no storage upload needed, just use the image URL
  await db
    .from("pages")
    .update({ thumbnail_url: thumbnailUrl })
    .eq("id", id);

  return NextResponse.json({ thumbnail_url: thumbnailUrl });
}
