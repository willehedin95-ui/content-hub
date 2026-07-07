import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { generateBlogImagesAndRepublish } from "@/lib/blog-autopilot";
import { trackedCronRoute } from "@/lib/cron-tracker";

export const maxDuration = 800;

/**
 * Self-healing cron: find blog articles that still have placeholder images
 * (because after() timed out) and regenerate them. Processes 1 article per
 * run to stay within the duration cap.
 *
 * BL6 fixes:
 *  - Retry counter per article via usage_logs (type=blog_images_retry_attempt,
 *    metadata.translation_id). Articles that failed MAX_ATTEMPTS times are
 *    skipped so one permanently-failing article can't block the queue forever.
 *  - Fetches several candidates and picks the first eligible one (old code
 *    used limit 1 → the newest failing article starved everything else).
 *  - Sends the real article title + productSlug to the image generator (old
 *    code sent the slug as title and no product → doginwork articles got
 *    health/wellness prompts).
 */

const MAX_ATTEMPTS = 5;
// Wide candidate window: if the newest placeholder-articles have all
// exhausted their retry cap, older ones must still get their turn.
const CANDIDATE_LIMIT = 25;

async function handleCron(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Find published blog articles that still have placeholder images
  const { data: articles, error: qErr } = await db
    .from("translations")
    .select(`
      id,
      translated_html,
      seo_title,
      language,
      page_id,
      pages!inner (
        id,
        slug,
        name,
        product,
        blog_category,
        workspace_id,
        content_type
      )
    `)
    .eq("status", "published")
    .eq("pages.content_type", "seo_blog")
    .like("translated_html", "%placehold.co%")
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (qErr) {
    console.error("[blog-images-retry] Candidate query failed:", qErr.message);
    return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 });
  }

  if (!articles?.length) {
    return NextResponse.json({
      ok: true,
      action: "none",
      message: "No articles with placeholder images found",
    });
  }

  const skipped: string[] = [];

  for (const article of articles) {
    const page = article.pages as unknown as {
      id: string;
      slug: string;
      name: string | null;
      product: string | null;
      blog_category: string;
      workspace_id: string;
    };

    // Retry cap: count previous attempts for this translation
    const { count: attempts, error: cntErr } = await db
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("type", "blog_images_retry_attempt")
      .eq("metadata->>translation_id", article.id);
    if (cntErr) {
      console.warn("[blog-images-retry] Attempt-count query failed:", cntErr.message);
      // Fail open on the counter (better one extra retry than a dead cron)
    } else if ((attempts ?? 0) >= MAX_ATTEMPTS) {
      skipped.push(page.slug);
      continue;
    }

    // Get content plan data for keyword/brief/product
    const { data: plan } = await db
      .from("blog_content_plan")
      .select("primary_keyword, content_brief, title, product_slug")
      .eq("page_id", page.id)
      .maybeSingle();

    // Record the attempt BEFORE running, so crashes/timeouts still count
    const { error: logErr } = await db.from("usage_logs").insert({
      type: "blog_images_retry_attempt",
      model: "cron",
      cost_usd: 0,
      translation_id: article.id,
      page_id: page.id,
      metadata: {
        translation_id: article.id,
        slug: page.slug,
        workspace_id: page.workspace_id,
        attempt: (attempts ?? 0) + 1,
      },
    });
    if (logErr) {
      console.warn("[blog-images-retry] Failed to log attempt:", logErr.message);
    }

    const articleTitle =
      (article.seo_title as string) || (plan?.title as string) || page.name || page.slug;
    const productSlug = (plan?.product_slug as string) || page.product || undefined;

    console.log(
      `[blog-images-retry] Generating images for "${page.slug}" (attempt ${(attempts ?? 0) + 1}/${MAX_ATTEMPTS})...`
    );

    try {
      await generateBlogImagesAndRepublish({
        translationId: article.id,
        pageId: page.id,
        articleTitle,
        primaryKeyword: plan?.primary_keyword || page.slug,
        contentBrief: plan?.content_brief || "",
        category: page.blog_category || "Halsa",
        slug: page.slug,
        language: article.language,
        workspaceId: page.workspace_id,
        articleHtml: article.translated_html,
        productSlug,
      });

      return NextResponse.json({
        ok: true,
        action: "generated",
        slug: page.slug,
        attempt: (attempts ?? 0) + 1,
        skipped,
        message: `Generated images for "${page.slug}"`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Image generation failed";
      console.error(`[blog-images-retry] Failed for "${page.slug}":`, message);
      return NextResponse.json({
        ok: true,
        action: "error",
        slug: page.slug,
        attempt: (attempts ?? 0) + 1,
        skipped,
        message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    action: "skipped",
    skipped,
    message: `All ${articles.length} candidate(s) have exhausted ${MAX_ATTEMPTS} retry attempts`,
  });
}

// Cron-run tracking wrapper (audit 2026-07-07, I1)
export const GET = trackedCronRoute("blog-images-retry", handleCron);
