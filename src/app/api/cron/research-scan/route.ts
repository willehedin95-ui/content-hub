import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import {
  scrapeReviews,
  logScrapeUsage,
  type TrustpilotReview,
} from "@/lib/trustpilot";
import {
  evaluateReview,
  getMarketRelevance,
  type NuggetEvaluation,
} from "@/lib/research-evaluate";

export const maxDuration = 300; // 5 minutes — scraping + AI eval

const MAX_PAGES_BACKFILL = 10; // First scan: up to 200 reviews per source
const MAX_PAGES_INCREMENTAL = 3; // Daily scan: up to 60 new reviews per source
const EVAL_DELAY_MS = 150; // Delay between Haiku calls
const MIN_SIGNIFICANCE = 4; // Only store nuggets >= this score

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
    reviewsScraped: number;
    nuggetsStored: number;
    error?: string;
  }> = [];

  for (const ws of workspaces) {
    const settings = ws.settings as Record<string, unknown>;
    if (!settings?.research_enabled) continue;

    // Get active sources for this workspace
    const { data: sources } = await db
      .from("research_sources")
      .select("*")
      .eq("workspace_id", ws.id)
      .eq("platform", "trustpilot")
      .eq("status", "active");

    if (!sources?.length) continue;

    for (const source of sources) {
      try {
        const isBackfill = !source.last_scanned_at;
        const maxPages = isBackfill ? MAX_PAGES_BACKFILL : MAX_PAGES_INCREMENTAL;
        const sinceDate = source.last_review_date
          ? new Date(source.last_review_date)
          : undefined;

        // Scrape reviews
        const scrapeResult = await scrapeReviews(source.domain, {
          maxPages,
          sinceDate,
        });

        await logScrapeUsage(
          source.domain,
          scrapeResult.reviews.length,
          scrapeResult.pagesScraped
        );

        if (scrapeResult.reviews.length === 0) {
          // Update last_scanned_at even if no new reviews
          await db
            .from("research_sources")
            .update({
              last_scanned_at: new Date().toISOString(),
              external_id: scrapeResult.businessInfo.id || source.external_id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", source.id);

          results.push({
            workspace: ws.slug,
            source: source.name,
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

        for (let i = 0; i < scrapeResult.reviews.length; i++) {
          const review = scrapeResult.reviews[i];

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

            // Only store significant nuggets
            if (result.evaluation.significance < MIN_SIGNIFICANCE) continue;

            const reviewDate = new Date(review.publishedDate);
            if (reviewDate > latestReviewDate) {
              latestReviewDate = reviewDate;
            }

            nuggetBatch.push({
              workspace_id: ws.id,
              source_id: source.id,
              external_review_id: review.id,
              review_stars: review.rating,
              review_date: review.publishedDate,
              reviewer_name: review.consumerName,
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

            // Log cost
            await db.from("usage_logs").insert({
              type: "research_evaluation",
              model: "claude-haiku-4-5",
              input_tokens: 0,
              output_tokens: 0,
              cost_usd: result.costUsd,
              metadata: {
                source_id: source.id,
                review_id: review.id,
                significance: result.evaluation.significance,
              },
            });
          } catch (evalErr) {
            console.error(
              `Eval failed for review ${review.id} from ${source.domain}:`,
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
              (source.total_reviews_fetched || 0) +
              scrapeResult.reviews.length,
            external_id: scrapeResult.businessInfo.id || source.external_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", source.id);

        results.push({
          workspace: ws.slug,
          source: source.name,
          reviewsScraped: scrapeResult.reviews.length,
          nuggetsStored,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(
          `Research scan failed for ${source.domain}:`,
          errorMsg
        );

        // Mark source as errored
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
