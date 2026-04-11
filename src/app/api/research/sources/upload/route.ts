import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import {
  evaluateReview,
  getMarketRelevance,
} from "@/lib/research-evaluate";
import { safeError } from "@/lib/api-error";

export const maxDuration = 800; // 5 min — evaluation can be slow for large texts

const MIN_SIGNIFICANCE = 4;
const EVAL_DELAY_MS = 200;
const MIN_CHUNK_LENGTH = 15;

/**
 * Split raw text into chunks by paragraph breaks.
 * Filters out very short or useless chunks.
 */
function splitIntoChunks(text: string): string[] {
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

  return chunks.filter((c) => c.length >= MIN_CHUNK_LENGTH);
}

/**
 * Detect language from text content.
 */
function detectLanguage(text: string): string {
  const hasSwedish =
    /[åäöÅÄÖ]/.test(text) ||
    /\b(och|att|för|det|har|inte|med|som|kan|man|på|är|var)\b/i.test(text);
  return hasSwedish ? "sv" : "en";
}

export async function POST(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace" }, { status: 401 });
    }

    const body = await req.json();
    const { source_id, content, language: forcedLanguage } = body;

    if (!source_id || !content) {
      return NextResponse.json(
        { error: "source_id and content are required" },
        { status: 400 }
      );
    }

    const db = createServerSupabase();

    // Verify source belongs to workspace and is manual_import
    const { data: source } = await db
      .from("research_sources")
      .select("id, name, platform")
      .eq("id", source_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!source) {
      return NextResponse.json(
        { error: "Source not found" },
        { status: 404 }
      );
    }

    if (source.platform !== "manual_import") {
      return NextResponse.json(
        { error: "Can only upload to manual_import sources" },
        { status: 400 }
      );
    }

    const chunks = splitIntoChunks(content);
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No valid text chunks found in content" },
        { status: 400 }
      );
    }

    let stored = 0;
    let skipped = 0;
    let errors = 0;

    // Get existing nugget count for this source to generate unique IDs
    const { count: existingCount } = await db
      .from("research_nuggets")
      .select("id", { count: "exact", head: true })
      .eq("source_id", source_id);

    const offset = existingCount ?? 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      if (i > 0) {
        await new Promise((r) => setTimeout(r, EVAL_DELAY_MS));
      }

      try {
        const language = forcedLanguage || detectLanguage(chunk);

        const result = await evaluateReview({
          text: chunk,
          stars: 0,
          language,
          competitorName: source.name,
        });

        if (result.evaluation.significance < MIN_SIGNIFICANCE) {
          skipped++;
          continue;
        }

        const externalId = `manual_${source_id}_${offset + i}`;

        const { error: insertError } = await db
          .from("research_nuggets")
          .upsert(
            {
              workspace_id: workspaceId,
              source_id,
              external_review_id: externalId,
              review_stars: 0,
              review_date: new Date().toISOString(),
              reviewer_name: "Manual Upload",
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
              competitor_name: source.name,
              summary: result.evaluation.summary,
              ai_evaluation: result.evaluation as unknown as Record<
                string,
                unknown
              >,
            },
            { onConflict: "workspace_id,source_id,external_review_id" }
          );

        if (insertError) {
          errors++;
        } else {
          stored++;
        }
      } catch {
        errors++;
      }
    }

    // Update source metadata
    await db
      .from("research_sources")
      .update({
        total_reviews_fetched: (existingCount ?? 0) + stored,
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", source_id);

    return NextResponse.json({
      chunks_found: chunks.length,
      nuggets_created: stored,
      skipped,
      errors,
    });
  } catch (e) {
    return safeError(e, "Failed to upload content");
  }
}
