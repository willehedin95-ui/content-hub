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
import { runDeployStep } from "./deploy-failures";
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
    productSlug?: string;
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

  // Check rate: cap per calendar day (UTC) per language. Default 2 keeps
  // existing HappySleep behavior; workspaces can set
  // `blog_autopilot_max_per_day` in settings to override (e.g. Hydro13 at 1
  // since get-renew.com is a fresh domain where scaled-content risk is higher).
  if (!opts?.force) {
    const { data: wsForRate } = await db
      .from("workspaces")
      .select("settings")
      .eq("id", workspaceId)
      .single();
    const maxPerDay = Math.max(
      0,
      Number(
        (wsForRate?.settings as Record<string, unknown> | null)?.blog_autopilot_max_per_day ?? 2
      )
    );

    const todayUTC = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const startOfDay = `${todayUTC}T00:00:00.000Z`;
    const { count: recentCount } = await db
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("content_type", "seo_blog")
      .eq("source_language", language)
      .gte("created_at", startOfDay);

    if ((recentCount ?? 0) >= maxPerDay) {
      return {
        action: "skipped",
        message: `Already published ${recentCount} ${language.toUpperCase()} blog article(s) today (UTC). Max ${maxPerDay}/day per language.`,
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

  // Workspace settings — used for multiple opt-in flags (research citations,
  // soft gate, etc.). Fetched once at the start of the write cycle.
  const { data: wsForRes } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();
  const settings = (wsForRes?.settings ?? {}) as Record<string, unknown>;
  const enableResearchCitations = settings.blog_research_citations === true;
  // Default ON for natural-Swedish second-pass; opt out via setting=false.
  const naturalSwedishPass = settings.blog_natural_swedish_pass !== false;

  // Generate the article
  let article;
  try {
    article = await generateBlogArticle({
      ...nextArticle,
      language,
      blogDomain,
      enableResearchCitations,
      naturalSwedishPass,
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

  // Inject multi-network affiliate links on competitor brand mentions.
  // Pulls joined-status programs from affiliate_programs DB table, generates
  // deep links via Awin or Adtraction APIs (cached after first call).
  // No-op if no joined brands or networks return errors.
  try {
    const { injectAffiliateLinks } = await import("./affiliate/inject-links");
    const result = await injectAffiliateLinks(finalHtml, { clickRef: nextArticle.slug });
    if (result.injected > 0) {
      finalHtml = result.html;
      console.log(
        `[blog-autopilot] Injected ${result.injected} affiliate links: ${result.brands.map((b) => `${b.brand}(${b.network})`).join(", ")}`
      );
    }
  } catch (err) {
    console.warn("[blog-autopilot] Affiliate link injection failed (non-critical):", err);
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

  // Soft quality gate: if enabled for the workspace, run static checks on
  // the generated HTML before publishing. Failures park the article in
  // `pending_review` and ping the operator on Telegram. Opt-in via
  // `blog_soft_gate_enabled` — default off to preserve backward-compat.
  if (settings.blog_soft_gate_enabled === true) {
    const { runSoftGate } = await import("./soft-gate");
    const { VERIFIED_EXTERNAL_LINKS, PRODUCT_ALLOWED_DOMAINS } = await import("./blog-writer");
    const linksForLang = VERIFIED_EXTERNAL_LINKS[language as "sv" | "da" | "no"] ?? {};
    const verifiedDomains = Object.values(linksForLang)
      .map((link) => {
        try {
          return new URL(link.url).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    // Merge product-specific allowed domains (e.g. doginwork blog links to
    // SKK, Jordbruksverket etc. - not on the health-YMYL list above).
    const productExtras = PRODUCT_ALLOWED_DOMAINS[nextArticle.productSlug] ?? [];
    verifiedDomains.push(...productExtras);

    // Known slugs on the target blog — for internal link resolvability check
    const { data: allTrans } = await db
      .from("translations")
      .select("slug, pages!inner(workspace_id, content_type)")
      .eq("language", language)
      .eq("status", "published")
      .eq("pages.content_type", "seo_blog")
      .eq("pages.workspace_id", workspaceId);
    const knownSlugs = (allTrans ?? []).map((t) => t.slug as string);

    // Re-fetch the verified PubMed URLs from the writer. We don't have them
    // here directly, so the gate checks citation count against whatever
    // pubmed.ncbi.nlm.nih.gov URLs appear (can't tell hallucinated vs real
    // without the verified list). Good enough for the common case.
    const gate = runSoftGate({
      html: finalHtml,
      slug: nextArticle.slug,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      verifiedCitationUrls: [],
      requireResearchCitations: enableResearchCitations,
      knownSlugs,
      allowedExternalDomains: verifiedDomains,
    });

    if (!gate.pass) {
      console.log(
        `[blog-autopilot] Soft gate FAILED for ${nextArticle.slug}: ${gate.reasons.join("; ")}`
      );
      // Park in pending_review instead of publishing
      await db
        .from("translations")
        .update({
          status: "pending_review",
          publish_error: `Soft gate: ${gate.reasons.join("; ")}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", translation.id);

      // Telegram ping with reasons + review URL
      try {
        const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
        const hubUrl = process.env.APP_URL || "https://content-hub.vercel.app";
        if (chatId) {
          await sendTelegramNotification(
            chatId,
            `📝 *Artikel väntar på review*\n\n` +
              `Slug: \`${nextArticle.slug}\`\n` +
              `Titel: ${article.seoTitle}\n` +
              `Ord: ${article.wordCount}\n\n` +
              `*Gate-flaggor:*\n${gate.reasons.map((r) => `• ${r}`).join("\n")}\n\n` +
              `[Öppna review](${hubUrl}/blog-review/${translation.id})`
          );
        }
      } catch (err) {
        console.warn("[blog-autopilot] Telegram review notice failed (non-critical):", err);
      }

      // Leave plan in "writing" state? No — revert to planned so a future
      // manual action (approve + republish, or regen) handles it.
      return {
        action: "skipped",
        message: `Soft gate failed: ${gate.reasons.join("; ")}`,
        slug: nextArticle.slug,
        url: undefined,
      };
    }
    if (gate.warnings.length > 0) {
      console.log(
        `[blog-autopilot] Soft gate warnings (non-blocking): ${gate.warnings.join("; ")}`
      );
    }
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

  // 2026-04-16: These used to be fire-and-forget with silent .catch() — if any
  // failed, the blog homepage/RSS/sitemap silently went stale. Now awaited via
  // runDeployStep which records failures + sends a Telegram alert. Errors don't
  // abort the rest (article is already published). See resilience-audit-2026-04-16.md.
  const deployContext = {
    language,
    workspaceId,
    targetId: translation.id,
  };

  // Skip the CF Pages site-level steps (homepage, RSS, sitemap) for workspaces
  // that publish to Shopify — the platform handles them itself. Retroactive
  // internal-link updates only touch CF Pages HTML too.
  const { data: wsForTarget } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();
  const publishTargetForPost =
    ((wsForTarget?.settings as Record<string, unknown> | null)?.blog_publish_target as
      | string
      | undefined) || "cf_pages";

  if (publishTargetForPost === "shopify") {
    // Shopify owns sitemap, homepage, RSS — but we still need to ping GSC so
    // the article gets discovered via the platform's own sitemap.xml. Without
    // this, Shopify-published articles sit in "URL unknown to Google" until
    // Google decides to re-fetch the sitemap on its own schedule.
    if (isGscConfigured()) {
      const settings = (wsForTarget?.settings as Record<string, unknown> | null) || {};
      const props =
        (settings.gsc_properties as Array<{
          property: string;
          language: string;
          is_primary?: boolean;
        }>) ?? [];
      const primary = props.find(
        (p) => p.language === language && p.is_primary !== false
      );
      if (primary) {
        const host = primary.property.startsWith("sc-domain:")
          ? primary.property.slice("sc-domain:".length)
          : new URL(primary.property).hostname;
        const sitemapUrl = `https://${host}/sitemap.xml`;
        await runDeployStep("gsc_sitemap_submit", deployContext, () =>
          submitSitemap(primary.property, sitemapUrl)
        );
      }
    }
  } else {
    await runDeployStep("blog_homepage", deployContext, () =>
      deployBlogHomepage(language)
    );
    await runDeployStep("blog_rss", deployContext, () =>
      deployBlogRssFeed(language)
    );
    await runDeployStep("retroactive_links", deployContext, () =>
      retroactivelyUpdateLinks(language, workspaceId)
    );
    const sitemapResult = await runDeployStep("sitemap", deployContext, () =>
      deploySitemapAndRobots(language)
    );
    // Only submit to GSC if sitemap deploy actually succeeded
    if (sitemapResult !== null && isGscConfigured()) {
      const domain = getProjectCustomDomain(language);
      if (domain) {
        const sitemapUrl = `https://${domain}/sitemap.xml`;
        const property = `https://${domain}/`;
        await runDeployStep("gsc_sitemap_submit", deployContext, () =>
          submitSitemap(property, sitemapUrl)
        );
        // Bing Webmaster Tools sitemap submit (5-10% SE search share, also
        // powers DuckDuckGo + ChatGPT-search). No-op if BING_WEBMASTER_API_KEY
        // not set so doesn't block deploys.
        try {
          const { submitSitemapToBing, isBingConfigured } = await import("./bing-webmaster");
          if (isBingConfigured()) {
            const result = await submitSitemapToBing(`https://${domain}/`, sitemapUrl);
            if (result.ok) {
              console.log(`[blog-publish] Bing sitemap submitted: ${sitemapUrl}`);
            } else {
              console.warn(`[blog-publish] Bing sitemap submit failed: ${result.message}`);
            }
          }
        } catch (err) {
          console.warn("[blog-publish] Bing sitemap submit error (non-fatal):", err);
        }
      }
    }
  }

  // Send Telegram notification.
  // Uses a dedicated `blog_notifications_disabled` flag (default off = enabled)
  // so the workspace-wide `notifications_disabled` kill-switch (used to silence
  // Meta autopilot spam) doesn't also tank blog publish pings.
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    const { data: wsRow } = await db
      .from("workspaces")
      .select("settings")
      .eq("id", workspaceId)
      .single();
    const blogNotifsDisabled =
      ((wsRow?.settings as Record<string, unknown> | null)
        ?.blog_notifications_disabled as boolean | undefined) === true;
    if (chatId && !blogNotifsDisabled) {
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
      productSlug: nextArticle.productSlug,
    },
  };
}

// ---------------------------------------------------------------------------
// Article selection
// ---------------------------------------------------------------------------

/**
 * Topic blocklist for blog autopilot. Workspaces set `blog_topic_blocklist`
 * in settings as an array of substrings (case-insensitive). Any planned
 * article or DataForSEO suggestion whose slug, title, or primary keyword
 * contains a blocklist substring is skipped — and matching plan rows are
 * auto-deferred so they don't clutter the content plan UI.
 *
 * Used to keep autopilot from generating articles in topics the product is
 * not suited for (e.g. "kollagen-gravid" / "kollagen-leder" for Hydro13,
 * which is not intended for pregnant women or joint health).
 */
function isTopicBlocked(text: string | null | undefined, blocklist: string[]): boolean {
  if (!text || !blocklist.length) return false;
  const lower = text.toLowerCase();
  return blocklist.some((b) => lower.includes(b.toLowerCase()));
}

function getBlocklistFromSettings(settings: Record<string, unknown> | null | undefined): string[] {
  const raw = settings?.blog_topic_blocklist;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

async function pickNextArticle(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  language: Language,
  excludeSlugs: string[] = []
): Promise<ArticleRequest | null> {
  const blogDomain = getProjectCustomDomain(language) || "";

  // Get workspace default product slug + topic blocklist
  const { data: wsData } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();
  const wsSettings = (wsData?.settings as Record<string, unknown> | null) ?? null;
  const wsProductSlug = wsSettings?.default_product as string | undefined;
  const blocklist = getBlocklistFromSettings(wsSettings);

  // 1. Try the blog_content_plan table: pick the highest-priority "planned" article
  //    (skipping any slugs we've already failed on in this run, and any topic on
  //    the workspace's blog_topic_blocklist)
  let plannedQuery = db
    .from("blog_content_plan")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("language", language)
    .eq("status", "planned")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(blocklist.length > 0 ? 20 : 1);
  if (excludeSlugs.length > 0) {
    plannedQuery = plannedQuery.not("slug", "in", `(${excludeSlugs.map((s) => `"${s}"`).join(",")})`);
  }
  const { data: plannedRows } = await plannedQuery;

  // Filter blocklisted rows out (and auto-defer them so they don't keep
  // showing up as "planned" in the UI).
  const matchedBlocked = (plannedRows ?? []).filter((row) =>
    isTopicBlocked(row.slug, blocklist) ||
    isTopicBlocked(row.title, blocklist) ||
    isTopicBlocked(row.primary_keyword, blocklist)
  );
  if (matchedBlocked.length > 0) {
    const blockedIds = matchedBlocked.map((r) => r.id);
    await db
      .from("blog_content_plan")
      .update({ status: "deferred", updated_at: new Date().toISOString() })
      .in("id", blockedIds);
    console.log(
      `[blog-autopilot] Auto-deferred ${matchedBlocked.length} blocklisted plan rows: ${matchedBlocked
        .map((r) => r.slug)
        .join(", ")}`
    );
    // Telegram alert so operator sees what got pruned (silent defer
    // previously caused "where did my content plan go" confusion).
    try {
      const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
      if (chatId) {
        await sendTelegramNotification(
          chatId,
          `🚫 *Topic-blocklist defer (${language.toUpperCase()})*\n\n` +
            `${matchedBlocked.length} planerade artiklar parkerade som deferred:\n` +
            matchedBlocked.slice(0, 10).map((r) => `• \`${r.slug}\``).join("\n") +
            (matchedBlocked.length > 10 ? `\n• ...och ${matchedBlocked.length - 10} till` : "")
        );
      }
    } catch {
      // Non-critical
    }
  }

  const planned = (plannedRows ?? []).find(
    (row) =>
      !isTopicBlocked(row.slug, blocklist) &&
      !isTopicBlocked(row.title, blocklist) &&
      !isTopicBlocked(row.primary_keyword, blocklist)
  );

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

    // Filter: volume > 200, competition index < 50, not already covered, not blocklisted
    const candidates = suggestions
      .filter(
        (s) =>
          (s.searchVolume ?? 0) > 200 &&
          (s.competitionIndex ?? 100) < 50 &&
          !existingSlugs.has(slugifyKeyword(s.keyword)) &&
          !isTopicBlocked(s.keyword, blocklist) &&
          !isTopicBlocked(slugifyKeyword(s.keyword), blocklist)
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

export async function publishBlogArticle(
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

  // Route to Shopify publisher for workspaces that opted in. Hydro13 lives on
  // get-renew.com/blogs/kollagen/* via the Shopify Admin API; everything
  // else (HappySleep etc.) stays on CF Pages.
  const publishTarget = (settings.blog_publish_target as string) || "cf_pages";
  if (publishTarget === "shopify") {
    const { publishToShopify } = await import("./shopify-blog-publish");
    const { data: otherTrans } = await db
      .from("translations")
      .select("slug, pages!inner(workspace_id, content_type)")
      .eq("language", language)
      .eq("status", "published")
      .eq("pages.content_type", "seo_blog")
      .eq("pages.workspace_id", workspaceId);
    const knownSlugs = (otherTrans ?? []).map((t) => t.slug as string);

    const result = await publishToShopify({
      articleHtml,
      slug,
      category,
      seoTitle,
      seoDescription,
      language,
      workspaceId,
      sourceBlogDomain: domain || "halsobladet.com",
      createdAt,
      knownSlugs,
    });
    return result.url;
  }

  // Extract and wrap in blog shell
  const { bodyHtml: rawBodyHtml, headHtml } = extractArticleBody(articleHtml);
  const bodyHtmlAlt = autoFillAltText(rawBodyHtml, seoTitle);
  const bodyHtml = injectBlogUTMs(bodyHtmlAlt, slug);
  // Topical similarity ranking (was recency-ordered) - shows Google we have
  // genuine topical authority by surfacing semantically-related articles
  const { getRelatedArticles } = await import("./blog-deploy");
  const relatedArticles = await getRelatedArticles(language, slug, 4);
  const featuredImage = extractFirstImage(bodyHtml);

  const categorySlug = slugifyCategory(category);
  const deploySlug = categorySlug ? `${categorySlug}/${slug}` : slug;

  const authorOverride = settings.blog_author as
    | import("./blog-shell").BlogAuthorOverride
    | undefined;

  // Build hreflang alternates: find verified translations of THIS article on
  // other languages so hreflang URLs only reference real pages. We match by
  // page_id - same page record can have published translations in sv/da/no.
  const hreflangAlternates: Partial<Record<Language, import("./blog-shell").HreflangAlternate>> = {};
  const { data: currentPage } = await db
    .from("translations")
    .select("page_id")
    .eq("id", translationId)
    .single();
  if (currentPage?.page_id) {
    const { data: sibs } = await db
      .from("translations")
      .select("language, slug, pages!inner(blog_category)")
      .eq("page_id", currentPage.page_id)
      .eq("status", "published")
      .not("slug", "is", null);
    for (const sib of sibs ?? []) {
      const lang = sib.language as Language;
      if (lang === language) continue;
      const sibCategory = (sib.pages as unknown as { blog_category?: string })?.blog_category;
      hreflangAlternates[lang] = {
        slug: sib.slug as string,
        categorySlug: sibCategory ? slugifyCategory(sibCategory) : undefined,
      };
    }
  }

  // Trustpilot Product+aggregateRating schema for product-recommendation
  // articles. Pulls cached rating from trustpilot_cache (1x/day refresh).
  // Result: star-rating rich snippets in Google SERPs for the article.
  let productRatingSchema: string | undefined;
  try {
    const { isProductRecommendationArticle, getCachedBusinessInfo, buildProductRatingSchema } = await import("./trustpilot");
    const templateForCheck = (settings.blog_publish_target as string) === "shopify" ? "comparison" : "listicle";
    // Best-effort template detection from category since we don't have it on this code path
    if (isProductRecommendationArticle(category, templateForCheck)) {
      const tpDomain = settings.trustpilot_domain as string | undefined;
      if (tpDomain) {
        const info = await getCachedBusinessInfo(tpDomain);
        if (info && info.stars > 0 && info.numberOfReviews > 0) {
          // Resolve product info from product bank via slug stored in plan row
          const { data: productRows } = await db
            .from("blog_content_plan")
            .select("product_slug")
            .eq("slug", slug)
            .eq("language", language)
            .maybeSingle();
          const productSlug = (productRows?.product_slug as string) || (settings.default_product as string) || "";
          const productUrl = (settings.shopify_domains as string)?.split(",")[0]?.trim()
            ? `https://${(settings.shopify_domains as string).split(",")[0].trim()}/products/${productSlug}`
            : "";
          const productName = productSlug === "happysleep" ? "HappySleep" : productSlug === "hydro13" ? "Hydro13" : productSlug;
          if (productUrl && productName) {
            productRatingSchema = buildProductRatingSchema({
              productName,
              productUrl,
              brandName: productName,
              rating: info.stars,
              reviewCount: info.numberOfReviews,
              reviewUrl: `https://www.trustpilot.com/review/${tpDomain}`,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("[blog-publish] Trustpilot schema injection failed (non-critical):", err);
  }

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
    authorOverride,
    hreflangAlternates,
    productRatingSchema,
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

  // Optimize images: download → convert to WebP → embed in deployment.
  // Also add loading="lazy", width/height, and fetchpriority="high" on the
  // hero image — the article writer does not emit any of these.
  let finalHtml = wrappedHtml;
  const deployFiles: DeployFile[] = [];
  try {
    const { optimizeImages, enhanceImageTags } = await import("./image-optimizer");
    const imgResult = await optimizeImages(wrappedHtml, deploySlug);
    if (imgResult.stats.optimized > 0) {
      finalHtml = wrappedHtml;
      for (const [originalUrl, deployPath] of imgResult.urlMap) {
        finalHtml = finalHtml.split(originalUrl).join(deployPath);
      }
      for (const img of imgResult.images) {
        deployFiles.push({ path: img.deployPath, sha1: img.sha1, body: new Uint8Array(img.buffer) });
        // Deploy AVIF alongside WebP - <picture> tags in enhanceImageTags
        // reference both, browser picks supported format
        if (img.avif) {
          deployFiles.push({ path: img.avif.deployPath, sha1: img.avif.sha1, body: new Uint8Array(img.avif.buffer) });
        }
      }
      finalHtml = enhanceImageTags(finalHtml, imgResult.images);
      console.log(`[blog-publish] Optimized ${imgResult.stats.optimized} images, saved ${(imgResult.stats.savedBytes / 1024).toFixed(0)}KB`);
    }
  } catch (err) {
    console.warn("[blog-publish] Image optimization failed, using original URLs:", err);
  }

  // Fix OG/Twitter/JSON-LD image URLs that image optimizer made relative
  finalHtml = fixMetaImageUrls(finalHtml, baseUrl);

  // Deploy to Cloudflare Pages
  const result = await publishPage(finalHtml, deploySlug, language, deployFiles, undefined, analytics);

  // 2026-04-16: If post-deploy HTTP verification failed, surface it via
  // Telegram so we learn about broken deploys immediately instead of when
  // traffic hits a 404 page. Non-fatal — we still return the URL.
  // See resilience-audit-2026-04-16.md P1-1.
  if (result.verification && !result.verification.ok) {
    console.error(
      `[blog-publish] Deploy verification failed for ${result.url}: ${result.verification.reason}`
    );
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    const { data: wsRow } = await db
      .from("workspaces")
      .select("settings")
      .eq("id", workspaceId)
      .single();
    const blogNotifsDisabled =
      ((wsRow?.settings as Record<string, unknown> | null)
        ?.blog_notifications_disabled as boolean | undefined) === true;
    if (chatId && !blogNotifsDisabled) {
      try {
        await sendTelegramNotification(
          chatId,
          `⚠️ *Blog deploy verification failed*\n\n` +
            `URL: \`${result.url}\`\n` +
            `Reason: \`${result.verification.reason ?? "unknown"}\`\n` +
            `Status: \`${result.verification.status ?? "-"}\`\n\n` +
            `Article deployed but is not serving valid HTML.`
        );
      } catch {
        // Non-critical — don't fail the publish
      }
    }
  }

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

  // Determine publish target for this workspace - CF Pages or Shopify.
  // Each has a different expected URL pattern for the "already live?" check.
  const { data: wsRow } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();
  const wsSettings = (wsRow?.settings ?? {}) as Record<string, unknown>;
  const publishTarget = (wsSettings.blog_publish_target as string) || "cf_pages";

  const domain = getProjectCustomDomain(language);
  // For CF Pages we MUST have a domain to check URLs. For Shopify the
  // domain check uses Shopify Admin API instead so we don't need a CF domain.
  if (publishTarget === "cf_pages" && !domain) return;

  console.log(
    `[blog-autopilot] Found ${orphans.length} orphaned translations (killed mid-publish, target=${publishTarget}), resuming`
  );

  // For Shopify target: resolve creds + blog ID once, then check each orphan
  // handle via findArticleByHandle (cheap call per orphan).
  let shopifyCreds: Awaited<ReturnType<typeof import("./shopify").getShopifyCredsForWorkspace>> | null = null;
  let shopifyBlogId: number | null = null;
  if (publishTarget === "shopify") {
    try {
      const { getShopifyCredsForWorkspace } = await import("./shopify");
      const { findBlogByHandle } = await import("./shopify-blog");
      shopifyCreds = await getShopifyCredsForWorkspace(workspaceId);
      const blogHandle = (wsSettings.shopify_blog_handle as string) || "kollagen";
      if (shopifyCreds) {
        const blog = await findBlogByHandle(shopifyCreds, blogHandle);
        shopifyBlogId = blog ? blog.id : null;
      }
    } catch (err) {
      console.warn("[blog-autopilot] Shopify orphan precheck failed:", err);
    }
  }

  for (const orphan of orphans) {
    const page = orphan.pages as unknown as { id: string; blog_category?: string };
    const categorySlug = slugifyCategory(page?.blog_category || "");
    const deployPath = categorySlug ? `${categorySlug}/${orphan.slug}` : orphan.slug;

    let isLive = false;
    let expectedUrl: string;

    if (publishTarget === "shopify" && shopifyCreds && shopifyBlogId) {
      // Shopify: article is live if the handle exists in the blog
      const blogHandle = (wsSettings.shopify_blog_handle as string) || "kollagen";
      const storeDomain = (wsSettings.shopify_store_domain as string) || "get-renew.com";
      expectedUrl = `https://${storeDomain}/blogs/${blogHandle}/${orphan.slug}`;
      try {
        const { findArticleByHandle } = await import("./shopify-blog");
        const article = await findArticleByHandle(shopifyCreds, shopifyBlogId, orphan.slug);
        isLive = article !== null;
      } catch (err) {
        console.warn(`[blog-autopilot] Shopify orphan check for ${orphan.slug}:`, err);
      }
    } else {
      // CF Pages: HEAD-check the URL
      expectedUrl = `https://${domain}/${deployPath}`;
      try {
        const res = await fetch(expectedUrl, { method: "HEAD", redirect: "follow" });
        isLive = res.status === 200;
      } catch {
        // Network error — fall through and republish
      }
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
      productSlug: job.productSlug,
    });

    if (imageResult.generated === 0) {
      console.log(`[blog-images-bg] No images generated for "${job.slug}"`);
      // Alert: article is now live with placeholder.co divs in <img> slots.
      // blog-images-retry cron at 10:30 UTC daily will retry, but operator
      // should know the first pass failed.
      await notifyImageGenFailed(job, "0 images generated by Kie AI (likely content filter or quota)");
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
    await runDeployStep(
      "blog_homepage",
      { language: lang, workspaceId: job.workspaceId, targetId: job.translationId },
      () => deployBlogHomepage(lang)
    );
  } catch (err) {
    // Article is already live with placeholder images. Daily retry cron at
    // 10:30 UTC will attempt to regenerate. Alert operator so they can
    // intervene if retries keep failing.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[blog-images-bg] Failed for "${job.slug}":`, msg);
    await notifyImageGenFailed(job, msg);
  }
}

/** Telegram alert when background image generation fails or produces 0 images */
async function notifyImageGenFailed(
  job: NonNullable<AutopilotResult["imageJob"]>,
  reason: string
): Promise<void> {
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (!chatId) return;
    const hubUrl = process.env.APP_URL || "https://content-hub.vercel.app";
    await sendTelegramNotification(
      chatId,
      `⚠️ *Bildgenerering misslyckades*\n\n` +
        `Slug: \`${job.slug}\`\n` +
        `Titel: ${job.articleTitle}\n` +
        `Reason: \`${reason.slice(0, 200)}\`\n\n` +
        `Artikeln är live med placeholder-bilder\\. Daily retry-cron 10:30 UTC försöker igen\\.\n\n` +
        `[Öppna artikel](${hubUrl}/blog-review/${job.translationId})`
    );
  } catch {
    // Non-critical
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
