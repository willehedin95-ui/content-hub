import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { extractContent, extractReadableText, applyTranslations } from "@/lib/html-parser";
import { translateBatch, translateMetas } from "@/lib/openai";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";
import { Language, PageQualityAnalysis } from "@/types";

export const maxDuration = 180;

/**
 * Re-translate a page using quality analysis feedback to fix specific issues.
 * Uses the full page context + quality issues to produce a better translation.
 */
export async function POST(req: NextRequest) {
  const { translation_id } = await req.json();

  if (!translation_id) {
    return NextResponse.json(
      { error: "translation_id is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    );
  }

  const db = createServerSupabase();

  // Load the translation + page
  const { data: translation, error: tError } = await db
    .from("translations")
    .select("*, pages!inner(original_html)")
    .eq("id", translation_id)
    .single();

  if (tError || !translation) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  // Build quality feedback string from the analysis
  const analysis = translation.quality_analysis as PageQualityAnalysis | null;
  let qualityFeedback = "";
  if (analysis) {
    const parts: string[] = [];
    if (analysis.overall_assessment) {
      parts.push(`Overall: ${analysis.overall_assessment}`);
    }
    if (analysis.fluency_issues?.length > 0) {
      parts.push(`Fluency issues: ${analysis.fluency_issues.join("; ")}`);
    }
    if (analysis.grammar_issues?.length > 0) {
      parts.push(`Grammar issues: ${analysis.grammar_issues.join("; ")}`);
    }
    if (analysis.context_errors?.length > 0) {
      parts.push(`Context errors: ${analysis.context_errors.join("; ")}`);
    }
    if (analysis.name_localization?.length > 0) {
      parts.push(`Unlocalized names: ${analysis.name_localization.join("; ")}`);
    }
    qualityFeedback = parts.join("\n");
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
    // Stale claim — reset so it can be re-claimed
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
    const originalHtml = translation.pages.original_html;
    const language = translation.language as Language;

    // Extract translatable content
    const { texts, metas, alts, modifiedHtml } = extractContent(originalHtml);
    const pageContext = extractReadableText(originalHtml);

    // Translate with full context + quality feedback
    const allTexts = [
      ...texts,
      ...alts.map(({ id, alt }: { id: string; alt: string }) => ({ id, text: alt })),
    ];
    const batchResult = await translateBatch(
      allTexts,
      language,
      apiKey,
      { pageContext, qualityFeedback: qualityFeedback || undefined }
    );
    const metasResult = await translateMetas(metas, language, apiKey);

    const translatedTexts = batchResult.result;
    const translatedMetas = metasResult.result;

    // Reconstruct HTML
    const translatedHtml = applyTranslations(modifiedHtml, translatedTexts, translatedMetas);

    // Save
    const { error: saveError } = await db
      .from("translations")
      .update({
        translated_html: translatedHtml,
        translated_texts: translatedTexts,
        seo_title: translatedMetas.title || null,
        seo_description: translatedMetas.description || null,
        status: "translated",
        quality_score: null,
        quality_analysis: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translation_id);

    if (saveError) {
      throw new Error(saveError.message);
    }

    // Log usage
    const totalInputTokens = batchResult.inputTokens + metasResult.inputTokens;
    const totalOutputTokens = batchResult.outputTokens + metasResult.outputTokens;

    await db.from("usage_logs").insert({
      type: "translation",
      page_id: translation.page_id,
      translation_id,
      model: OPENAI_MODEL,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: calcOpenAICost(totalInputTokens, totalOutputTokens),
      metadata: {
        language,
        purpose: "fix_quality",
        text_count: allTexts.length,
        chunk_count: Math.ceil(allTexts.length / 80),
        had_quality_feedback: !!qualityFeedback,
      },
    });

    return NextResponse.json({ success: true, id: translation_id });
  } catch (err) {
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
