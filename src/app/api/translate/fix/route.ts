import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { applyCorrectionsList } from "@/lib/openai";
import { PageQualityAnalysis } from "@/types";

export const maxDuration = 60;

/**
 * Fix quality issues in an existing translation.
 * Applies the suggested_corrections from the quality analysis directly —
 * no second GPT call needed since the analysis already identified what to fix.
 */
export async function POST(req: NextRequest) {
  const { translation_id } = await req.json();

  if (!translation_id) {
    return NextResponse.json(
      { error: "translation_id is required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // Load the translation
  const { data: translation, error: tError } = await db
    .from("translations")
    .select("*")
    .eq("id", translation_id)
    .single();

  if (tError || !translation) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  if (!translation.translated_html) {
    return NextResponse.json(
      { error: "No translated HTML to fix — translate the page first" },
      { status: 400 }
    );
  }

  // Get corrections from quality analysis
  const analysis = translation.quality_analysis as PageQualityAnalysis | null;
  const corrections = analysis?.suggested_corrections;

  if (!corrections || corrections.length === 0) {
    return NextResponse.json(
      { error: "No suggested corrections in quality analysis — re-analyze first" },
      { status: 400 }
    );
  }

  // Claim the translation (with stale claim recovery)
  const STALE_MS = 10 * 60 * 1000;
  if (translation.status === "translating") {
    const age = Date.now() - new Date(translation.updated_at).getTime();
    if (age < STALE_MS) {
      return NextResponse.json(
        { error: "Translation is already being processed" },
        { status: 409 }
      );
    }
    await db.from("translations")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", translation_id)
      .eq("status", "translating");
  }
  const { data: claimed } = await db
    .from("translations")
    .update({ status: "translating", updated_at: new Date().toISOString() })
    .eq("id", translation_id)
    .neq("status", "translating")
    .select("id")
    .single();

  if (!claimed) {
    return NextResponse.json(
      { error: "Translation is already being processed" },
      { status: 409 }
    );
  }

  try {
    // Apply corrections directly from the analysis
    const { html: fixedHtml, applied, failed } = applyCorrectionsList(
      translation.translated_html,
      corrections
    );

    console.log(
      `[translate/fix] ${corrections.length} corrections → ${applied} applied, ${failed.length} failed`
    );

    // Build list of successfully applied corrections (for context-aware re-analysis)
    const failedSet = new Set(failed);
    const appliedCorrections = corrections.filter(
      (c) => !failedSet.has(c.find.slice(0, 80))
    );

    // Save the fixed HTML — keep quality_score/quality_analysis for context
    const { error: saveError } = await db
      .from("translations")
      .update({
        translated_html: fixedHtml,
        status: "translated",
        updated_at: new Date().toISOString(),
      })
      .eq("id", translation_id);

    if (saveError) {
      throw new Error(saveError.message);
    }

    return NextResponse.json({
      success: true,
      id: translation_id,
      corrections_applied: applied,
      corrections_failed: failed.length,
      applied_corrections: appliedCorrections,
      previous_score: analysis?.quality_score ?? null,
      previous_issues: {
        fluency_issues: analysis?.fluency_issues ?? [],
        grammar_issues: analysis?.grammar_issues ?? [],
        context_errors: analysis?.context_errors ?? [],
      },
    });
  } catch (err) {
    console.error("[translate/fix] Error:", err);
    const message = err instanceof Error ? err.message : "Fix failed";

    await db
      .from("translations")
      .update({
        status: "error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", translation_id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
