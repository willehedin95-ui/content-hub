import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { extractBlocks, stripForTranslation, restoreAfterTranslation } from "@/lib/html-parser";
import { translateFullHtml, translateMetas } from "@/lib/openai";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL, RATE_LIMIT_TRANSLATE, STALE_CLAIM_MS } from "@/lib/constants";
import { Language } from "@/types";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const rl = checkRateLimit("translate", RATE_LIMIT_TRANSLATE);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60000) / 1000)) } }
    );
  }

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

  // Atomically claim this translation — prevents concurrent requests.
  // Step 1: Ensure the row exists (upsert with ignoreDuplicates — no-ops if already present)
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - STALE_CLAIM_MS).toISOString();

  await db.from("translations").upsert(
    { page_id, language, variant: "control", status: "draft", updated_at: now },
    { onConflict: "page_id,language,variant", ignoreDuplicates: true }
  );

  // Step 2: Atomic claim — single UPDATE that succeeds only if:
  //   - status is NOT "translating", OR
  //   - status IS "translating" but the claim is stale (older than 10 min)
  const { data: claimed } = await db
    .from("translations")
    .update({ status: "translating", updated_at: now })
    .eq("page_id", page_id)
    .eq("language", language)
    .eq("variant", "control")
    .or(`status.neq.translating,updated_at.lt.${staleThreshold}`)
    .select("id")
    .single();

  if (!claimed) {
    return NextResponse.json(
      { error: "Translation already in progress" },
      { status: 409 }
    );
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
