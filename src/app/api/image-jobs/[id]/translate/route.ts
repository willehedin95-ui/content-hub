import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { generateImage } from "@/lib/kie";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { KIE_MODEL, STORAGE_BUCKET } from "@/lib/constants";
import { Language, LANGUAGES } from "@/types";
import { getShortLocalizationNote } from "@/lib/localization";

export const maxDuration = 180;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const { translationId, corrected_text, visual_instructions } = (await req.json()) as {
    translationId: string;
    corrected_text?: string;
    visual_instructions?: string;
  };

  if (!translationId) {
    return NextResponse.json({ error: "translationId is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Look up the translation and verify it belongs to this job
  const { data: translation, error: tError } = await db
    .from("image_translations")
    .select(`*, source_images!inner(id, original_url, job_id)`)
    .eq("id", translationId)
    .single();

  if (tError || !translation) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  if (translation.source_images.job_id !== jobId) {
    return NextResponse.json({ error: "Translation does not belong to this job" }, { status: 400 });
  }

  // Atomically claim: only update if status is in an allowed state
  const isRetry = corrected_text || visual_instructions;
  const allowedStatuses = isRetry ? ["completed", "failed"] : ["pending"];
  const { data: claimed } = await db
    .from("image_translations")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", translationId)
    .in("status", allowedStatuses)
    .select("id")
    .single();

  if (!claimed) {
    return NextResponse.json(
      { error: "Translation is already being processed" },
      { status: 409 }
    );
  }

  // Determine the next version number
  const { data: existingVersions } = await db
    .from("versions")
    .select("version_number")
    .eq("image_translation_id", translationId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersionNumber = (existingVersions?.[0]?.version_number ?? 0) + 1;
  const startTime = Date.now();

  try {
    // Build the prompt
    const langLabel = LANGUAGES.find((l) => l.value === translation.language)?.label ?? translation.language;
    const langCode = translation.language as Language;
    let prompt = `Recreate this exact image but translate all text from English to ${langLabel}. Keep the same visual style, layout, colors, and design. Only translate the text.${getShortLocalizationNote(langCode)}`;

    // Enhanced prompt for retries with corrections
    if (corrected_text || visual_instructions) {
      prompt = `Recreate this exact image but translate all text from English to ${langLabel}. Keep the same visual style, layout, colors, and design. Only translate the text.`;
      if (corrected_text) {
        prompt += `\n\nIMPORTANT - Use these exact corrected translations:\n${corrected_text}`;
      }
      if (visual_instructions) {
        prompt += `\n\nADDITIONAL VISUAL INSTRUCTIONS:\n${visual_instructions}`;
      }
    }

    // Call Kie AI
    const resultUrls = await generateImage(
      prompt,
      [translation.source_images.original_url],
      translation.aspect_ratio || "1:1"
    );

    if (!resultUrls?.length) {
      throw new Error("No image generated");
    }

    // Download from Kie CDN
    const resultRes = await fetch(resultUrls[0]);
    if (!resultRes.ok) {
      throw new Error("Failed to fetch generated image from Kie.ai");
    }
    const buffer = Buffer.from(await resultRes.arrayBuffer());

    // Upload to Supabase Storage
    const filePath = `image-jobs/${jobId}/${translationId}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, { contentType: "image/png", upsert: false });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const generationTime = (Date.now() - startTime) / 1000;

    // Deactivate previous versions
    await db
      .from("versions")
      .update({ is_active: false })
      .eq("image_translation_id", translationId);

    // Create new version row
    const { data: version, error: vError } = await db
      .from("versions")
      .insert({
        image_translation_id: translationId,
        version_number: nextVersionNumber,
        translated_url: urlData.publicUrl,
        generation_time_seconds: generationTime,
        corrected_text: corrected_text || null,
        visual_instructions: visual_instructions || null,
        is_active: true,
      })
      .select()
      .single();

    if (vError || !version) {
      throw new Error(`Failed to create version: ${vError?.message}`);
    }

    // Update translation as completed with active version
    await db
      .from("image_translations")
      .update({
        status: "completed",
        translated_url: urlData.publicUrl,
        active_version_id: version.id,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translationId);

    // Log usage
    await db.from("usage_logs").insert({
      type: "image_generation",
      page_id: null,
      translation_id: null,
      model: KIE_MODEL,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: KIE_IMAGE_COST,
      metadata: {
        image_job_id: jobId,
        image_translation_id: translationId,
        version_id: version.id,
        version_number: nextVersionNumber,
        source_url: translation.source_images.original_url,
        generation_time_seconds: generationTime,
      },
    });

    // Check if all translations for this job are done
    await updateJobStatus(db, jobId);

    return NextResponse.json({
      translatedUrl: urlData.publicUrl,
      versionId: version.id,
      versionNumber: nextVersionNumber,
    });
  } catch (error) {
    const generationTime = (Date.now() - startTime) / 1000;

    // Create a failed version row
    await db.from("versions").insert({
      image_translation_id: translationId,
      version_number: nextVersionNumber,
      error_message: error instanceof Error ? error.message : "Unknown error",
      generation_time_seconds: generationTime,
      corrected_text: corrected_text || null,
      visual_instructions: visual_instructions || null,
      is_active: false,
    });

    // Mark as failed
    await db
      .from("image_translations")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", translationId);

    await updateJobStatus(db, jobId);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Translation failed" },
      { status: 500 }
    );
  }
}

async function updateJobStatus(db: ReturnType<typeof createServerSupabase>, jobId: string) {
  const { data: allTranslations } = await db
    .from("image_translations")
    .select("status, source_images!inner(job_id)")
    .eq("source_images.job_id", jobId);

  if (!allTranslations?.length) return;

  const pending = allTranslations.filter((t) => t.status === "pending" || t.status === "processing");
  const failed = allTranslations.filter((t) => t.status === "failed");

  if (pending.length === 0) {
    const newStatus = failed.length > 0 ? "failed" : "completed";
    await db
      .from("image_jobs")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", jobId);
  }
}
