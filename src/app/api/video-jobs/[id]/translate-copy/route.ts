import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { translateAdCopyBatch } from "@/lib/meta-push";
import type { Language, ConceptCopyTranslations, ConceptCopyTranslation } from "@/types";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const db = createServerSupabase();

  // 1. Load the video job + video translations (to get all covered languages)
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*, video_translations(language)")
    .eq("id", id)
    .single();

  if (jobError || !job) {
    return safeError(jobError, "Video job not found", 404);
  }

  // 2. Get primary texts and headlines from request body OR job fields
  const primaryTexts: string[] =
    body.primaryTexts?.length > 0
      ? body.primaryTexts
      : (job.ad_copy_primary as string[]) || [];

  const headlines: string[] =
    body.headlines?.length > 0
      ? body.headlines
      : (job.ad_copy_headline as string[]) || [];

  // 3. Validate at least one primary text exists
  if (primaryTexts.length === 0) {
    return NextResponse.json(
      { error: "No primary texts provided and none found on video job" },
      { status: 400 }
    );
  }

  // 4. Build covered languages: target_languages + any extra from video_translations
  const baseLangs = (job.target_languages as string[]) || [];
  const translationLangs = ((job.video_translations ?? []) as Array<{ language: string }>)
    .map((t) => t.language);
  const originalLang = baseLangs[0] || translationLangs[0] || "sv";
  const targetLanguages = [
    originalLang,
    ...new Set([...baseLangs, ...translationLangs].filter((l) => l !== originalLang)),
  ];
  if (targetLanguages.length === 0) {
    return NextResponse.json(
      { error: "No target languages set on video job" },
      { status: 400 }
    );
  }

  // 5. Determine source language (the original ad copy language = first target lang)
  const sourceLang = originalLang as Language;

  // 6. Translate for each target language
  const translations: ConceptCopyTranslations = {};

  for (const lang of targetLanguages) {
    // Original language: copy texts as-is (no translation needed)
    if (lang === sourceLang) {
      translations[lang] = {
        primary_texts: [...primaryTexts],
        headlines: [...headlines],
        quality_score: null,
        quality_analysis: null,
        status: "completed",
      };
      continue;
    }

    const entry: ConceptCopyTranslation = {
      primary_texts: [],
      headlines: [],
      quality_score: null,
      quality_analysis: null,
      status: "translating",
    };

    try {
      const result = await translateAdCopyBatch(
        primaryTexts,
        headlines,
        lang as Language,
        db,
        sourceLang
      );
      entry.primary_texts = result.translatedPrimaries;
      entry.headlines = result.translatedHeadlines;
      entry.status = "completed";
    } catch (err) {
      entry.status = "error";
      entry.error = err instanceof Error ? err.message : "Translation failed";
    }

    translations[lang] = entry;
  }

  // 6. Update video_jobs.ad_copy_translations
  const { error: updateError } = await db
    .from("video_jobs")
    .update({
      ad_copy_translations: translations,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return safeError(updateError, "Failed to save translations");
  }

  // 7. Return the translations
  return NextResponse.json({
    success: true,
    translations,
  });
}
