/**
 * Import existing VOC research files into the research_nuggets table.
 *
 * Parses:
 * 1. CORE INSIGHTS KOLLAGEN.txt — individual quotes + commentary paragraphs
 * 2. RAW MARKET COMMENTS KOLLAGEN.txt — forum discussion threads
 *
 * Each chunk is evaluated by Haiku and stored as a manual_import nugget.
 *
 * Usage:
 *   npx tsx scripts/import-research-seed.ts
 *
 * Set WORKSPACE_ID env var or defaults to Hydro13 workspace.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { evaluateReview, getMarketRelevance } from "../src/lib/research-evaluate";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WORKSPACE_ID = process.env.WORKSPACE_ID || "6a18a542-c1c4-44c5-bcf0-c6d38e432e7a"; // Hydro13

const MIN_SIGNIFICANCE = 4;
const EVAL_DELAY_MS = 200;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getOrCreateManualSource(
  name: string,
  domain: string
): Promise<string> {
  // Check if source exists
  const { data: existing } = await db
    .from("research_sources")
    .select("id")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("platform", "manual_import")
    .eq("domain", domain)
    .single();

  if (existing) return existing.id;

  const { data, error } = await db
    .from("research_sources")
    .insert({
      workspace_id: WORKSPACE_ID,
      platform: "manual_import",
      name,
      domain,
      is_own_brand: false,
      language: "sv",
      status: "active",
      config: {},
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create source: ${error.message}`);
  return data!.id;
}

/**
 * Parse CORE INSIGHTS — mix of quotes (in quotes) and commentary paragraphs.
 * We extract individual quotes as separate chunks.
 */
function parseCoreInsights(text: string): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n");

  let currentParagraph = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentParagraph.trim()) {
        chunks.push(currentParagraph.trim());
        currentParagraph = "";
      }
      continue;
    }
    currentParagraph += (currentParagraph ? " " : "") + trimmed;
  }
  if (currentParagraph.trim()) {
    chunks.push(currentParagraph.trim());
  }

  // Filter out very short or useless chunks
  return chunks.filter((c) => c.length >= 15);
}

/**
 * Parse RAW MARKET COMMENTS — forum threads with names, timestamps, Reply/Share markers.
 * Group consecutive lines into individual comments (split on "Reply" / "Share" / name patterns).
 */
function parseRawComments(text: string): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n");

  let currentComment = "";
  let currentAuthor = "";

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip empty, "Reply", "Share", timestamps like "31w", "7w"
    if (!trimmed) continue;
    if (/^(Reply|Share|Like|Comment)$/i.test(trimmed)) continue;
    if (/^\d+[wdh]$/.test(trimmed)) continue;
    if (trimmed === "No photo description available.") continue;

    // Detect author lines — typically short (< 40 chars), no period at end,
    // and the next significant line is the comment text
    const isLikelyAuthor =
      trimmed.length < 50 &&
      !trimmed.includes(".") &&
      !trimmed.startsWith('"') &&
      /^[A-ZÅÄÖ]/.test(trimmed) &&
      !/[.!?:,]$/.test(trimmed);

    if (isLikelyAuthor && currentComment) {
      // Save previous comment
      if (currentComment.length >= 20) {
        chunks.push(
          currentAuthor
            ? `[${currentAuthor}] ${currentComment}`
            : currentComment
        );
      }
      currentAuthor = trimmed;
      currentComment = "";
    } else if (isLikelyAuthor && !currentComment) {
      currentAuthor = trimmed;
    } else {
      currentComment += (currentComment ? " " : "") + trimmed;
    }
  }

  // Last comment
  if (currentComment.length >= 20) {
    chunks.push(
      currentAuthor ? `[${currentAuthor}] ${currentComment}` : currentComment
    );
  }

  return chunks;
}

