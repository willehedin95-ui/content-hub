import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { publishBlogArticle, generateBlogImagesAndRepublish } from "@/lib/blog-autopilot";
import { deployBlogHomepage, deployBlogRssFeed } from "@/lib/blog-deploy";
import { deploySitemapAndRobots } from "@/lib/cloudflare-pages";
import { runDeployStep } from "@/lib/deploy-failures";
import type { Language } from "@/types";

// Approves a pending_review article and pushes it to its target publish
// surface. Uses publishBlogArticle — the same path the autopilot uses — so
// both CF Pages AND Shopify workspaces are supported (BL5: the old version
// 501'd for CF Pages even though the happysleep gate was enabled).
//
// If the article still contains placehold.co images, AI image generation is
// triggered in the background after publish (via after()). If it doesn't
// finish, the article stays live with placeholders and the blog-images-retry
// cron picks it up (the placeholder itself is the pending flag).

export const maxDuration = 800;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: trans, error: tErr } = await db
    .from("translations")
    .select("id, slug, seo_title, seo_description, translated_html, created_at, status, pages!inner(id, blog_category, content_type, workspace_id, source_language, product)")
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
  if (!trans.translated_html) {
    return NextResponse.json({ error: "Translation has no HTML" }, { status: 400 });
  }

  const page = trans.pages as unknown as {
    id: string;
    workspace_id: string;
    blog_category: string | null;
    content_type: string;
    source_language: string;
    product: string | null;
  };
  const language = page.source_language as Language;

  // Plan row: template id (for correct Product-schema gating in publish) +
  // keyword/brief/product for the deferred image job.
  const { data: plan } = await db
    .from("blog_content_plan")
    .select("primary_keyword, content_brief, template_id, product_slug")
    .eq("workspace_id", page.workspace_id)
    .eq("language", language)
    .eq("slug", trans.slug)
    .maybeSingle();

  try {
    const publishUrl = await publishBlogArticle(
      trans.translated_html as string,
      trans.slug as string,
      page.blog_category || "",
      (trans.seo_title as string) || (trans.slug as string),
      (trans.seo_description as string) || "",
      language,
      page.workspace_id,
      id,
      trans.created_at as string,
      (plan?.template_id as string) || undefined
    );

    const { error: transUpdErr } = await db
      .from("translations")
      .update({
        status: "published",
        published_url: publishUrl,
        publish_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (transUpdErr) {
      console.error("[review-approve] Failed to update translation:", transUpdErr.message);
    }

    // Update plan row (no-op if not tied to a plan). page_id keeps the plan
    // row linked so stale-recovery/regen can't duplicate the article.
    const { error: planUpdErr } = await db
      .from("blog_content_plan")
      .update({
        status: "published",
        page_id: page.id,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", page.workspace_id)
      .eq("language", language)
      .eq("slug", trans.slug);
    if (planUpdErr) {
      console.error("[review-approve] Failed to update plan row:", planUpdErr.message);
    }

    // M8: CF Pages targets need the site-level tail after a publish —
    // publishBlogArticle only deploys the article itself, so without this
    // the homepage/RSS/sitemap silently go stale for approve-published
    // articles. Shopify owns these surfaces natively (same skip as the
    // autopilot). runDeployStep records failures + alerts — errors never
    // fail the approve response.
    const { data: wsRow } = await db
      .from("workspaces")
      .select("settings")
      .eq("id", page.workspace_id)
      .single();
    const publishTarget =
      (((wsRow?.settings as Record<string, unknown> | null)?.blog_publish_target as
        | string
        | undefined)) || "cf_pages";
    if (publishTarget !== "shopify") {
      const deployContext = { language, workspaceId: page.workspace_id, targetId: id };
      await runDeployStep("blog_homepage", deployContext, () => deployBlogHomepage(language));
      await runDeployStep("blog_rss", deployContext, () => deployBlogRssFeed(language));
      await runDeployStep("sitemap", deployContext, () => deploySitemapAndRobots(language));
    }

    // BL5: don't leave placehold.co images live — generate real images in
    // the background after the response is sent. blog-images-retry cron is
    // the fallback if this gets killed.
    const html = trans.translated_html as string;
    if (html.includes("placehold.co")) {
      const imageJob = {
        translationId: id,
        pageId: page.id,
        articleTitle: (trans.seo_title as string) || (trans.slug as string),
        primaryKeyword: (plan?.primary_keyword as string) || (trans.slug as string),
        contentBrief: (plan?.content_brief as string) || "",
        category: page.blog_category || "",
        articleHtml: html,
        slug: trans.slug as string,
        language,
        workspaceId: page.workspace_id,
        productSlug: (plan?.product_slug as string) || page.product || undefined,
      };
      after(async () => {
        await generateBlogImagesAndRepublish(imageJob);
      });
    }

    return NextResponse.json({ ok: true, url: publishUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Publish failed";
    const { error: errUpdErr } = await db
      .from("translations")
      .update({ publish_error: `Approve-publish failed: ${msg}` })
      .eq("id", id);
    if (errUpdErr) {
      console.error("[review-approve] Failed to record publish_error:", errUpdErr.message);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
