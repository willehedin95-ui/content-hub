import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { extractBlocks, applyBlockTranslations, stripForTranslation, restoreAfterTranslation } from "@/lib/html-parser";
import { translateFullHtml, translateMetas, translateBlocks, translateBatch } from "@/lib/openai";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL, RATE_LIMIT_TRANSLATE, STALE_CLAIM_MS } from "@/lib/constants";
import { Language } from "@/types";
import { checkRateLimit } from "@/lib/rate-limit";

// Pages larger than this (after stripping scripts/styles) use block-based translation
const FULL_HTML_MAX_CHARS = 80_000;

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

  const sourceLanguage: string = page.source_language || "en";

  // Same-language shortcut: if source matches target, copy original HTML as-is.
  // No claim needed — this is an idempotent upsert safe for concurrent requests.
  if (sourceLanguage === language) {
    const { metas } = extractBlocks(page.original_html);

    const { data: translation, error: saveError } = await db
      .from("translations")
      .upsert(
        {
          page_id,
          language,
          variant: "control",
          translated_html: page.original_html,
          translated_texts: null,
          seo_title: metas.title || null,
          seo_description: metas.description || null,
          status: "translated",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "page_id,language,variant" }
      )
      .select()
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json(translation);
  }

  // Claim this translation — prevents concurrent requests.
  // Step 1: Ensure the row exists (upsert with ignoreDuplicates — no-ops if already present)
  const now = new Date().toISOString();

  await db.from("translations").upsert(
    { page_id, language, variant: "control", status: "draft", updated_at: now },
    { onConflict: "page_id,language,variant", ignoreDuplicates: true }
  );

  // Step 2: Check current status and claim if available
  const { data: current } = await db
    .from("translations")
    .select("id,status,updated_at")
    .eq("page_id", page_id)
    .eq("language", language)
    .eq("variant", "control")
    .single();

  if (!current) {
    return NextResponse.json({ error: "Translation row not found" }, { status: 500 });
  }

  // Block if another translation is actively in progress (not stale)
  if (
    current.status === "translating" &&
    new Date(current.updated_at).getTime() > Date.now() - STALE_CLAIM_MS
  ) {
    return NextResponse.json(
      { error: "Translation already in progress" },
      { status: 409 }
    );
  }

  // Claim it
  await db.from("translations")
    .update({ status: "translating", updated_at: now })
    .eq("id", current.id);

  try {

    const startTime = Date.now();

    // Strip non-translatable content (CSS, SVGs, scripts) from the body.
    const { bodyHtml, headHtml, stripped } = stripForTranslation(page.original_html);
    const useLargePageMode = bodyHtml.length > FULL_HTML_MAX_CHARS;

    let translatedHtml: string;
    let totalInputTokens: number;
    let totalOutputTokens: number;
    let approach: string;

    if (!useLargePageMode) {
      // Standard full-HTML translation for normal-sized pages
      const { metas } = extractBlocks(page.original_html);

      const [htmlResult, metasResult] = await Promise.all([
        translateFullHtml(bodyHtml, language as Language, apiKey, sourceLanguage),
        translateMetas(metas, language as Language, apiKey, sourceLanguage),
      ]);

      const translatedMetas = metasResult.result;
      translatedHtml = restoreAfterTranslation(htmlResult.result, headHtml, stripped, translatedMetas);
      totalInputTokens = htmlResult.inputTokens + metasResult.inputTokens;
      totalOutputTokens = htmlResult.outputTokens + metasResult.outputTokens;
      approach = "full-html";
    } else {
      // Block-based translation for large pages — extracts only the text,
      // translates it as JSON, and merges back into the original HTML template.
      console.log(`[translate] Large page (${bodyHtml.length} chars stripped), using block-based translation`);
      const { blocks, metas, alts, modifiedHtml } = extractBlocks(page.original_html);

      const translationOpts = { sourceLanguage };
      const [blocksResult, altsResult, metasResult] = await Promise.all([
        blocks.length > 0
          ? translateBlocks(blocks, language as Language, apiKey, translationOpts)
          : Promise.resolve({ result: {} as Record<string, string>, inputTokens: 0, outputTokens: 0 }),
        alts.length > 0
          ? translateBatch(alts.map((a) => ({ id: a.id, text: a.alt })), language as Language, apiKey, translationOpts)
          : Promise.resolve({ result: {} as Record<string, string>, inputTokens: 0, outputTokens: 0 }),
        translateMetas(metas, language as Language, apiKey, sourceLanguage),
      ]);

      const allTranslations = { ...blocksResult.result, ...altsResult.result };
      translatedHtml = applyBlockTranslations(modifiedHtml, allTranslations, metasResult.result);
      totalInputTokens = blocksResult.inputTokens + altsResult.inputTokens + metasResult.inputTokens;
      totalOutputTokens = blocksResult.outputTokens + altsResult.outputTokens + metasResult.outputTokens;
      approach = "block-based";
    }

    // Save translation
    const seoMetas = extractBlocks(translatedHtml).metas;
    const { data: translation, error: saveError } = await db
      .from("translations")
      .upsert(
        {
          page_id,
          language,
          variant: "control",
          translated_html: translatedHtml,
          translated_texts: null,
          seo_title: seoMetas.title || null,
          seo_description: seoMetas.description || null,
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
        source_language: sourceLanguage,
        approach,
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
