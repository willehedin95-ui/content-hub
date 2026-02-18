import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { extractReadableText } from "@/lib/html-parser";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";
import { LANGUAGES } from "@/types";
import OpenAI from "openai";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { translation_id } = (await req.json()) as { translation_id: string };

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

  // Fetch translation + parent page
  const { data: translation, error: tError } = await db
    .from("translations")
    .select("*, pages!inner(original_html)")
    .eq("id", translation_id)
    .single();

  if (tError || !translation) {
    return NextResponse.json(
      { error: "Translation not found" },
      { status: 404 }
    );
  }

  if (!translation.translated_html) {
    return NextResponse.json(
      { error: "No translated HTML to analyze" },
      { status: 400 }
    );
  }

  try {
    const originalText = extractReadableText(translation.pages.original_html);
    const translatedText = extractReadableText(translation.translated_html);

    const langLabel =
      LANGUAGES.find((l) => l.value === translation.language)?.label ??
      translation.language;

    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a senior quality analyst for translated web pages. You evaluate ${langLabel} translations of English landing pages.

The translation was done by splitting the HTML into individual text nodes and translating each separately. This means context may be lost between styled fragments. Your job is to evaluate how natural and fluent the FULL translated page reads as a whole.

Respond with JSON:
{
  "quality_score": <0-100>,
  "fluency_issues": [<phrases that sound unnatural or awkward for a native ${langLabel} speaker>],
  "grammar_issues": [<specific grammar mistakes>],
  "context_errors": [<places where fragmented translation caused meaning loss or broken sentences>],
  "name_localization": [<any Swedish names (Svensson, Lindberg, etc.) that were NOT replaced with ${langLabel} equivalents>],
  "overall_assessment": "<2-3 sentence summary of quality>"
}

Scoring guide:
- 90-100: Reads naturally as native ${langLabel} content. No grammar errors, names are localized.
- 75-89: Good quality with minor issues. A few awkward phrases but generally fluent.
- 50-74: Noticeable problems. Multiple unnatural phrases, grammar errors, or unlocalized names.
- 0-49: Poor quality. Reads like a machine translation. Significant issues.

Be strict: any Swedish name left unchanged, grammar error, or unnatural phrasing should reduce the score. The page should read as if ORIGINALLY WRITTEN in ${langLabel}.`,
        },
        {
          role: "user",
          content: `Original (English):\n${originalText.slice(0, 8000)}\n\n---\n\nTranslation (${langLabel}):\n${translatedText.slice(0, 8000)}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No analysis returned");

    const analysis = JSON.parse(content);
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    // Save to translation row
    await db
      .from("translations")
      .update({
        quality_score: analysis.quality_score,
        quality_analysis: analysis,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translation_id);

    // Log usage
    await db.from("usage_logs").insert({
      type: "translation",
      page_id: translation.page_id,
      translation_id: translation_id,
      model: OPENAI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: calcOpenAICost(inputTokens, outputTokens),
      metadata: {
        purpose: "page_quality_analysis",
        language: translation.language,
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
