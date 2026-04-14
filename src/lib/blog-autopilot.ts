/**
 * Blog autopilot orchestrator.
 * Fully automated: keyword selection → article writing → publishing → notification.
 * No manual steps. Runs as a daily cron.
 */

import { createServerSupabase } from "./supabase-admin";
import { generateBlogArticle, fixHallucinatedUrls, type ArticleRequest } from "./blog-writer";
import { injectInternalLinks, buildLinkTargetsFromDB } from "./internal-links";
import {
  extractArticleBody,
  extractFirstImage,
  extractMetaDescription,
  autoFillAltText,
  injectBlogUTMs,
  wrapInBlogShell,
  fixMetaImageUrls,
  getDefaultBlogConfig,
  slugifyCategory,
  type BlogConfig,
} from "./blog-shell";
import {
  publishPage,
  getProjectCustomDomain,
  deploySitemapAndRobots,
  type PageAnalyticsConfig,
  type DeployFile,
} from "./cloudflare-pages";
import {
  getPublishedBlogArticles,
  deployBlogHomepage,
  deployBlogRssFeed,
} from "./blog-deploy";
import { sendTelegramNotification } from "./telegram";
import {
  isDataForSeoConfigured,
  getKeywordSuggestions,
} from "./dataforseo";
import { submitSitemap, isGscConfigured } from "./gsc";
import type { Language } from "@/types";

// ---------------------------------------------------------------------------
// Content plans are now stored in the blog_content_plan DB table.
// Manage via /seo?tab=content-plan in the Hub UI.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export interface AutopilotResult {
  action: "published" | "skipped" | "error";
  message: string;
  slug?: string;
  url?: string;
  /** Data needed for deferred image generation (only set when action=published) */
  imageJob?: {
    translationId: string;
    pageId: string;
    articleTitle: string;
    primaryKeyword: string;
    contentBrief: string;
    category: string;
    articleHtml: string;
    slug: string;
    language: string;
    workspaceId: string;
  };
}

/** How long a "writing" row can sit before we assume the previous run died mid-generation. */
const STALE_WRITING_MINUTES = 10;

/** Max attempts per cron invocation. Picks a different article each retry. */
const MAX_ATTEMPTS_PER_RUN = 2;

/**
 * Run one cycle of the blog autopilot.
 * Returns what happened (published/skipped/error).
 *
 * Retries up to MAX_ATTEMPTS_PER_RUN times within a single cron invocation,
 * each time picking a different article. This catches transient Claude /
 * DataForSEO / DB failures without losing the whole day.
 */
