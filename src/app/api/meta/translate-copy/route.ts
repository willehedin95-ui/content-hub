import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import OpenAI from "openai";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";
import { Language, LANGUAGES } from "@/types";
import { getShortLocalizationNote } from "@/lib/localization";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { primary_text, headline, language } = (await req.json()) as {
    primary_text: string;
    headline: string;
    language: string;
  };

  if (!primary_text || !language) {
    return NextResponse.json(
      { error: "primary_text and language are required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey });
  const langLabel =
    LANGUAGES.find((l) => l.value === language)?.label ?? language;
  const langCode = language as Language;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `You are a professional ad copywriter and translator. Translate the following ad copy fields from English to ${langLabel}.
Maintain the tone, style, and persuasive power of the original.
Adapt cultural references and idioms naturally.${getShortLocalizationNote(langCode)}
Return a JSON object with exactly two keys: "primary_text" and "headline". No other text.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            primary_text,
            headline: headline || "",
          }),
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) throw new Error("No translation returned");

    const parsed = JSON.parse(content) as {
      primary_text: string;
      headline: string;
    };

    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    // Log usage
    const db = createServerSupabase();
    await db.from("usage_logs").insert({
      type: "translation",
      page_id: null,
      translation_id: null,
      model: OPENAI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: calcOpenAICost(inputTokens, outputTokens),
      metadata: {
        purpose: "adset_copy_translation",
        language,
      },
    });

    return NextResponse.json({
      translated_primary_text: parsed.primary_text,
      translated_headline: parsed.headline,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Translation failed" },
      { status: 500 }
    );
  }
}
