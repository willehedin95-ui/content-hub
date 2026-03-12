import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { extractContent, applyTranslations } from "@/lib/html-parser";
import { sanitizeHtml } from "@/lib/sanitize";
import { safeError } from "@/lib/api-error";
import * as cheerio from "cheerio";
import { isValidUUID } from "@/lib/validation";
import { STORAGE_BUCKET } from "@/lib/constants";

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

      const $ = cheerio.load(translated_html);

      // Server-side sanitization: strip ALL editor artifacts
      $("[data-cc-editor]").remove();
      $("[data-cc-injected]").remove();
      $("[data-cc-el-toolbar]").remove();
      $("[data-cc-exclude-mode]").remove();
      $("[data-cc-editable]").removeAttr("data-cc-editable");
      $("[contenteditable]").removeAttr("contenteditable");
      $("[data-cc-padded]").removeAttr("data-cc-padded");
      $("[data-cc-pad-skip]").removeAttr("data-cc-pad-skip");
      $("[data-cc-hidden]").removeAttr("data-cc-hidden");
      $("[data-cc-selected]").removeAttr("data-cc-selected");
      $("[data-cc-img-highlight]").removeAttr("data-cc-img-highlight").css("outline", "");

      const finalHtml = sanitizeHtml($.html());

      const { data: page, error: saveError } = await db
        .from("pages")
        .update({
          original_html: finalHtml,
          updated_at: new Date().toISOString(),
        })
        .eq("id", realId)
        .select()
        .single();

      if (saveError) {
        return safeError(saveError, "Failed to save source page");
      }

      // Return in translation-like format for compatibility
      return NextResponse.json({
        id,
        page_id: realId,
        translated_html: finalHtml,
        updated_at: page.updated_at,
      });
    }

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

      // Server-side sanitization: strip ALL editor artifacts
      $("[data-cc-editor]").remove();
      $("[data-cc-injected]").remove();
      $("[data-cc-el-toolbar]").remove();
      $("[data-cc-exclude-mode]").remove();
      $("[data-cc-editable]").removeAttr("data-cc-editable");
      $("[contenteditable]").removeAttr("contenteditable");
      $("[data-cc-padded]").removeAttr("data-cc-padded");
      $("[data-cc-pad-skip]").removeAttr("data-cc-pad-skip");
      $("[data-cc-hidden]").removeAttr("data-cc-hidden");
      $("[data-cc-selected]").removeAttr("data-cc-selected");
      $("[data-cc-img-highlight]").removeAttr("data-cc-img-highlight").css("outline", "");

      // Apply SEO meta tags
      if (seo_title) {
        $("title").text(seo_title);
        $('meta[property="og:title"]').attr("content", seo_title);
      }
      if (seo_description) {
        $('meta[name="description"]').attr("content", seo_description);
        $('meta[property="og:description"]').attr("content", seo_description);
      }

      finalHtml = sanitizeHtml($.html());
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
      return safeError(saveError, "Failed to save translation");
    }

    return NextResponse.json(updated);
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
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  // Check translation exists and is not part of an active A/B test
  const { data: translation, error: fetchError } = await db
    .from("translations")
    .select("id, page_id, language, variant")
    .eq("id", id)
    .single();

  if (fetchError || !translation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Block deletion if there's an active A/B test using this translation
  const { data: activeTests } = await db
    .from("ab_tests")
    .select("id")
    .or(`control_id.eq.${id},variant_id.eq.${id}`)
    .in("status", ["draft", "active"]);

  if (activeTests && activeTests.length > 0) {
    return NextResponse.json(
      { error: "Cannot delete — translation is part of an active A/B test. End the test first." },
      { status: 409 }
    );
  }

  // Clean up storage images (files under translationId/ prefix)
  const { data: files } = await db.storage
    .from(STORAGE_BUCKET)
    .list(id);

  if (files && files.length > 0) {
    const paths = files.map((f) => `${id}/${f.name}`);
    await db.storage.from(STORAGE_BUCKET).remove(paths);
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
}
