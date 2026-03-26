import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import {
  scrapeReviews,
  logScrapeUsage as logTrustpilotUsage,
} from "@/lib/trustpilot";
import {
  scrapeSubreddit,
  searchReddit,
  logScrapeUsage as logRedditUsage,
} from "@/lib/reddit";
import {
  scrapeInstagramComments,
  scrapeFacebookComments,
  scrapeTikTokComments,
  logApifyUsage,
  APIFY_ACTORS,
} from "@/lib/apify";
import {
  evaluateReview,
  getMarketRelevance,
} from "@/lib/research-evaluate";

export const maxDuration = 300; // 5 minutes — scraping + AI eval

const MAX_PAGES_BACKFILL = 10; // First scan: up to 200 reviews per source
const MAX_PAGES_INCREMENTAL = 3; // Daily scan: up to 60 new reviews per source
const EVAL_DELAY_MS = 150; // Delay between Haiku calls
const MIN_SIGNIFICANCE = 4; // Only store nuggets >= this score

interface RawReview {
  id: string;
  text: string;
  title: string | null;
  rating: number;
  language: string;
  date: string;
  author: string;
}

export async function GET(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional workspace filter
  const wsSlug = req.nextUrl.searchParams.get("workspace");

  const db = createServerSupabase();

  // Get workspaces with research enabled
  let wsQuery = db.from("workspaces").select("id, slug, settings");
  if (wsSlug) {
    wsQuery = wsQuery.eq("slug", wsSlug);
  }
  const { data: workspaces } = await wsQuery;

  if (!workspaces?.length) {
    return NextResponse.json({ skipped: true, reason: "No workspaces" });
  }

  const results: Array<{
    workspace: string;
    source: string;
    platform: string;
    reviewsScraped: number;
    nuggetsStored: number;
    error?: string;
  }> = [];

  for (const ws of workspaces) {
    const settings = ws.settings as Record<string, unknown>;
    if (!settings?.research_enabled) continue;

    // Get ALL active sources (any platform except manual_import)
    const { data: sources } = await db
      .from("research_sources")
      .select("*")
      .eq("workspace_id", ws.id)
      .eq("status", "active")
      .neq("platform", "manual_import")
      .neq("platform", "facebook_group")
      .neq("platform", "amazon"); // Amazon shows same ~8 curated reviews — one-time scan on add only

    if (!sources?.length) continue;

    for (const source of sources) {
      try {
        const isBackfill = !source.last_scanned_at;
        const maxPages = isBackfill ? MAX_PAGES_BACKFILL : MAX_PAGES_INCREMENTAL;
        const sinceDate = source.last_review_date
          ? new Date(source.last_review_date)
          : undefined;

        // Dispatch to the right scraper
        let rawReviews: RawReview[] = [];
        let externalId = source.external_id;
        let blocked = false;

        switch (source.platform) {
          case "trustpilot": {
            const scrapeResult = await scrapeReviews(source.domain, {
              maxPages,
              sinceDate,
            });

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
            // domain field stores subreddit name or search query
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
              rating: 0, // Reddit has no star rating
              language: detectLanguage(p.selftext),
              date: new Date(p.createdUtc * 1000).toISOString(),
              author: p.author,
            }));
            break;
          }

          // Amazon excluded from daily cron — one-time scan on add only
          // (Amazon shows same ~8 curated reviews regardless of pagination)

          case "apify_instagram": {
            const sourceConfig = (source.config as Record<string, string>) ?? {};
            const urls = (sourceConfig.urls || source.domain).split(",").map((u: string) => u.trim()).filter(Boolean);
            if (urls.length === 0) throw new Error("No Instagram URLs configured");

            const scrapeResult = await scrapeInstagramComments(urls, {
              maxComments: isBackfill ? 200 : 100,
            });
            await logApifyUsage(APIFY_ACTORS.instagram_comments, "instagram", scrapeResult.totalScraped);

            rawReviews = scrapeResult.reviews.map((r) => ({
              id: r.id,
              text: r.text,
              title: r.title,
              rating: 0,
              language: r.language,
              date: r.date,
              author: r.author,
            }));
            break;
          }

          case "apify_facebook": {
            const sourceConfig = (source.config as Record<string, string>) ?? {};
            const urls = (sourceConfig.urls || source.domain).split(",").map((u: string) => u.trim()).filter(Boolean);
            if (urls.length === 0) throw new Error("No Facebook URLs configured");

            const scrapeResult = await scrapeFacebookComments(urls, {
              maxComments: isBackfill ? 200 : 100,
            });
            await logApifyUsage(APIFY_ACTORS.facebook_comments, "facebook", scrapeResult.totalScraped);

            rawReviews = scrapeResult.reviews.map((r) => ({
              id: r.id,
              text: r.text,
              title: r.title,
              rating: 0,
              language: r.language,
              date: r.date,
              author: r.author,
            }));
            break;
          }

          case "apify_tiktok": {
            const sourceConfig = (source.config as Record<string, string>) ?? {};
            const urls = (sourceConfig.urls || source.domain).split(",").map((u: string) => u.trim()).filter(Boolean);
            if (urls.length === 0) throw new Error("No TikTok URLs configured");

            const scrapeResult = await scrapeTikTokComments(urls, {
              maxComments: isBackfill ? 200 : 100,
            });
            await logApifyUsage(APIFY_ACTORS.tiktok_comments, "tiktok", scrapeResult.totalScraped);

            rawReviews = scrapeResult.reviews.map((r) => ({
              id: r.id,
              text: r.text,
              title: r.title,
              rating: 0,
              language: r.language,
              date: r.date,
              author: r.author,
            }));
            break;
          }

          default:
            continue; // Skip unknown platforms
        }

        // Handle blocked (Amazon CAPTCHA)
        if (blocked && rawReviews.length === 0) {
          await db
            .from("research_sources")
            .update({
              status: "error",
              error_message: "CAPTCHA detected — will retry next scan",
              updated_at: new Date().toISOString(),
            })
            .eq("id", source.id);

          results.push({
            workspace: ws.slug,
            source: source.name,
            platform: source.platform,
            reviewsScraped: 0,
            nuggetsStored: 0,
            error: "CAPTCHA blocked",
          });
          continue;
        }

        if (rawReviews.length === 0) {
          await db
            .from("research_sources")
            .update({
              last_scanned_at: new Date().toISOString(),
              external_id: externalId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", source.id);

          results.push({
            workspace: ws.slug,
            source: source.name,
            platform: source.platform,
            reviewsScraped: 0,
            nuggetsStored: 0,
          });
          continue;
        }

        // Evaluate each review with Haiku
        let nuggetsStored = 0;
        let latestReviewDate = source.last_review_date
          ? new Date(source.last_review_date)
          : new Date(0);

        const nuggetBatch: Array<Record<string, unknown>> = [];

        for (let i = 0; i < rawReviews.length; i++) {
          const review = rawReviews[i];

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

            if (result.evaluation.significance < MIN_SIGNIFICANCE) continue;

            const reviewDate = new Date(review.date);
            if (!isNaN(reviewDate.getTime()) && reviewDate > latestReviewDate) {
              latestReviewDate = reviewDate;
            }

            nuggetBatch.push({
              workspace_id: ws.id,
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
          } catch (evalErr) {
            console.error(
              `Eval failed for review ${review.id} from ${source.name} (${source.platform}):`,
              evalErr
            );
          }
        }

        // Batch upsert nuggets
        if (nuggetBatch.length > 0) {
          const batchSize = 500;
          for (let i = 0; i < nuggetBatch.length; i += batchSize) {
            const batch = nuggetBatch.slice(i, i + batchSize);
            const { error } = await db.from("research_nuggets").upsert(batch, {
              onConflict: "workspace_id,source_id,external_review_id",
            });
            if (error) {
              console.error("Nugget upsert error:", error);
            } else {
              nuggetsStored += batch.length;
            }
          }
        }

        // Update source metadata
        await db
          .from("research_sources")
          .update({
            last_scanned_at: new Date().toISOString(),
            last_review_date: latestReviewDate.toISOString(),
            total_reviews_fetched:
              (source.total_reviews_fetched || 0) + rawReviews.length,
            external_id: externalId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", source.id);

        results.push({
          workspace: ws.slug,
          source: source.name,
          platform: source.platform,
          reviewsScraped: rawReviews.length,
          nuggetsStored,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(
          `Research scan failed for ${source.name} (${source.platform}):`,
          errorMsg
        );

        await db
          .from("research_sources")
          .update({
            status: "error",
            error_message: errorMsg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", source.id);

        results.push({
          workspace: ws.slug,
          source: source.name,
          platform: source.platform,
          reviewsScraped: 0,
          nuggetsStored: 0,
          error: errorMsg,
        });
      }
    }
  }

  return NextResponse.json({
    scanned_at: new Date().toISOString(),
    results,
  });
}

// --- Helpers ---

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

