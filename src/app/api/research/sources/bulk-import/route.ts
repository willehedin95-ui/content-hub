import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import {
  evaluateReview,
  getMarketRelevance,
} from "@/lib/research-evaluate";

export const maxDuration = 300;

const MIN_SIGNIFICANCE = 4;
const EVAL_DELAY_MS = 150;

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

/** CORS headers for Chrome extension requests */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * Bulk import posts from Chrome extension (FB Group Collector etc).
 *
 * Body: {
 *   source_name: string,       // Display name for the source
 *   platform: string,           // e.g. "facebook_group"
 *   workspace_id?: string,      // Optional — falls back to cookie
 *   posts: Array<{
 *     text: string,
 *     author?: string,
 *     date?: string,
 *     images?: string[],
 *     reactions?: string,
 *     comments_count?: number,
 *   }>
 * }
 */
export async function POST(req: NextRequest) {
  try {
    // Try cookie-based auth first, then body workspace_id
    let workspaceId = await getWorkspaceId().catch(() => null);
    const body = await req.json();

    if (!workspaceId && body.workspace_id) {
      // Verify it's a valid workspace
      const db = createServerSupabase();
      const { data: ws } = await db
        .from("workspaces")
        .select("id")
        .eq("id", body.workspace_id)
        .single();
      if (ws) workspaceId = ws.id;
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace — set workspace_id in request or log in" },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { source_name, platform, posts } = body;

    if (!source_name || !posts?.length) {
      return NextResponse.json(
        { error: "source_name and posts[] are required" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const db = createServerSupabase();

    // Auto-create or find the source
    const sourceDomain = source_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const { data: source } = await db
      .from("research_sources")
      .upsert(
        {
          workspace_id: workspaceId,
          platform: platform || "manual_import",
          name: source_name,
          domain: sourceDomain,
          is_own_brand: false,
          status: "active",
        },
        { onConflict: "workspace_id,platform,domain" }
      )
      .select()
      .single();

    if (!source) {
      return NextResponse.json(
        { error: "Failed to create/find source" },
        { status: 500, headers: corsHeaders() }
      );
    }

    // Process each post
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      if (!post.text || post.text.length < 15) {
        skipped++;
        continue;
      }

      if (i > 0) {
        await new Promise((r) => setTimeout(r, EVAL_DELAY_MS));
      }

      try {
        const language = detectLanguage(post.text);

        const result = await evaluateReview({
          text: post.text,
          title: null,
          stars: 0,
          language,
          competitorName: source_name,
        });

        if (result.evaluation.significance < MIN_SIGNIFICANCE) {
          skipped++;
          continue;
        }

        const externalId = `ext_${sourceDomain}_${Date.now()}_${i}`;

        const { error: upsertErr } = await db.from("research_nuggets").upsert(
          {
            workspace_id: workspaceId,
            source_id: source.id,
            external_review_id: externalId,
            review_stars: 0,
            review_date: post.date || new Date().toISOString(),
            reviewer_name: post.author || "Unknown",
            review_title: null,
            review_text: post.text,
            language,
            market_relevance: getMarketRelevance(language),
            sentiment: result.evaluation.sentiment,
            significance: result.evaluation.significance,
            tags: result.evaluation.tags,
            customer_phrases: result.evaluation.customer_phrases,
            pain_points: result.evaluation.pain_points,
            desires: result.evaluation.desires,
            competitor_name: source_name,
            summary: result.evaluation.summary,
            ai_evaluation: result.evaluation as unknown as Record<
              string,
              unknown
            >,
          },
          { onConflict: "workspace_id,source_id,external_review_id" }
        );

        if (!upsertErr) imported++;
      } catch {
        // Skip failed evaluations
      }
    }

    // Update source metadata
    await db
      .from("research_sources")
      .update({
        total_reviews_fetched: (source.total_reviews_fetched || 0) + imported,
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id);

    return NextResponse.json(
      { imported, skipped, nuggets_created: imported, source_id: source.id },
      { headers: corsHeaders() }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: corsHeaders() }
    );
  }
}
