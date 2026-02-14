import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { extractContent, applyTranslations } from "@/lib/html-parser";

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
 * Body: { translated_texts: Record<string, string>, seo_title?, seo_description? }
 * Reconstructs translated_html from the updated texts and saves everything.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { translated_texts, seo_title, seo_description } = body as {
    translated_texts: Record<string, string>;
    seo_title?: string;
    seo_description?: string;
  };

  if (!translated_texts) {
    return NextResponse.json(
      { error: "translated_texts is required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // Fetch translation + page HTML
  const { data: translation, error: fetchError } = await db
    .from("translations")
    .select(`*, pages (original_html)`)
    .eq("id", id)
    .single();

  if (fetchError || !translation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Re-extract with placeholders and apply updated translations
  const { modifiedHtml } = extractContent(
    (translation.pages as { original_html: string }).original_html
  );

  const metaTranslations = {
    title: seo_title,
    description: seo_description,
    ogTitle: seo_title,
    ogDescription: seo_description,
  };

  const translatedHtml = applyTranslations(
    modifiedHtml,
    translated_texts,
    metaTranslations
  );

  const { data: updated, error: saveError } = await db
    .from("translations")
    .update({
      translated_html: translatedHtml,
      translated_texts,
      seo_title: seo_title ?? translation.seo_title,
      seo_description: seo_description ?? translation.seo_description,
      // Revert to translated (unpublish) if they had published, so they know to re-publish
      status: translation.status === "published" ? "translated" : translation.status,
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