export async function runBlogAutopilot(
  workspaceId: string,
  language: Language = "sv",
  opts?: { force?: boolean }
): Promise<AutopilotResult> {
  const db = createServerSupabase();

  // Step 0: Self-healing — resume any publishes that were killed mid-flight
  // by a previous Vercel function timeout. Cheap and safe to run every cron.
  await resumeOrphanedPublishes(db, workspaceId, language);

  // Auto-recover articles stuck in "writing" longer than STALE_WRITING_MINUTES.
  // Previous threshold was 2 hours, but maxDuration is 300s so anything stuck
  // for more than ~10 minutes is dead and blocking the next run pointlessly.
  const staleCutoff = new Date(Date.now() - STALE_WRITING_MINUTES * 60 * 1000).toISOString();
  const { data: staleWrites } = await db
    .from("blog_content_plan")
    .update({ status: "planned", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("language", language)
    .eq("status", "writing")
    .is("page_id", null)
    .lt("updated_at", staleCutoff)
    .select("slug");
  if (staleWrites?.length) {
    console.log(`[blog-autopilot] Recovered ${staleWrites.length} stale "writing" articles (>${STALE_WRITING_MINUTES}m): ${staleWrites.map(s => s.slug).join(", ")}`);
  }

  // Check rate: max 2 articles per calendar day (UTC) per language (skip with force)
  if (!opts?.force) {
    const todayUTC = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const startOfDay = `${todayUTC}T00:00:00.000Z`;
    const { count: recentCount } = await db
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("content_type", "seo_blog")
      .eq("source_language", language)
      .gte("created_at", startOfDay);

    if ((recentCount ?? 0) >= 2) {
      return {
        action: "skipped",
        message: `Already published 2 ${language.toUpperCase()} blog articles today (UTC). Max 2/day per language.`,
      };
    }
  }

  // Retry loop: up to MAX_ATTEMPTS_PER_RUN attempts, each time picking a
  // different article. Stop on first success or on a permanent skip
  // (no articles available / no blog domain configured).
  let lastResult: AutopilotResult | null = null;
  const triedSlugs: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_RUN; attempt++) {
    const result = await writeOneArticle(db, workspaceId, language, triedSlugs);
    lastResult = result;

    // Success or permanent skip — return immediately
    if (result.action === "published") {
      if (attempt > 1) {
        console.log(`[blog-autopilot] Succeeded on attempt ${attempt}/${MAX_ATTEMPTS_PER_RUN}`);
      }
      return result;
    }
    if (result.action === "skipped") {
      return result;
    }

    // Transient error — track the slug and try a different one
    if (result.slug) {
      triedSlugs.push(result.slug);
    }
    if (attempt < MAX_ATTEMPTS_PER_RUN) {
      console.warn(`[blog-autopilot] Attempt ${attempt}/${MAX_ATTEMPTS_PER_RUN} failed: ${result.message}. Retrying with a different article.`);
    }
  }

  return lastResult ?? {
    action: "error",
    message: "Blog autopilot exited without attempting any article",
  };
}

/**
 * Write and publish a single article. Returns the result of the attempt.
 * On failure the plan row is reverted to "planned" so it can be retried later.
 */
async function writeOneArticle(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  language: Language,
  excludeSlugs: string[] = []
): Promise<AutopilotResult> {
  // Find next article to write
  const nextArticle = await pickNextArticle(db, workspaceId, language, excludeSlugs);
  if (!nextArticle) {
    return {
      action: "skipped",
      message: "No articles to write. Content plan complete and no new keyword opportunities found.",
    };
  }

  // Get blog domain
  const blogDomain = getProjectCustomDomain(language);
  if (!blogDomain) {
    return {
      action: "error",
      message: `No blog domain configured for language: ${language}`,
    };
  }

  console.log(`[blog-autopilot] Writing article: "${nextArticle.title}" (${nextArticle.slug})`);

  // Generate the article
  let article;
  try {
    article = await generateBlogArticle({
      ...nextArticle,
      language,
      blogDomain,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Article generation failed";
    console.error("[blog-autopilot] Generation failed:", msg);
    // Reset content plan status so article can be retried
    await revertToPlanStatus(db, workspaceId, language, nextArticle.slug);
    return { action: "error", message: `Article generation failed: ${msg}`, slug: nextArticle.slug };
  }

  console.log(`[blog-autopilot] Generated ${article.wordCount} words, cost: $${article.cost.toFixed(4)}`);

  // Post-process: fix any hallucinated URLs that Claude might still produce
  article.html = fixHallucinatedUrls(article.html);

  // Post-process: inject internal links that Claude may have missed
  try {
    const linkTargets = await buildLinkTargetsFromDB(language, nextArticle.slug);
    if (linkTargets.length > 0) {
      const { html: linkedHtml, linksInjected } = injectInternalLinks(
        article.html,
        linkTargets,
        nextArticle.slug
      );
      if (linksInjected > 0) {
        article.html = linkedHtml;
        console.log(`[blog-autopilot] Injected ${linksInjected} internal links`);
      }
    }
  } catch (err) {
    console.warn("[blog-autopilot] Internal link injection failed (non-critical):", err);
  }

  // Inject real product photo from product bank before the CTA box (fast, no AI)
  // AI image generation is deferred to background via after() — see cron route
  let finalHtml = article.html;
  try {
    const { injectProductImage } = await import("./blog-images");
    finalHtml = await injectProductImage(finalHtml, nextArticle.productSlug);
  } catch (err) {
    console.warn("[blog-autopilot] Product image injection failed (non-critical):", err);
  }

  // Create page record
  const { data: page, error: pageError } = await db
    .from("pages")
    .insert({
      name: nextArticle.title,
      slug: nextArticle.slug,
      product: nextArticle.productSlug,
      page_type: "blog",
      source_url: "",
      original_html: finalHtml,
      source_language: language,
      workspace_id: workspaceId,
      content_type: "seo_blog",
      blog_category: nextArticle.category,
      blog_featured_image_url: extractFirstImage(finalHtml) || null,
    })
    .select("id")
    .single();

  if (pageError || !page) {
    console.error("[blog-autopilot] Failed to create page:", pageError);
    await revertToPlanStatus(db, workspaceId, language, nextArticle.slug);
    return { action: "error", message: `DB error creating page: ${pageError?.message}`, slug: nextArticle.slug };
  }

  // Create translation record
  const { data: translation, error: transError } = await db
    .from("translations")
    .insert({
      page_id: page.id,
      language,
      slug: nextArticle.slug,
      seo_title: article.seoTitle,
      seo_description: article.seoDescription,
      translated_html: finalHtml,
      status: "draft",
    })
    .select("id, created_at")
    .single();

  if (transError || !translation) {
    console.error("[blog-autopilot] Failed to create translation:", transError);
    // Clean up orphaned page row so the retry attempt can recreate it cleanly
    await db.from("pages").delete().eq("id", page.id);
    await revertToPlanStatus(db, workspaceId, language, nextArticle.slug);
    return { action: "error", message: `DB error creating translation: ${transError?.message}`, slug: nextArticle.slug };
  }

  // Publish directly (no cookie context needed).
  // NOTE: The plan row is intentionally NOT marked "published" until publish
  // actually succeeds — otherwise a publish failure leaves the plan in a stuck
  // state where revertToPlanStatus can't recover it.
  let publishUrl: string;
  try {
    publishUrl = await publishBlogArticle(
      finalHtml,
      nextArticle.slug,
      nextArticle.category,
      article.seoTitle,
      article.seoDescription,
      language,
      workspaceId,
      translation.id,
      translation.created_at,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Publish failed";
    console.error("[blog-autopilot] Publish failed:", msg);
    // Update translation status to error
    await db
      .from("translations")
      .update({ status: "error", publish_error: msg })
      .eq("id", translation.id);
    // Clean up orphaned page + translation so a retry can start fresh
    await db.from("translations").delete().eq("id", translation.id);
    await db.from("pages").delete().eq("id", page.id);
    await revertToPlanStatus(db, workspaceId, language, nextArticle.slug);
    return { action: "error", message: `Publish failed: ${msg}`, slug: nextArticle.slug };
  }

  // Publish succeeded — now mark the plan row as published
  await db
    .from("blog_content_plan")
    .update({
      status: "published",
      page_id: page.id,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("language", language)
    .eq("slug", nextArticle.slug);

  // Update translation status
  await db
    .from("translations")
    .update({
      status: "published",
      published_url: publishUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", translation.id);

  // Determine source for usage log: check if a blog_content_plan row exists for this slug
  const { count: planCount } = await db
    .from("blog_content_plan")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("language", language)
    .eq("slug", nextArticle.slug);

  const articleSource = (planCount ?? 0) > 0 ? "content_plan" : "keyword_research";

  // Log cost (article generation only — images logged separately in blog-images.ts)
  await db.from("usage_logs").insert({
    type: "blog_autopilot",
    model: "claude-sonnet",
    cost_usd: article.cost,
    metadata: {
      slug: nextArticle.slug,
      word_count: article.wordCount,
      source: articleSource,
    },
  });

  // Fire-and-forget: homepage, RSS, sitemap, GSC submission, retroactive links
  deployBlogHomepage(language).catch((err) =>
    console.warn("[blog-autopilot] Homepage deploy failed:", err)
  );
  deployBlogRssFeed(language).catch((err) =>
    console.warn("[blog-autopilot] RSS deploy failed:", err)
  );
  retroactivelyUpdateLinks(language, workspaceId).catch((err) =>
    console.warn("[blog-autopilot] Retroactive link update failed:", err)
  );
  deploySitemapAndRobots(language)
    .then(() => {
      // Submit sitemap to Google Search Console so Google discovers new pages faster
      if (isGscConfigured()) {
        const domain = getProjectCustomDomain(language);
        if (domain) {
          const sitemapUrl = `https://${domain}/sitemap.xml`;
          const property = `https://${domain}/`;
          submitSitemap(property, sitemapUrl).catch((err) =>
            console.warn("[blog-autopilot] GSC sitemap submit failed:", err)
          );
        }
      }
    })
    .catch((err) =>
      console.warn("[blog-autopilot] Sitemap deploy failed:", err)
    );

  // Send Telegram notification
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      await sendTelegramNotification(
        chatId,
        `📝 *Blog article published*\n\n` +
          `*${escTg(article.seoTitle)}*\n` +
          `Category: ${escTg(nextArticle.category)}\n` +
          `Words: ${article.wordCount}\n` +
          `Cost: $${article.cost.toFixed(4)}\n` +
          `Images: generating in background\\.\\.\\.\n\n` +
          `[Read article](${publishUrl})`
      );
    }
  } catch {
    // Non-critical — don't fail the whole operation
    console.warn("[blog-autopilot] Telegram notification failed");
  }

  console.log(`[blog-autopilot] Published: ${publishUrl}`);
  return {
    action: "published",
    message: `Published "${article.seoTitle}" (${article.wordCount} words)`,
    slug: nextArticle.slug,
    url: publishUrl,
    imageJob: {
      translationId: translation.id,
      pageId: page.id,
      articleTitle: article.seoTitle,
      primaryKeyword: nextArticle.primaryKeyword,
      contentBrief: nextArticle.contentBrief,
      category: nextArticle.category,
      articleHtml: article.html,
      slug: nextArticle.slug,
      language,
      workspaceId,
    },
  };
}

// ---------------------------------------------------------------------------
// Article selection
// ---------------------------------------------------------------------------

async function pickNextArticle(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  language: Language,
  excludeSlugs: string[] = []
): Promise<ArticleRequest | null> {
  const blogDomain = getProjectCustomDomain(language) || "";

  // Get workspace default product slug as fallback
  const { data: wsData } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();
  const wsProductSlug = (wsData?.settings as Record<string, unknown> | null)?.default_product as string | undefined;

  // 1. Try the blog_content_plan table: pick the highest-priority "planned" article
  //    (skipping any slugs we've already failed on in this run)
  let plannedQuery = db
    .from("blog_content_plan")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("language", language)
    .eq("status", "planned")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  if (excludeSlugs.length > 0) {
    plannedQuery = plannedQuery.not("slug", "in", `(${excludeSlugs.map((s) => `"${s}"`).join(",")})`);
  }
  const { data: planned } = await plannedQuery.maybeSingle();

  if (planned) {
    // Mark as "writing" so concurrent runs don't pick the same article
    await db
      .from("blog_content_plan")
      .update({ status: "writing", updated_at: new Date().toISOString() })
      .eq("id", planned.id);

    return {
      title: planned.title,
      slug: planned.slug,
      category: planned.category || "General",
      templateId: planned.template_id || "problem-solution",
      primaryKeyword: planned.primary_keyword,
      secondaryKeywords: planned.secondary_keywords ?? [],
      wordCount: planned.word_count || "2000-3000",
      contentBrief: planned.content_brief || `Write a comprehensive article about "${planned.primary_keyword}".`,
      productSlug: planned.product_slug || wsProductSlug || "happysleep",
      internalLinkSlugs: planned.internal_link_slugs ?? [],
      language,
      blogDomain,
    };
  }

  // 2. Content plan exhausted — fall back to DataForSEO keyword research
  if (!isDataForSeoConfigured()) {
    return null;
  }

  // Get existing blog slugs for this language to avoid duplicates
  const { data: existingPages } = await db
    .from("pages")
    .select("slug")
    .eq("workspace_id", workspaceId)
    .eq("content_type", "seo_blog")
    .eq("source_language", language);

  const existingSlugs = new Set((existingPages ?? []).map((p) => p.slug));
  // Also skip slugs we've already failed on in this retry loop
  for (const s of excludeSlugs) existingSlugs.add(s);

  try {
    const market = language === "sv" ? "SE" : language === "da" ? "DK" : "NO";
    const seeds =
      language === "sv"
        ? ["sömn tips", "bästa kudden", "kollagen hud", "sömnproblem"]
        : language === "da"
          ? ["bedste pude", "kollagen tilskud", "søvn tips"]
          : ["beste pute", "kollagen tilskudd", "søvn tips"];

    const { suggestions } = await getKeywordSuggestions(seeds, market);

    // Filter: volume > 200, competition index < 50, not already covered
    const candidates = suggestions
      .filter(
        (s) =>
          (s.searchVolume ?? 0) > 200 &&
          (s.competitionIndex ?? 100) < 50 &&
          !existingSlugs.has(slugifyKeyword(s.keyword))
      )
      .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
      .slice(0, 1);

    if (!candidates.length) return null;

    const kw = candidates[0];
    const slug = slugifyKeyword(kw.keyword);
    const isCollagen = /kollagen|collagen|hud|hår|naglar|skönhet/i.test(kw.keyword);
    const isSleep = /sömn|kudde|pude|søvn|nacke|nack|rygg/i.test(kw.keyword);

    // Language-specific category names and fallback internal links
    const sleepCategory = language === "da" ? "Sov Bedre" : language === "no" ? "Sov Bedre" : "Sov Bättre";
    const healthCategory = language === "da" ? "Sundhed" : language === "no" ? "Helse" : "Hälsa";
    const fallbackSlug = language === "da" ? "bedste-nakkepude" : language === "no" ? "beste-nakkepute" : "basta-kudden";
    const collagenFallbackSlug = language === "da" ? "kollagentilskud-guide" : language === "no" ? "kollagentilskudd-guide" : "kollagentillskott-guide";

    return {
      title: capitalizeFirst(kw.keyword) + " 2026",
      slug,
      category: isCollagen ? healthCategory : isSleep ? sleepCategory : healthCategory,
      templateId: "problem-solution",
      primaryKeyword: kw.keyword,
      secondaryKeywords: [],
      wordCount: "2000-3000",
      contentBrief: `Write a comprehensive article about "${kw.keyword}". This keyword has ${kw.searchVolume} monthly searches with ${kw.competition || "unknown"} competition. Cover the topic thoroughly with practical advice, scientific backing, and product recommendations where relevant.`,
      productSlug: isCollagen ? "hydro13" : (wsProductSlug || "happysleep"),
      internalLinkSlugs: [isCollagen ? collagenFallbackSlug : fallbackSlug],
      language,
      blogDomain,
    };
  } catch (err) {
    console.warn("[blog-autopilot] DataForSEO keyword lookup failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Direct publish (bypasses cookie-based API route)
// ---------------------------------------------------------------------------

async function publishBlogArticle(
  articleHtml: string,
  slug: string,
  category: string,
  seoTitle: string,
  seoDescription: string,
  language: Language,
  workspaceId: string,
  translationId: string,
  createdAt: string
): Promise<string> {
  const db = createServerSupabase();

  // Get workspace settings for analytics
  const { data: workspace } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();

  const settings = (workspace?.settings ?? {}) as Record<string, unknown>;
  const blogConfig = (settings.blog_config as BlogConfig) ?? getDefaultBlogConfig();
  const domain = getProjectCustomDomain(language);
  const baseUrl = domain ? `https://${domain}` : "";

  // Extract and wrap in blog shell
  const { bodyHtml: rawBodyHtml, headHtml } = extractArticleBody(articleHtml);
  const bodyHtmlAlt = autoFillAltText(rawBodyHtml, seoTitle);
  const bodyHtml = injectBlogUTMs(bodyHtmlAlt, slug);
  const relatedArticles = await getPublishedBlogArticles(language, slug);
  const featuredImage = extractFirstImage(bodyHtml);

  const categorySlug = slugifyCategory(category);
  const deploySlug = categorySlug ? `${categorySlug}/${slug}` : slug;

  const wrappedHtml = wrapInBlogShell({
    articleBodyHtml: bodyHtml,
    articleHeadHtml: headHtml,
    seoTitle,
    seoDescription: seoDescription || extractMetaDescription(bodyHtml),
    slug,
    language,
    blogConfig,
    relatedArticles,
    featuredImageUrl: featuredImage,
    blogCategory: category,
    publishedAt: createdAt,
    updatedAt: new Date().toISOString(),
    baseUrl,
  });

  // Build analytics config
  const ga4Ids = (settings.ga4_measurement_ids as Record<string, string>) ?? {};
  const excludedIps = (settings.excluded_ips as string[]) ?? [];
  const analytics: PageAnalyticsConfig = {
    ga4MeasurementId: ga4Ids[language] || undefined,
    clarityProjectId:
      (settings.clarity_project_ids as Record<string, string>)?.[language] ||
      (settings.clarity_project_id as string) ||
      undefined,
    shopifyDomains: ((settings.shopify_domains as string) || "")
      .split(",")
      .map((d: string) => d.trim())
      .filter(Boolean),
    metaPixelId: (settings.meta_pixel_id as string) || undefined,
    hubUrl: process.env.APP_URL || undefined,
    excludedIps: excludedIps.length > 0 ? excludedIps : undefined,
    contentType: "seo_blog",
  };

  // Optimize images: download → convert to WebP → embed in deployment
  let finalHtml = wrappedHtml;
  const deployFiles: DeployFile[] = [];
  try {
    const { optimizeImages } = await import("./image-optimizer");
    const imgResult = await optimizeImages(wrappedHtml, deploySlug);
    if (imgResult.stats.optimized > 0) {
      finalHtml = wrappedHtml;
      for (const [originalUrl, deployPath] of imgResult.urlMap) {
        finalHtml = finalHtml.split(originalUrl).join(deployPath);
      }
      for (const img of imgResult.images) {
        deployFiles.push({ path: img.deployPath, sha1: img.sha1, body: new Uint8Array(img.buffer) });
      }
      console.log(`[blog-publish] Optimized ${imgResult.stats.optimized} images, saved ${(imgResult.stats.savedBytes / 1024).toFixed(0)}KB`);
    }
  } catch (err) {
    console.warn("[blog-publish] Image optimization failed, using original URLs:", err);
  }

  // Fix OG/Twitter/JSON-LD image URLs that image optimizer made relative
  finalHtml = fixMetaImageUrls(finalHtml, baseUrl);

  // Deploy to Cloudflare Pages
  const result = await publishPage(finalHtml, deploySlug, language, deployFiles, undefined, analytics);
  return result.url.trim();
}

// ---------------------------------------------------------------------------
// Self-healing: resume orphaned publishes from killed Vercel functions
// ---------------------------------------------------------------------------

/**
 * Find blog translations that have HTML but no `published_url`. These are
 * the remains of Vercel function terminations (maxDuration killed the process
 * mid-publish). Either:
 *   a) The CF upload already succeeded and only the DB update was killed
 *      → backfill the URL, no republish needed.
 *   b) The CF upload never ran or was killed mid-stream
 *      → republish the already-generated HTML.
 *
 * Cheap to run (one query per language per cron tick). Always safe.
 */
async function resumeOrphanedPublishes(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  language: Language
): Promise<void> {
  const { data: orphans } = await db
    .from("translations")
    .select(
      "id, slug, seo_title, seo_description, translated_html, created_at, pages!inner(id, blog_category, content_type, workspace_id, source_language)"
    )
    .eq("language", language)
    .eq("pages.workspace_id", workspaceId)
    .eq("pages.content_type", "seo_blog")
    .eq("pages.source_language", language)
    .is("published_url", null)
    .not("translated_html", "is", null);

  if (!orphans?.length) return;

  const domain = getProjectCustomDomain(language);
  if (!domain) return;

  console.log(
    `[blog-autopilot] Found ${orphans.length} orphaned translations (killed mid-publish), resuming`
  );

  for (const orphan of orphans) {
    const page = orphan.pages as unknown as { id: string; blog_category?: string };
    const categorySlug = slugifyCategory(page?.blog_category || "");
    const deployPath = categorySlug ? `${categorySlug}/${orphan.slug}` : orphan.slug;
    const expectedUrl = `https://${domain}/${deployPath}`;

    // Check if the article is already live on CF Pages
    // (publish succeeded but DB update was killed — the common case)
    let isLive = false;
    try {
      const res = await fetch(expectedUrl, { method: "HEAD", redirect: "follow" });
      isLive = res.status === 200;
    } catch {
      // Network error — fall through and republish
    }

    if (isLive) {
      await db
        .from("translations")
        .update({
          status: "published",
          published_url: expectedUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orphan.id);
      await db
        .from("blog_content_plan")
        .update({
          status: "published",
          page_id: page.id,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("language", language)
        .eq("slug", orphan.slug);
      console.log(
        `[blog-autopilot] Backfilled URL for already-live article: ${expectedUrl}`
      );
      continue;
    }

    // Not live — republish from the HTML we already have
    if (!orphan.translated_html) continue;
    try {
      const url = await publishBlogArticle(
        orphan.translated_html,
        orphan.slug,
        page?.blog_category || "",
        orphan.seo_title || orphan.slug,
        orphan.seo_description || "",
        language,
        workspaceId,
        orphan.id,
        orphan.created_at
      );
      await db
        .from("translations")
        .update({
          status: "published",
          published_url: url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orphan.id);
      await db
        .from("blog_content_plan")
        .update({
          status: "published",
          page_id: page.id,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("language", language)
        .eq("slug", orphan.slug);
      console.log(`[blog-autopilot] Republished orphaned article: ${url}`);
    } catch (err) {
      console.error(
        `[blog-autopilot] Resume failed for "${orphan.slug}":`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Retroactive internal link update
// ---------------------------------------------------------------------------

/**
 * After publishing a new article, scan all existing published articles
 * and inject any missing internal links. Re-publishes modified articles.
 * Called fire-and-forget — failures are logged but don't block anything.
 */
async function retroactivelyUpdateLinks(
  language: Language,
  workspaceId: string
): Promise<void> {
  const db = createServerSupabase();

  // Get all published blog translations
  const { data: translations } = await db
    .from("translations")
    .select(
      "id, slug, seo_title, seo_description, translated_html, created_at, pages!inner(id, blog_category, content_type, workspace_id)"
    )
    .eq("language", language)
    .eq("status", "published")
    .eq("pages.content_type", "seo_blog")
    .eq("pages.workspace_id", workspaceId);

  if (!translations?.length || translations.length < 2) return;

  // Build link targets for ALL published articles
  const allTargets = await buildLinkTargetsFromDB(language);
  if (!allTargets.length) return;

  let updated = 0;

  for (const trans of translations) {
    const html = trans.translated_html;
    if (!html) continue;

    const { html: linkedHtml, linksInjected } = injectInternalLinks(
      html,
      allTargets,
      trans.slug
    );

    if (linksInjected === 0) continue;

    console.log(
      `[internal-links] Injected ${linksInjected} links into "${trans.slug}"`
    );

    // Save updated HTML to DB
    await db
      .from("translations")
      .update({ translated_html: linkedHtml })
      .eq("id", trans.id);

    // Re-publish the article with updated HTML
    const page = trans.pages as unknown as { blog_category?: string };
    const category = page?.blog_category || "";

    try {
      await publishBlogArticle(
        linkedHtml,
        trans.slug,
        category,
        trans.seo_title || trans.slug,
        trans.seo_description || "",
        language,
        workspaceId,
        trans.id,
        trans.created_at
      );
      updated++;
    } catch (err) {
      console.error(`[internal-links] Re-publish failed for "${trans.slug}":`, err);
    }
  }

  if (updated > 0) {
    console.log(
      `[internal-links] Retroactively updated ${updated} articles with new internal links`
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugifyKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Deferred image generation — runs in background via after()
// ---------------------------------------------------------------------------

/**
 * Generate AI images for a blog article, replace placeholders, and republish.
 * Called from the cron route via after() so it doesn't block the response.
 */
export async function generateBlogImagesAndRepublish(job: NonNullable<AutopilotResult["imageJob"]>): Promise<void> {
  const db = createServerSupabase();

  try {
    const { generateBlogImages, replacePlaceholderImages } = await import("./blog-images");

    console.log(`[blog-images-bg] Generating images for "${job.slug}"...`);
    const imageResult = await generateBlogImages({
      articleTitle: job.articleTitle,
      primaryKeyword: job.primaryKeyword,
      contentBrief: job.contentBrief,
      category: job.category,
      articleHtml: job.articleHtml,
      slug: job.slug,
    });

    if (imageResult.generated === 0) {
      console.log(`[blog-images-bg] No images generated for "${job.slug}"`);
      return;
    }

    console.log(`[blog-images-bg] Generated ${imageResult.generated} images for "${job.slug}", cost: $${imageResult.costUsd.toFixed(3)}`);

    // Get current translation HTML (may have been modified by internal link injection)
    const { data: trans } = await db
      .from("translations")
      .select("translated_html, seo_title, seo_description, created_at")
      .eq("id", job.translationId)
      .single();

    if (!trans?.translated_html) {
      console.error(`[blog-images-bg] Translation ${job.translationId} not found`);
      return;
    }

    // Replace placeholder images in the HTML
    const updatedHtml = replacePlaceholderImages(trans.translated_html, imageResult.urlMap);

    // Update DB
    await db
      .from("translations")
      .update({ translated_html: updatedHtml, updated_at: new Date().toISOString() })
      .eq("id", job.translationId);

    await db
      .from("pages")
      .update({
        original_html: updatedHtml,
        blog_featured_image_url: extractFirstImage(updatedHtml) || null,
      })
      .eq("id", job.pageId);

    // Re-publish with images
    const lang = job.language as Language;
    const publishUrl = await publishBlogArticle(
      updatedHtml,
      job.slug,
      job.category,
      trans.seo_title || job.slug,
      trans.seo_description || "",
      lang,
      job.workspaceId,
      job.translationId,
      trans.created_at,
    );

    console.log(`[blog-images-bg] Republished with images: ${publishUrl}`);

    // Regenerate homepage to update featured image
    deployBlogHomepage(lang).catch(() => {});
  } catch (err) {
    // Non-critical — article is already published with placeholder images
    console.error(`[blog-images-bg] Failed for "${job.slug}":`, err instanceof Error ? err.message : err);
  }
}

/** Revert a blog_content_plan row from "writing" back to "planned" on failure */
async function revertToPlanStatus(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  language: string,
  slug: string
): Promise<void> {
  await db
    .from("blog_content_plan")
    .update({ status: "planned", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("language", language)
    .eq("slug", slug)
    .eq("status", "writing")
    .is("page_id", null);
}

/** Escape special Markdown characters for Telegram */
function escTg(s: string): string {
  return s.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
