import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import OpenAI from "openai";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { translationId } = (await req.json()) as { translationId: string };

  if (!translationId) {
    return NextResponse.json({ error: "translationId is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data: translation, error: tError } = await db
    .from("ad_copy_translations")
    .select(`*, ad_copy_jobs!inner(id, source_text)`)
    .eq("id", translationId)
    .single();

  if (tError || !translation) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  if (!translation.translated_text) {
    return NextResponse.json({ error: "No translated text to analyze" }, { status: 400 });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a quality analyst for translated ad copy. Compare the original English text with its translation and evaluate quality.

Respond with JSON:
{
  "quality_score": <0-100>,
  "accuracy_issues": [<list of meaning changes or mistranslations>],
  "grammar_issues": [<list of grammar problems>],
  "tone_issues": [<list of tone/style mismatches>],
  "overall_assessment": "<1-2 sentence summary>"
}

Be strict: any grammar error, meaning change, or awkward phrasing should reduce the score.`,
        },
        {
          role: "user",
          content: `Original (English):\n${translation.ad_copy_jobs.source_text}\n\nTranslation (${translation.language}):\n${translation.translated_text}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No analysis returned");

    const analysis = JSON.parse(content);
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    await db
      .from("ad_copy_translations")
      .update({
        quality_score: analysis.quality_score,
        quality_analysis: analysis,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translationId);

    await db.from("usage_logs").insert({
      type: "translation",
      page_id: null,
      translation_id: null,
      model: OPENAI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: calcOpenAICost(inputTokens, outputTokens),
      metadata: {
        purpose: "ad_copy_quality_analysis",
        ad_copy_translation_id: translationId,
      },
    });

    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
