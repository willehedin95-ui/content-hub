import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { safeError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";
import { slugify } from "@/lib/slugify";
import { slugifyCategory } from "@/lib/blog-shell";
import { getProjectCustomDomain } from "@/lib/cloudflare-pages";
import { cleanupTranslationStorage } from "@/lib/storage-cleanup";
import type { Language } from "@/types";

export const maxDuration = 30;

// ---------------------------------------------------------------------------
// SEO meta injection helpers (audit 2026-07-07, P2 SEO-injektion)
// - replacer FUNCTIONS so "$" sequences in titles aren't interpreted
// - attribute values are escaped so a `"` can't break og: attributes
// - missing <title>/<meta> tags are inserted before </head> instead of
//   silently no-oping
// ---------------------------------------------------------------------------

function escapeHtmlText(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(v: string): string {
  return escapeHtmlText(v).replace(/"/g, "&quot;");
}

function insertBeforeHeadClose(html: string, tag: string): string {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, () => `${tag}\n</head>`);
  }
  // No </head> - try right after <head ...>; otherwise leave unchanged
  const headOpen = html.match(/<head[^>]*>/i);
  if (headOpen) {
    return html.replace(headOpen[0], () => `${headOpen[0]}\n${tag}`);
  }
  return html;
}

function setTitleTag(html: string, title: string): string {
  const safe = escapeHtmlText(title);
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${safe}</title>`);
  }
  return insertBeforeHeadClose(html, `<title>${safe}</title>`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace content="" of the meta tag identified by attrName="attrValue",
 * or insert the tag if missing. Attribute-order-insensitive: matches the
 * whole tag by its identifying attribute and rewrites its content attribute
 * wherever it sits (content BEFORE property used to slip past and produce
 * duplicate og-tags).
 */
function setMetaContent(
  html: string,
  attrName: "name" | "property",
  attrValue: string,
  value: string
): string {
  const safe = escapeHtmlAttr(value);
  const tagRe = new RegExp(
    `<meta\\s[^>]*${attrName}=["']${escapeRegex(attrValue)}["'][^>]*>`,
    "i"
  );
  const match = html.match(tagRe);
  if (match) {
    const tag = match[0];
    const newTag = /content=("[^"]*"|'[^']*')/i.test(tag)
      ? tag.replace(/content=("[^"]*"|'[^']*')/i, () => `content="${safe}"`)
      : tag.replace(/<meta\s/i, () => `<meta content="${safe}" `);
    return html.replace(tag, () => newTag);
  }
  return insertBeforeHeadClose(html, `<meta ${attrName}="${attrValue}" content="${safe}">`);
}

function injectSeoMeta(html: string, seoTitle?: string, seoDescription?: string): string {
  let out = html;
  if (seoTitle) {
    out = setTitleTag(out, seoTitle);
    out = setMetaContent(out, "property", "og:title", seoTitle);
  }
  if (seoDescription) {
    out = setMetaContent(out, "name", "description", seoDescription);
    out = setMetaContent(out, "property", "og:description", seoDescription);
  }
  return out;
}

interface SlugCheckPage {
  workspace_id?: string;
  content_type?: string;
  blog_category?: string | null;
}

/**
 * Validate + normalize a slug change (audit 2026-07-07, P2 slug + F4):
 * trims, slugifies (å→a etc.) and blocks slugs whose effective CF deploy
 * path (incl. blog category prefix) is already occupied by another
 * PUBLISHED translation on the same language/CF project.
 *
 * Deploy-path comparison avoids false 409s for blog-vs-LP (different
 * paths); rows from ANOTHER workspace only block if they are actually
 * live on the same CF domain (Shopify-published rows don't occupy CF paths).
 */
async function validateSlugChange(
  db: ReturnType<typeof createServerSupabase>,
  translationId: string,
  language: string | null | undefined,
  rawSlug: string,
  myPage: SlugCheckPage | null
): Promise<{ slug: string } | { error: string; status: number }> {
  const clean = slugify(rawSlug);
  if (!clean) {
    return { error: `Invalid slug "${rawSlug}" - must contain letters or digits`, status: 400 };
  }

  if (language) {
    const { data: conflicts, error } = await db
      .from("translations")
      .select("id, published_url, pages!inner(content_type, blog_category, workspace_id)")
      .eq("language", language)
      .eq("status", "published")
      .eq("slug", clean)
      .neq("id", translationId);

    if (error) {
      return { error: `Slug uniqueness check failed: ${error.message}`, status: 500 };
    }

    const myCat =
      myPage?.content_type === "seo_blog" && myPage.blog_category
        ? slugifyCategory(myPage.blog_category)
        : undefined;
    const myPath = myCat ? `${myCat}/${clean}` : clean;
    const cfDomain = getProjectCustomDomain(language as Language);

    for (const conflict of conflicts ?? []) {
      const cPage = conflict.pages as unknown as SlugCheckPage | null;
      const cCat =
        cPage?.content_type === "seo_blog" && cPage.blog_category
          ? slugifyCategory(cPage.blog_category)
          : undefined;
      const cPath = cCat ? `${cCat}/${clean}` : clean;
      if (cPath !== myPath) continue; // different CF path (blog category vs LP)

      const url = (conflict.published_url as string | null) || "";
      const sameWorkspace =
        !myPage?.workspace_id || !cPage?.workspace_id || cPage.workspace_id === myPage.workspace_id;
      const onSameCfDomain = Boolean(url && cfDomain && url.includes(cfDomain));
      // Foreign-workspace rows only block if actually live on our CF domain
      if (!sameWorkspace && !onSameCfDomain) continue;

      return {
        error: `Slug "${clean}" is already published in ${language} (${url || "unknown URL"}). Choose another slug.`,
        status: 409,
      };
    }
  }

  return { slug: clean };
}

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
    .select(`*, pages (id, name, slug, source_url, original_html, workspace_id)`)
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Verify workspace access through parent page
  if (data?.pages?.workspace_id) {
    if (data.pages.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
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
    const workspaceId = await getWorkspaceId();

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
        .eq("workspace_id", workspaceId)
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
        .select("id, status, language, seo_title, seo_description, slug, translated_texts, pages!inner(workspace_id, content_type, blog_category)")
        .eq("id", id)
        .single();

      if (fetchError || !translation) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // Verify workspace access through parent page
      const translationPages = translation.pages as unknown as SlugCheckPage | null;
      if (translationPages?.workspace_id && translationPages.workspace_id !== workspaceId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // Validate slug changes (trim + slugify + uniqueness vs published)
      let cleanSlug: string | null | undefined = undefined;
      if (slug !== undefined && slug !== translation.slug) {
        const slugResult = await validateSlugChange(db, id, translation.language, slug, translationPages);
        if ("error" in slugResult) {
          return NextResponse.json({ error: slugResult.error }, { status: slugResult.status });
        }
        cleanSlug = slugResult.slug;
      }

      // Lightweight SEO meta tag injection via regex (no DOM parsing needed)
      const finalHtml = injectSeoMeta(translated_html, seo_title, seo_description);

      const { data: updated, error: saveError } = await db
        .from("translations")
        .update({
          translated_html: finalHtml,
          translated_texts: translated_texts ?? translation.translated_texts,
          seo_title: seo_title ?? translation.seo_title,
          seo_description: seo_description ?? translation.seo_description,
          slug: cleanSlug ?? translation.slug,
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
        .select(`*, pages (original_html, workspace_id, content_type, blog_category)`)
        .eq("id", id)
        .single();

      if (fetchError || !translation) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // Verify workspace access through parent page
      const legacyPages = translation.pages as unknown as ({ original_html: string } & SlugCheckPage) | null;
      if (legacyPages?.workspace_id && legacyPages.workspace_id !== workspaceId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // Validate slug changes (trim + slugify + uniqueness vs published)
      let legacyCleanSlug: string | undefined = undefined;
      if (slug !== undefined && slug !== translation.slug) {
        const slugResult = await validateSlugChange(db, id, translation.language, slug, legacyPages);
        if ("error" in slugResult) {
          return NextResponse.json({ error: slugResult.error }, { status: slugResult.status });
        }
        legacyCleanSlug = slugResult.slug;
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
          slug: legacyCleanSlug ?? translation.slug,
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
    const workspaceId = await getWorkspaceId();

    // Check translation exists and belongs to current workspace
    const { data: translation, error: fetchError } = await db
      .from("translations")
      .select("id, page_id, language, variant, pages!inner(workspace_id)")
      .eq("id", id)
      .single();

    if (fetchError || !translation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Verify workspace access through parent page
    const delPages = translation.pages as unknown as { workspace_id: string } | null;
    if (delPages?.workspace_id && delPages.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Clean up storage images under BOTH prefixes ({id}/ and page-images/{id}/)
    // with pagination - the old single .list() call left orphans past 100
    // files and never touched page-images/ (audit 2026-07-07, P2 storage).
    try {
      await cleanupTranslationStorage(db, id);
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
