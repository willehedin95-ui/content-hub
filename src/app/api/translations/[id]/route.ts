import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { safeError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";
import { STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Handle source page: synthetic ID format "source_<pageId>"
  const isSource = id.startsWith("source_");
  const realId = isSource ? id.slice("source_".length) : id;

  if (!isValidUUID(realId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  if (isSource) {
    const { data: page, error } = await db
      .from("pages")
      .select("id, name, slug, source_url, original_html")
      .eq("id", realId)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !page) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Return in translation-like format for compatibility
    return NextResponse.json({
      id,
      page_id: page.id,
      translated_html: page.original_html,
      pages: page,
    });
  }

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

  // Handle source page editing: synthetic ID format "source_<pageId>"
  const isSourceEdit = id.startsWith("source_");
  const realId = isSourceEdit ? id.slice("source_".length) : id;

  if (!isValidUUID(realId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
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

    // Source page editing: save to pages.original_html
    if (isSourceEdit) {
      if (!translated_html) {
        return NextResponse.json(
          { error: "Source editing requires translated_html" },
          { status: 400 }
        );
      }

      // Client-side extractHtmlFromIframe() already strips all editor artifacts.
      // Skip redundant server-side cheerio + DOMPurify (2 full DOM parses of ~950KB
      // HTML that caused timeouts on Vercel cold starts). Sanitization runs on publish.
      const { data: page, error: saveError } = await db
        .from("pages")
        .update({
          original_html: translated_html,
        })
        .eq("id", realId)
        .select("id")
        .single();

      if (saveError) {
        return safeError(saveError, "Failed to save source page");
      }

      return NextResponse.json({
        id,
        page_id: realId,
      });
    }

    if (translated_html) {
      // Inline editing path — HTML comes directly from the client.
      // Client-side extractHtmlFromIframe() already strips all editor artifacts.
      // Skip redundant server-side cheerio + DOMPurify (2 full DOM parses of ~950KB
      // HTML that caused timeouts on Vercel cold starts). Sanitization runs on publish.
      const { data: translation, error: fetchError } = await db
        .from("translations")
        .select("id, status, seo_title, seo_description, slug, translated_texts")
        .eq("id", id)
        .single();

      if (fetchError || !translation) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // Lightweight SEO meta tag injection via regex (no DOM parsing needed)
      let finalHtml = translated_html;
      if (seo_title) {
        finalHtml = finalHtml.replace(/<title>[^<]*<\/title>/, `<title>${seo_title}</title>`);
        finalHtml = finalHtml.replace(
          /(<meta\s[^>]*property="og:title"[^>]*content=")[^"]*"/,
          `$1${seo_title}"`
        );
      }
      if (seo_description) {
        finalHtml = finalHtml.replace(
          /(<meta\s[^>]*name="description"[^>]*content=")[^"]*"/,
          `$1${seo_description}"`
        );
        finalHtml = finalHtml.replace(
          /(<meta\s[^>]*property="og:description"[^>]*content=")[^"]*"/,
          `$1${seo_description}"`
        );
      }

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
          quality_score: null,
          quality_analysis: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id, status, updated_at, seo_title, seo_description, slug")
        .single();

      if (saveError) {
        return safeError(saveError, "Failed to save translation");
      }

      return NextResponse.json(updated);
    } else {
      // Legacy segment editing path — needs pages.original_html
      const { data: translation, error: fetchError } = await db
        .from("translations")
        .select(`*, pages (original_html)`)
        .eq("id", id)
        .single();

      if (fetchError || !translation) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const { extractContent, applyTranslations } = await import("@/lib/html-parser");
      const { modifiedHtml } = extractContent(
        (translation.pages as { original_html: string }).original_html
      );

      const metaTranslations = {
        title: seo_title,
        description: seo_description,
        ogTitle: seo_title,
        ogDescription: seo_description,
      };

      const finalHtml = applyTranslations(
        modifiedHtml,
        translated_texts!,
        metaTranslations
      );

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
        return safeError(saveError, "Failed to save translation");
      }

      return NextResponse.json(updated);
    }
  } catch (err) {
    return safeError(err, "Failed to save translation");
  }
}

/**
 * DELETE /api/translations/[id]
 * Deletes a translation and its associated storage images.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }
    const db = createServerSupabase();

    // Check translation exists
    const { data: translation, error: fetchError } = await db
      .from("translations")
      .select("id, page_id, language, variant")
      .eq("id", id)
      .single();

    if (fetchError || !translation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Clean up storage images (files under translationId/ prefix)
    try {
      const { data: files } = await db.storage
        .from(STORAGE_BUCKET)
        .list(id);

      if (files && files.length > 0) {
        const paths = files.map((f) => `${id}/${f.name}`);
        await db.storage.from(STORAGE_BUCKET).remove(paths);
      }
    } catch {
      // Storage cleanup is best-effort — don't block delete
    }

    // Delete the translation row
    const { error: deleteError } = await db
      .from("translations")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return safeError(deleteError, "Failed to delete translation");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return safeError(err, "Failed to delete translation");
  }
}
