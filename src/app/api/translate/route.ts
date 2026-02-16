import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { extractContent, applyTranslations } from "@/lib/html-parser";
import { translateBatch, translateMetas } from "@/lib/openai";
import { calcOpenAICost } from "@/lib/pricing";
import { Language } from "@/types";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const { page_id, language } = await req.json();

  if (!page_id || !language) {
    return NextResponse.json(
      { error: "page_id and language are required" },
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

  // Fetch the page
  const { data: page, error: pageError } = await db
    .from("pages")
    .select("*")
    .eq("id", page_id)
    .single();

  if (pageError || !page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  // Guard against concurrent translation requests (e.g. double-click)
  const { data: existing } = await db
    .from("translations")
    .select("status")
    .eq("page_id", page_id)
    .eq("language", language)
    .eq("variant", "control")
    .single();

  if (existing?.status === "translating") {
    return NextResponse.json(
      { error: "Translation already in progress" },
      { status: 409 }
    );
  }

  // Mark as translating
  await db.from("translations").upsert(
    {
      page_id,
      language,
      variant: "control",
      status: "translating",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "page_id,language,variant" }
  );

  try {
    // Extract translatable content (modifiedHtml has {{id}} placeholders already injected)
    const { texts, metas, alts, modifiedHtml } = extractContent(page.original_html);

    // Translate text nodes + alts together
    const allTexts = [
      ...texts,
      ...alts.map(({ id, alt }) => ({ id, text: alt })),
    ];
    const batchResult = await translateBatch(
      allTexts,
      language as Language,
      apiKey
    );
    const metasResult = await translateMetas(
      metas,
      language as Language,
      apiKey
    );

    const translatedTexts = batchResult.result;
    const translatedMetas = metasResult.result;

    // Reconstruct HTML using modifiedHtml (which has the {{id}} placeholders)
    const translatedHtml = applyTranslations(
      modifiedHtml,
      translatedTexts,
      translatedMetas
    );

    // Save translation
    const { data: translation, error: saveError } = await db
      .from("translations")
      .upsert(
        {
          page_id,
          language,
          variant: "control",
          translated_html: translatedHtml,
          translated_texts: translatedTexts,
          seo_title: translatedMetas.title || null,
          seo_description: translatedMetas.description || null,
          status: "translated",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "page_id,language,variant" }
      )
      .select()
      .single();

    if (saveError) {
      throw new Error(saveError.message);
    }

    // Log usage
    const totalInputTokens =
      batchResult.inputTokens + metasResult.inputTokens;
    const totalOutputTokens =
      batchResult.outputTokens + metasResult.outputTokens;
    const costUsd = calcOpenAICost(totalInputTokens, totalOutputTokens);

    await db.from("usage_logs").insert({
      type: "translation",
      page_id,
      translation_id: translation.id,
      model: "gpt-4o",
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: costUsd,
      metadata: {
        language,
        text_count: allTexts.length,
        chunk_count: Math.ceil(allTexts.length / 80),
      },
    });

    return NextResponse.json(translation);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed";

    await db.from("translations").upsert(
      {
        page_id,
        language,
        variant: "control",
        status: "error",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "page_id,language,variant" }
    );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
