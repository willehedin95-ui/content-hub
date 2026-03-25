/**
 * Manual Trustpilot scan — runs locally with no timeout.
 *
 * Usage:
 *   npx tsx scripts/scan-trustpilot.ts
 *   npx tsx scripts/scan-trustpilot.ts --source=osloskinlab.se
 */

import { createClient } from "@supabase/supabase-js";
import { scrapeReviews, type TrustpilotReview } from "../src/lib/trustpilot";
import { evaluateReview, getMarketRelevance } from "../src/lib/research-evaluate";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WORKSPACE_ID = "6a18a542-4e8a-4d51-bc56-afd49fd1d9b7"; // Hydro13

const MAX_PAGES_BACKFILL = 10;
const EVAL_DELAY_MS = 150;
const MIN_SIGNIFICANCE = 4;

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function scanSource(source: {
  id: string;
  name: string;
  domain: string;
  is_own_brand: boolean;
  language: string;
  last_scanned_at: string | null;
  last_review_date: string | null;
}) {
  console.log(`\n🔍 Scanning: ${source.name} (${source.domain})`);

  const isBackfill = !source.last_scanned_at;
  const maxPages = MAX_PAGES_BACKFILL;
  const sinceDate = source.last_review_date
    ? new Date(source.last_review_date)
    : undefined;

  let reviews: TrustpilotReview[];
  try {
    const scrapeResult = await scrapeReviews(source.domain, { maxPages, sinceDate });
    reviews = scrapeResult.reviews;
    console.log(`   Scraped ${reviews.length} reviews from ${scrapeResult.pagesScraped} pages (${scrapeResult.totalReviews} total on Trustpilot)`);
  } catch (err) {
    console.error(`   ❌ Scrape failed:`, err instanceof Error ? err.message : err);
    await db
      .from("research_sources")
      .update({ status: "error", error_message: String(err) })
      .eq("id", source.id);
    return { reviewsScraped: 0, nuggetsStored: 0, error: String(err) };
  }

  if (!reviews.length) {
    console.log(`   No new reviews found`);
    await db
      .from("research_sources")
      .update({ last_scanned_at: new Date().toISOString() })
      .eq("id", source.id);
    return { reviewsScraped: 0, nuggetsStored: 0 };
  }

  let stored = 0;
  let skipped = 0;

  for (let i = 0; i < reviews.length; i++) {
    const review = reviews[i];

    if (i > 0) await new Promise((r) => setTimeout(r, EVAL_DELAY_MS));

    try {
      const competitorName = source.is_own_brand
        ? "Own Brand"
        : source.name;

      const result = await evaluateReview({
        text: `${review.title ? review.title + ": " : ""}${review.text}`,
        stars: review.rating,
        language: review.language || source.language,
        competitorName,
      });

      if (result.evaluation.significance < MIN_SIGNIFICANCE) {
        skipped++;
        if (i % 10 === 0) {
          process.stdout.write(
            `   [${i + 1}/${reviews.length}] ${stored} stored, ${skipped} skipped\r`
          );
        }
        continue;
      }

      const { error } = await db.from("research_nuggets").upsert(
        {
          workspace_id: WORKSPACE_ID,
          source_id: source.id,
          external_review_id: review.id,
          review_stars: review.rating,
          review_date: review.publishedDate,
          reviewer_name: review.consumerName || "Anonymous",
          review_title: review.title,
          review_text: review.text,
          language: review.language || source.language,
          market_relevance: getMarketRelevance(
            review.language || source.language
          ),
          sentiment: result.evaluation.sentiment,
          significance: result.evaluation.significance,
          tags: result.evaluation.tags,
          customer_phrases: result.evaluation.customer_phrases,
          pain_points: result.evaluation.pain_points,
          desires: result.evaluation.desires,
          competitor_name: competitorName,
          summary: result.evaluation.summary,
          ai_evaluation: result.evaluation as unknown as Record<string, unknown>,
        },
        { onConflict: "workspace_id,source_id,external_review_id" }
      );

      if (error) {
        console.error(`\n   ❌ Upsert error:`, error.message);
      } else {
        stored++;
      }

      process.stdout.write(
        `   [${i + 1}/${reviews.length}] ${stored} stored, ${skipped} skipped\r`
      );
    } catch (err) {
      console.error(
        `\n   ❌ Eval failed for review ${i}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // Update source metadata
  const latestDate = reviews.reduce(
    (max, r) =>
      r.publishedDate > max ? r.publishedDate : max,
    source.last_review_date || ""
  );

  await db
    .from("research_sources")
    .update({
      last_scanned_at: new Date().toISOString(),
      last_review_date: latestDate || undefined,
      total_reviews_fetched: (source as any).total_reviews_fetched + reviews.length,
      status: "active",
      error_message: null,
    })
    .eq("id", source.id);

  console.log(
    `\n   ✅ ${source.name}: ${stored} nuggets stored, ${skipped} below threshold (${reviews.length} reviews scraped)`
  );

  return { reviewsScraped: reviews.length, nuggetsStored: stored };
}

async function main() {
  const filterDomain = process.argv.find((a) => a.startsWith("--source="))?.split("=")[1];

  console.log("🔬 Trustpilot Manual Scan");
  console.log(`   Workspace: ${WORKSPACE_ID}`);
  if (filterDomain) console.log(`   Filter: ${filterDomain}`);

  let query = db
    .from("research_sources")
    .select("*")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("platform", "trustpilot")
    .eq("status", "active");

  if (filterDomain) {
    query = query.eq("domain", filterDomain);
  }

  const { data: sources, error } = await query;
  if (error || !sources?.length) {
    console.error("No active Trustpilot sources found");
    return;
  }

  console.log(`   Found ${sources.length} sources to scan`);

  let totalReviews = 0;
  let totalNuggets = 0;

  for (const source of sources) {
    const result = await scanSource(source);
    totalReviews += result.reviewsScraped;
    totalNuggets += result.nuggetsStored;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ${totalReviews} reviews scraped from ${sources.length} sources`);
  console.log(`   ${totalNuggets} nuggets stored (significance >= ${MIN_SIGNIFICANCE})`);
}

main().catch(console.error);
