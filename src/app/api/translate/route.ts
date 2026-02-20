import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { extractBlocks, stripForTranslation, restoreAfterTranslation } from "@/lib/html-parser";
import { translateFullHtml, translateMetas } from "@/lib/openai";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";
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

  // Atomically claim this translation — prevents concurrent requests
  const STALE_MS = 10 * 60 * 1000; // 10 minutes
  const { data: existing } = await db
    .from("translations")
    .select("id, status, updated_at")
    .eq("page_id", page_id)
    .eq("language", language)
    .eq("variant", "control")
    .single();

  if (existing) {
    if (existing.status === "translating") {
      const age = Date.now() - new Date(existing.updated_at).getTime();
      if (age < STALE_MS) {
        return NextResponse.json(
          { error: "Translation already in progress" },
          { status: 409 }
        );
      }
      // Stale claim — reset so it can be re-claimed
      await db.from("translations")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("status", "translating");
    }
    // Atomic update: only claim if still not "translating"
    const { data: claimed } = await db
      .from("translations")
      .update({ status: "translating", updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .neq("status", "translating")
      .select("id")
      .single();

    if (!claimed) {
      return NextResponse.json(
        { error: "Translation already in progress" },
        { status: 409 }
      );
    }
  } else {
    // Use upsert to handle race condition when two requests arrive simultaneously
    // for the same page/language with no existing row — the unique constraint
    // ensures only one wins, the other gets the existing row back.
    const { data: inserted } = await db.from("translations").upsert(
      {
        page_id,
        language,
        variant: "control",
        status: "translating",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "page_id,language,variant" }
    ).select("id, status").single();

    // If the upsert hit an existing row that's already translating, reject
    if (inserted && inserted.status !== "translating") {
      await db.from("translations")
        .update({ status: "translating", updated_at: new Date().toISOString() })
        .eq("id", inserted.id)
        .neq("status", "translating");
    }
  }

  try {
    const startTime = Date.now();

    // Extract metas from the original HTML (for SEO title/description)
    const { metas } = extractBlocks(page.original_html);

    // Strip non-translatable content (CSS, SVGs, scripts) from the body.
    // This reduces ~146K chars → ~51K chars (~13K tokens) — well within GPT limits.
    const { bodyHtml, headHtml, stripped } = stripForTranslation(page.original_html);

    // Full-HTML translation: send the cleaned body to GPT as one piece.
    // GPT sees the full narrative and translates all text naturally — like
    // pasting the full text into a GPT chat and asking it to translate.
    const [htmlResult, metasResult] = await Promise.all([
      translateFullHtml(bodyHtml, language as Language, apiKey),
      translateMetas(metas, language as Language, apiKey),
    ]);

    const translatedMetas = metasResult.result;

    // Restore stripped elements + re-attach head + apply meta translations
    const translatedHtml = restoreAfterTranslation(
      htmlResult.result,
      headHtml,
      stripped,
      translatedMetas,
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
          translated_texts: null,
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
    const totalInputTokens = htmlResult.inputTokens + metasResult.inputTokens;
    const totalOutputTokens = htmlResult.outputTokens + metasResult.outputTokens;
    const costUsd = calcOpenAICost(totalInputTokens, totalOutputTokens);

    await db.from("usage_logs").insert({
      type: "translation",
      page_id,
      translation_id: translation.id,
      model: OPENAI_MODEL,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: costUsd,
      metadata: {
        language,
        approach: "full-html",
        duration_ms: Date.now() - startTime,
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
