import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { publishToShopify } from "@/lib/shopify-blog-publish";
import type { Language } from "@/types";

// Approves a pending_review article and pushes it to its target publish
// surface (Shopify for now; CF Pages path can be added if needed). Called
// from the review UI.

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: trans, error: tErr } = await db
    .from("translations")
    .select("id, slug, seo_title, seo_description, translated_html, created_at, status, pages!inner(id, blog_category, content_type, workspace_id, source_language)")
    .eq("id", id)
    .single();

  if (tErr || !trans) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }
  if (trans.status !== "pending_review") {
    return NextResponse.json(
      { error: `Translation is not pending_review (status=${trans.status})` },
      { status: 400 }
    );
  }

  const page = trans.pages as unknown as {
    workspace_id: string;
    blog_category: string | null;
    content_type: string;
    source_language: string;
  };

  const { data: ws } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", page.workspace_id)
    .single();
  const wsSettings = (ws?.settings ?? {}) as Record<string, unknown>;
  const publishTarget = (wsSettings.blog_publish_target as string) || "cf_pages";

  if (publishTarget !== "shopify") {
    return NextResponse.json(
      { error: "Only Shopify review-approve is supported right now" },
      { status: 501 }
    );
  }

  try {
    const { data: others } = await db
      .from("translations")
      .select("slug, pages!inner(workspace_id, content_type)")
      .eq("language", page.source_language)
      .eq("status", "published")
      .eq("pages.content_type", "seo_blog")
      .eq("pages.workspace_id", page.workspace_id);
    const knownSlugs = (others ?? []).map((t) => t.slug as string);

    const domain = process.env[`CF_PAGES_DOMAIN_${page.source_language.toUpperCase()}`] || "halsobladet.com";

    const result = await publishToShopify({
      articleHtml: trans.translated_html as string,
      slug: trans.slug as string,
      category: page.blog_category || "Kollagen",
      seoTitle: (trans.seo_title as string) || (trans.slug as string),
      seoDescription: (trans.seo_description as string) || "",
      language: page.source_language as Language,
      workspaceId: page.workspace_id,
      sourceBlogDomain: domain,
      createdAt: trans.created_at as string,
      knownSlugs,
    });

    await db
      .from("translations")
      .update({
        status: "published",
        published_url: result.url,
        publish_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Update plan row (no-op if not tied to a plan)
    await db
      .from("blog_content_plan")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
      })
      .eq("workspace_id", page.workspace_id)
      .eq("language", page.source_language)
      .eq("slug", trans.slug);

    return NextResponse.json({ ok: true, url: result.url, articleId: result.articleId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Publish failed";
    await db
      .from("translations")
      .update({ publish_error: `Approve-publish failed: ${msg}` })
      .eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
