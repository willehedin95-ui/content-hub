/**
 * Shared scan logic for a single research source.
 * Used by both the daily cron and the manual "Scan Now" button.
 */

import {
  scrapeReviews,
  scrapeReviewsByStars,
  logScrapeUsage as logTrustpilotUsage,
} from "@/lib/trustpilot";
import {
  scrapeSubreddit,
  searchReddit,
  logScrapeUsage as logRedditUsage,
} from "@/lib/reddit";
import { extractAsin } from "@/lib/amazon";
import {
  scrapeInstagramComments,
  scrapeFacebookComments,
  scrapeTikTokComments,
  scrapeAmazonReviewsViaApify,
  logApifyUsage,
  APIFY_ACTORS,
} from "@/lib/apify";
import {
  evaluateReview,
  getMarketRelevance,
} from "@/lib/research-evaluate";
import { createServerSupabase } from "@/lib/supabase-admin";

const MAX_PAGES_BACKFILL = 10;
const MAX_PAGES_INCREMENTAL = 3;
// Deep scan cap. The old value (100 pages ≈ 2000 reviews) could never finish:
// at ~1.2s per Haiku eval + scrape time that's 40+ min of work inside the
// 800s Vercel PRO cap, and everything after the kill was lost. 40 pages
// (~800 reviews) fits with margin, and Trustpilot deep mode is anyway capped
// at 10 pages per star level by scrapeReviewsByStars. Combined with the
// dedupe + checkpointing below, a re-run resumes cheaply where it stopped.
const MAX_PAGES_DEEP = 40;
const EVAL_DELAY_MS = 150;
const MIN_SIGNIFICANCE = 4;
// Persist nuggets + progress every N evaluated reviews so a killed run keeps
// what has already been paid for.
const CHECKPOINT_EVERY = 25;
// Stop evaluating when this much wall time has passed since scan start -
// leaves headroom under maxDuration=800s for scrape time and final writes.
const EVAL_DEADLINE_MS = 700_000;

interface RawReview {
  id: string;
  text: string;
  title: string | null;
  rating: number;
  language: string;
  date: string;
  author: string;
}

export interface SourceRecord {
  id: string;
  name: string;
  domain: string;
  platform: string;
  config: Record<string, string> | null;
  external_id: string | null;
  last_scanned_at: string | null;
  last_review_date: string | null;
  total_reviews_fetched: number;
}

export interface ScanResult {
  reviewsScraped: number;
  nuggetsStored: number;
  /** Reviews skipped because their external_review_id already had a stored nugget. */
  skippedExisting?: number;
  /** True when the eval loop stopped early on the time budget (re-run resumes via dedupe). */
  truncated?: boolean;
  error?: string;
}