async function importFile(
  filePath: string,
  sourceName: string,
  sourceDomain: string,
  parser: (text: string) => string[]
) {
  console.log(`\n📂 Reading: ${filePath}`);
  const text = readFileSync(filePath, "utf-8");
  const chunks = parser(text);
  console.log(`   Found ${chunks.length} chunks to evaluate`);

  const sourceId = await getOrCreateManualSource(sourceName, sourceDomain);

  let stored = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Rate limiting
    if (i > 0) {
      await new Promise((r) => setTimeout(r, EVAL_DELAY_MS));
    }

    try {
      // Detect language — these files are a mix of Swedish and English
      const hasSwedish = /[åäöÅÄÖ]/.test(chunk) || /\b(och|att|för|det|har|inte|med|som|kan|man|på|är|var)\b/i.test(chunk);
      const language = hasSwedish ? "sv" : "en";

      const result = await evaluateReview({
        text: chunk,
        stars: 0, // No star rating for manual imports
        language,
        competitorName: "Market Research",
      });

      if (result.evaluation.significance < MIN_SIGNIFICANCE) {
        skipped++;
        if (i % 20 === 0) {
          process.stdout.write(`   [${i + 1}/${chunks.length}] ${stored} stored, ${skipped} skipped\r`);
        }
        continue;
      }

      // Generate a deterministic external_review_id for dedup
      const externalId = `seed_${sourceDomain}_${i}`;

      const { error } = await db.from("research_nuggets").upsert(
        {
          workspace_id: WORKSPACE_ID,
          source_id: sourceId,
          external_review_id: externalId,
          review_stars: 0,
          review_date: new Date("2025-01-01").toISOString(), // Approximate date
          reviewer_name: "VOC Research",
          review_title: null,
          review_text: chunk,
          language,
          market_relevance: getMarketRelevance(language),
          sentiment: result.evaluation.sentiment,
          significance: result.evaluation.significance,
          tags: result.evaluation.tags,
          customer_phrases: result.evaluation.customer_phrases,
          pain_points: result.evaluation.pain_points,
          desires: result.evaluation.desires,
          competitor_name: "Market Research",
          summary: result.evaluation.summary,
          ai_evaluation: result.evaluation as unknown as Record<string, unknown>,
        },
        { onConflict: "workspace_id,source_id,external_review_id" }
      );

      if (error) {
        console.error(`\n   ❌ Upsert error for chunk ${i}:`, error.message);
        errors++;
      } else {
        stored++;
      }

      process.stdout.write(
        `   [${i + 1}/${chunks.length}] ${stored} stored, ${skipped} skipped, ${errors} errors\r`
      );
    } catch (err) {
      errors++;
      console.error(
        `\n   ❌ Eval failed for chunk ${i}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `\n   ✅ Done: ${stored} stored, ${skipped} below threshold, ${errors} errors`
  );
  return { stored, skipped, errors };
}

async function main() {
  console.log("🔬 Research Seed Data Import");
  console.log(`   Workspace: ${WORKSPACE_ID}`);

  const CORE_INSIGHTS_PATH =
    "/Users/williamhedin/Downloads/Claude projects/SwedishBalance/CORE INSIGHTS KOLLAGEN.txt";
  const RAW_COMMENTS_PATH =
    "/Users/williamhedin/Downloads/Claude projects/SwedishBalance/RAW MARKET COMMENTS KOLLAGEN.txt";

  const r1 = await importFile(
    CORE_INSIGHTS_PATH,
    "Core Insights (VOC)",
    "core-insights-kollagen",
    parseCoreInsights
  );

  const r2 = await importFile(
    RAW_COMMENTS_PATH,
    "Raw Market Comments",
    "raw-market-comments-kollagen",
    parseRawComments
  );

  console.log("\n📊 Summary:");
  console.log(
    `   Core Insights: ${r1.stored} nuggets stored`
  );
  console.log(
    `   Raw Comments: ${r2.stored} nuggets stored`
  );
  console.log(
    `   Total: ${r1.stored + r2.stored} nuggets`
  );
}

main().catch(console.error);
