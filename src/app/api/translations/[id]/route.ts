import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { extractContent, applyTranslations } from "@/lib/html-parser";
import * as cheerio from "cheerio";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data, error } = await db
    .from("translations")
    .select(`*, pages (id, name, slug, source_url, original_html)`)
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

/**
 * PUT /api/translations/[id]
 * Accepts either:
 *   - { translated_html } — inline editing (saves HTML directly)
 *   - { translated_texts } — legacy segment editing (rebuilds HTML from placeholders)
 * Optional: seo_title, seo_description
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { translated_html, translated_texts, seo_title, seo_description, slug } =
    body as {
      translated_html?: string;
      translated_texts?: Record<string, string>;
      seo_title?: string;
      seo_description?: string;
      slug?: string;
    };

  if (!translated_html && !translated_texts) {
    return NextResponse.json(
      { error: "translated_html or translated_texts is required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  const { data: translation, error: fetchError } = await db
    .from("translations")
    .select(`*, pages (original_html)`)
    .eq("id", id)
    .single();

  if (fetchError || !translation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let finalHtml: string;

  if (translated_html) {
    // Inline editing path — HTML comes directly from the client
    const $ = cheerio.load(translated_html);

    // Server-side sanitization: strip editor artifacts
    $("[data-cc-editor]").remove();
    $("[data-cc-injected]").remove();
    $("[data-cc-editable]").removeAttr("data-cc-editable");
    $("[contenteditable]").removeAttr("contenteditable");

    // Apply SEO meta tags
    if (seo_title) {
      $("title").text(seo_title);
      $('meta[property="og:title"]').attr("content", seo_title);
    }
    if (seo_description) {
      $('meta[name="description"]').attr("content", seo_description);
      $('meta[property="og:description"]').attr("content", seo_description);
    }

    finalHtml = $.html();
  } else {
    // Legacy segment editing path — rebuild HTML from placeholders
    const { modifiedHtml } = extractContent(
      (translation.pages as { original_html: string }).original_html
    );

    const metaTranslations = {
      title: seo_title,
      description: seo_description,
      ogTitle: seo_title,
      ogDescription: seo_description,
    };

    finalHtml = applyTranslations(
      modifiedHtml,
      translated_texts!,
      metaTranslations
    );
  }

  // Clear quality data if the HTML content actually changed (scores would be stale)
  const htmlChanged = finalHtml !== translation.translated_html;

  const { data: updated, error: saveError } = await db
    .from("translations")
    .update({
      translated_html: finalHtml,
      translated_texts: translated_texts ?? translation.translated_texts,
      seo_title: seo_title ?? translation.seo_title,
      seo_description: seo_description ?? translation.seo_description,
      slug: slug ?? translation.slug,
      status:
        translation.status === "published" ? "translated" : translation.status,
      ...(htmlChanged && { quality_score: null, quality_analysis: null }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