export async function scanSingleSource(
  source: SourceRecord,
  workspaceId: string,
  opts?: { deep?: boolean }
): Promise<ScanResult> {
  const startedAt = Date.now();
  const db = createServerSupabase();
  const isBackfill = !source.last_scanned_at;
  const isDeep = opts?.deep === true;
  const maxPages = isDeep
    ? MAX_PAGES_DEEP
    : isBackfill
      ? MAX_PAGES_BACKFILL
      : MAX_PAGES_INCREMENTAL;
  // Deep scan ignores sinceDate to re-scrape everything
  const sinceDate = isDeep
    ? undefined
    : source.last_review_date
      ? new Date(source.last_review_date)
      : undefined;

  let rawReviews: RawReview[] = [];
  let externalId = source.external_id;
  let blocked = false;

  // --- Platform dispatch ---
  try {
  switch (source.platform) {
    case "trustpilot": {
      // Deep mode: scrape each star level separately (3x more reviews)
      const scrapeResult = isDeep
        ? await scrapeReviewsByStars(source.domain, { sinceDate })
        : await scrapeReviews(source.domain, { maxPages, sinceDate });
      await logTrustpilotUsage(
        source.domain,
        scrapeResult.reviews.length,
        scrapeResult.pagesScraped
      );
      externalId = scrapeResult.businessInfo.id || source.external_id;
      rawReviews = scrapeResult.reviews.map((r) => ({
        id: r.id,
        text: r.text,
        title: r.title,
        rating: r.rating,
        language: r.language,
        date: r.publishedDate,
        author: r.consumerName,
      }));
      break;
    }

    case "reddit": {
      const isSearch = source.domain.includes(" ");
      const scrapeResult = isSearch
        ? await searchReddit(source.domain, { maxPages, sinceDate })
        : await scrapeSubreddit(source.domain, { maxPages, sinceDate });
      await logRedditUsage(
        source.domain,
        scrapeResult.totalScraped,
        scrapeResult.pagesScraped
      );
      rawReviews = scrapeResult.posts.map((p) => ({
        id: p.id,
        text: `${p.title ? p.title + "\n\n" : ""}${p.selftext}`,
        title: p.title,
        rating: 0,
        language: detectLanguage(p.selftext),
        date: new Date(p.createdUtc * 1000).toISOString(),
        author: p.author,
      }));
      break;
    }

    case "amazon": {
      const sourceConfig = (source.config as Record<string, string>) ?? {};
      const asin = extractAsin(source.domain);
      if (!asin) {
        return { reviewsScraped: 0, nuggetsStored: 0, error: `Invalid ASIN: ${source.domain}` };
      }
      const marketplace = sourceConfig.marketplace ?? "se";
      // Deep mode requests more reviews; Amazon caps at ~26 per Apify run
      const maxReviews = isDeep ? 150 : isBackfill ? 100 : 30;
      const scrapeResult = await scrapeAmazonReviewsViaApify(asin, {
        marketplace,
        maxReviews,
      });
      await logApifyUsage(APIFY_ACTORS.amazon_reviews, "amazon", scrapeResult.totalScraped);
      rawReviews = scrapeResult.reviews.map((r) => ({
        id: r.id,
        text: `${r.title ? r.title + "\n\n" : ""}${r.text}`,
        title: r.title,
        rating: r.rating,
        language: r.language || detectAmazonLanguage(marketplace),
        date: r.date,
        author: r.author,
      }));
      if (scrapeResult.productInfo) {
        externalId = scrapeResult.productInfo.asin;
        autoUpdateSourceName(db, source, scrapeResult.productInfo.title, asin);
      }
      break;
    }

    case "apify_instagram": {
      const sourceConfig = (source.config as Record<string, string>) ?? {};
      const urls = (sourceConfig.urls || source.domain)
        .split(",").map((u: string) => u.trim()).filter(Boolean);
      if (urls.length === 0) {
        return { reviewsScraped: 0, nuggetsStored: 0, error: "No Instagram URLs configured" };
      }
      const scrapeResult = await scrapeInstagramComments(urls, {
        maxComments: isBackfill ? 200 : 100,
      });
      await logApifyUsage(APIFY_ACTORS.instagram_comments, "instagram", scrapeResult.totalScraped);
      rawReviews = scrapeResult.reviews.map((r) => ({
        id: r.id, text: r.text, title: r.title, rating: 0,
        language: r.language, date: r.date, author: r.author,
      }));
      break;
    }

    case "apify_facebook": {
      const sourceConfig = (source.config as Record<string, string>) ?? {};
      const urls = (sourceConfig.urls || source.domain)
        .split(",").map((u: string) => u.trim()).filter(Boolean);
      if (urls.length === 0) {
        return { reviewsScraped: 0, nuggetsStored: 0, error: "No Facebook URLs configured" };
      }
      const scrapeResult = await scrapeFacebookComments(urls, {
        maxComments: isBackfill ? 200 : 100,
      });
      await logApifyUsage(APIFY_ACTORS.facebook_comments, "facebook", scrapeResult.totalScraped);
      rawReviews = scrapeResult.reviews.map((r) => ({
        id: r.id, text: r.text, title: r.title, rating: 0,
        language: r.language, date: r.date, author: r.author,
      }));
      break;
    }

    case "apify_tiktok": {
      const sourceConfig = (source.config as Record<string, string>) ?? {};
      const urls = (sourceConfig.urls || source.domain)
        .split(",").map((u: string) => u.trim()).filter(Boolean);
      if (urls.length === 0) {
        return { reviewsScraped: 0, nuggetsStored: 0, error: "No TikTok URLs configured" };
      }
      const scrapeResult = await scrapeTikTokComments(urls, {
        maxComments: isBackfill ? 200 : 100,
      });
      await logApifyUsage(APIFY_ACTORS.tiktok_comments, "tiktok", scrapeResult.totalScraped);
      rawReviews = scrapeResult.reviews.map((r) => ({
        id: r.id, text: r.text, title: r.title, rating: 0,
        language: r.language, date: r.date, author: r.author,
      }));
      break;
    }

    default:
      return { reviewsScraped: 0, nuggetsStored: 0, error: `Unsupported platform: ${source.platform}` };
  }
  } catch (err) {
    // Surface scrape failures (e.g. Trustpilot Cloudflare block) as a source
    // error instead of silently reporting "0 new reviews".
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await db
      .from("research_sources")
      .update({
        status: "error",
        error_message: errorMsg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id);
    return { reviewsScraped: 0, nuggetsStored: 0, error: errorMsg };
  }

  // --- Handle CAPTCHA block (Amazon) ---
  if (blocked && rawReviews.length === 0) {
    await db
      .from("research_sources")
      .update({
        status: "error",
        error_message: "CAPTCHA detected — will retry next scan",
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id);
    return { reviewsScraped: 0, nuggetsStored: 0, error: "CAPTCHA blocked" };
  }

  // --- No new reviews ---
  if (rawReviews.length === 0) {
    await db
      .from("research_sources")
      .update({
        last_scanned_at: new Date().toISOString(),
        external_id: externalId,
        status: "active",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id);
    return { reviewsScraped: 0, nuggetsStored: 0 };
  }

  // --- Dedupe: skip reviews that already have a stored nugget ---
  // Saves the Haiku cost of re-evaluating them (deep scans re-scrape
  // everything) and makes a re-run after a timeout resume where it stopped.
  const existingIds = new Set<string>();
  const scrapedIds = rawReviews.map((r) => r.id).filter(Boolean);
  for (let i = 0; i < scrapedIds.length; i += 200) {
    const chunk = scrapedIds.slice(i, i + 200);
    const { data: existing, error: existingErr } = await db
      .from("research_nuggets")
      .select("external_review_id")
      .eq("source_id", source.id)
      .in("external_review_id", chunk);
    if (existingErr) {
      // Fail open (re-evaluate) but loudly - the upsert is idempotent so the
      // only downside is a redundant paid eval, never data corruption.
      console.error("Nugget dedupe query error:", existingErr.message);
      continue;
    }
    for (const row of existing ?? []) {
      existingIds.add(row.external_review_id as string);
    }
  }
  const reviewsToEval = rawReviews.filter((r) => !existingIds.has(r.id));
  const skippedExisting = rawReviews.length - reviewsToEval.length;

  // --- Evaluate each review with Haiku ---
  let nuggetsStored = 0;
  let latestReviewDate = source.last_review_date
    ? new Date(source.last_review_date)
    : new Date(0);

  let nuggetBatch: Array<Record<string, unknown>> = [];

  // Incremental checkpoint: upsert accumulated nuggets so a killed run keeps
  // everything paid for so far. Deliberately does NOT advance
  // last_review_date: reviews arrive newest-first, so persisting the newest
  // evaluated date before the OLDER tail has been processed would make the
  // next incremental scan (sinceDate = last_review_date) skip that tail
  // permanently. Resume-after-interrupt is instead handled by the
  // external_review_id dedupe, which makes re-runs cheap.
  const flushCheckpoint = async (): Promise<void> => {
    if (nuggetBatch.length > 0) {
      const { error } = await db.from("research_nuggets").upsert(nuggetBatch, {
        onConflict: "workspace_id,source_id,external_review_id",
      });
      if (error) {
        console.error("Nugget upsert error:", error.message);
      } else {
        nuggetsStored += nuggetBatch.length;
      }
      nuggetBatch = [];
    }
  };

  let evaluatedCount = 0;
  let truncated = false;

  for (let i = 0; i < reviewsToEval.length; i++) {
    const review = reviewsToEval[i];

    if (Date.now() - startedAt > EVAL_DEADLINE_MS) {
      truncated = true;
      console.warn(
        `[research-scan] Time budget hit for ${source.name} after ${evaluatedCount}/${reviewsToEval.length} evals - stopping early (next run resumes via dedupe)`
      );
      break;
    }

    if (i > 0) {
      await new Promise((r) => setTimeout(r, EVAL_DELAY_MS));
    }

    try {
      const result = await evaluateReview({
        text: review.text,
        title: review.title,
        stars: review.rating,
        language: review.language,
        competitorName: source.name,
      });

      // Log the paid eval regardless of significance (below-threshold evals
      // cost the same Haiku money as stored ones).
      await db.from("usage_logs").insert({
        type: "research_evaluation",
        model: "claude-haiku-4-5",
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: result.costUsd,
        metadata: {
          source_id: source.id,
          review_id: review.id,
          platform: source.platform,
          significance: result.evaluation.significance,
        },
      });

      if (result.evaluation.significance >= MIN_SIGNIFICANCE) {
        const reviewDate = new Date(review.date);
        if (!isNaN(reviewDate.getTime()) && reviewDate > latestReviewDate) {
          latestReviewDate = reviewDate;
        }

        nuggetBatch.push({
          workspace_id: workspaceId,
          source_id: source.id,
          external_review_id: review.id,
          review_stars: review.rating,
          review_date: review.date,
          reviewer_name: review.author,
          review_title: review.title,
          review_text: review.text,
          language: review.language,
          market_relevance: getMarketRelevance(review.language),
          sentiment: result.evaluation.sentiment,
          significance: result.evaluation.significance,
          tags: result.evaluation.tags,
          customer_phrases: result.evaluation.customer_phrases,
          pain_points: result.evaluation.pain_points,
          desires: result.evaluation.desires,
          competitor_name: source.name,
          summary: result.evaluation.summary,
          ai_evaluation: result.evaluation as unknown as Record<string, unknown>,
        });
      }
    } catch (evalErr) {
      console.error(
        `Eval failed for review ${review.id} from ${source.name} (${source.platform}):`,
        evalErr
      );
    }

    evaluatedCount++;
    if (evaluatedCount % CHECKPOINT_EVERY === 0) {
      await flushCheckpoint();
    }
  }

  // Flush whatever is left after the loop.
  await flushCheckpoint();

  // --- Update source metadata ---
  // last_review_date only advances on a COMPLETE run: after a truncated run
  // the older tail is unevaluated, and moving the watermark forward would
  // make the next incremental scan skip those reviews permanently.
  const { error: finalErr } = await db
    .from("research_sources")
    .update({
      last_scanned_at: new Date().toISOString(),
      ...(!truncated && latestReviewDate.getTime() > 0
        ? { last_review_date: latestReviewDate.toISOString() }
        : {}),
      total_reviews_fetched: (source.total_reviews_fetched || 0) + rawReviews.length,
      external_id: externalId,
      status: "active",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", source.id);
  if (finalErr) {
    console.error("Source metadata update error:", finalErr.message);
  }

  return {
    reviewsScraped: rawReviews.length,
    nuggetsStored,
    skippedExisting,
    truncated,
  };
}

// --- Source name auto-update ---

async function autoUpdateSourceName(
  db: ReturnType<typeof createServerSupabase>,
  source: SourceRecord,
  productTitle: string | undefined,
  asin: string
) {
  if (!productTitle || productTitle === asin) return;
  const currentName = source.name.trim();
  const looksLikePlaceholder =
    /^B0[A-Z0-9]{8}$/i.test(currentName) ||
    currentName.toLowerCase().startsWith("amazon ") ||
    currentName === "";
  if (looksLikePlaceholder) {
    await db
      .from("research_sources")
      .update({ name: productTitle.slice(0, 80) })
      .eq("id", source.id);
  }
}

// --- Language detection helpers ---

function detectLanguage(text: string): string {
  const hasSwedish =
    /[åäöÅÄÖ]/.test(text) ||
    /\b(och|att|för|det|har|inte|med|som|kan|man|på|är|var)\b/i.test(text);
  const hasNorwegian =
    /\b(og|det|har|ikke|med|som|kan|på|er|var|etter|veldig)\b/i.test(text) &&
    !hasSwedish;
  const hasDanish =
    /[æøÆØ]/.test(text) ||
    (/\b(og|det|har|ikke|med|som|kan|på|er|var|efter|meget)\b/i.test(text) &&
      !hasSwedish &&
      !hasNorwegian);

  if (hasSwedish) return "sv";
  if (hasNorwegian) return "no";
  if (hasDanish) return "da";
  return "en";
}

function detectAmazonLanguage(marketplace: string): string {
  switch (marketplace) {
    case "se": return "sv";
    case "de": return "de";
    case "uk":
    case "us": return "en";
    case "dk": return "da";
    case "no": return "no";
    default: return "en";
  }
}
