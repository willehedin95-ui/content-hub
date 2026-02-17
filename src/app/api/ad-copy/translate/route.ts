import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import OpenAI from "openai";
import { calcOpenAICost } from "@/lib/pricing";
import { Language, LANGUAGES } from "@/types";
import { getShortLocalizationNote } from "@/lib/localization";

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

  if (translation.status !== "pending") {
    return NextResponse.json({ error: `Already ${translation.status}` }, { status: 400 });
  }

  await db
    .from("ad_copy_translations")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", translationId);

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

    const openai = new OpenAI({ apiKey });
    const langLabel = LANGUAGES.find((l) => l.value === translation.language)?.label ?? translation.language;
    const langCode = translation.language as Language;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `You are a professional ad copywriter and translator. Translate the following ad copy from English to ${langLabel}.
Maintain the tone, style, and persuasive power of the original.
Adapt cultural references and idioms naturally.${getShortLocalizationNote(langCode)}
Return ONLY the translated text, no explanations.`,
        },
        {
          role: "user",
          content: translation.ad_copy_jobs.source_text,
        },
      ],
    });

    const translatedText = response.choices[0]?.message?.content?.trim();
    if (!translatedText) throw new Error("No translation returned");

    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    await db
      .from("ad_copy_translations")
      .update({
        translated_text: translatedText,
        status: "completed",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translationId);

    // Log usage
    await db.from("usage_logs").insert({
      type: "translation",
      page_id: null,
      translation_id: null,
      model: "gpt-4o",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: calcOpenAICost(inputTokens, outputTokens),
      metadata: {
        purpose: "ad_copy_translation",
        ad_copy_job_id: translation.ad_copy_jobs.id,
        ad_copy_translation_id: translationId,
        language: translation.language,
      },
    });

    // Check if all translations for this job are done
    const { data: allTranslations } = await db
      .from("ad_copy_translations")
      .select("status")
      .eq("job_id", translation.ad_copy_jobs.id);

    const allDone = allTranslations?.every((t) => t.status === "completed" || t.status === "failed");
    if (allDone) {
      await db
        .from("ad_copy_jobs")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", translation.ad_copy_jobs.id);
    }

    return NextResponse.json({ translated_text: translatedText });
  } catch (error) {
    await db
      .from("ad_copy_translations")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Translation failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", translationId);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Translation failed" },
      { status: 500 }
    );
  }
}
