import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { generateImage } from "@/lib/kie";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { KIE_MODEL, STORAGE_BUCKET, RATE_LIMIT_IMAGE_TRANSLATE } from "@/lib/constants";
import { Language, LANGUAGES } from "@/types";
import { getShortLocalizationNote, NEVER_TRANSLATE } from "@/lib/localization";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

export const maxDuration = 180;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit("image-translate", RATE_LIMIT_IMAGE_TRANSLATE);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60000) / 1000)) } }
    );
  }

  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const { translationId, corrected_text, visual_instructions, retry } = (await req.json()) as {
    translationId: string;
    corrected_text?: string;
    visual_instructions?: string;
    retry?: boolean;
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
  const isRetry = corrected_text || visual_instructions || retry;
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
    const neverTranslateList = NEVER_TRANSLATE.join(", ");
    let prompt = `Recreate this exact image but translate all text to ${langLabel}. The source text may be in any language (English, Swedish, or other). Keep the same visual style, layout, colors, and design. Only translate the text.\n\nNEVER TRANSLATE these brand names and certificates — keep them EXACTLY as-is: ${neverTranslateList}.${getShortLocalizationNote(langCode)}`;

    // Enhanced prompt for retries with corrections
    if (corrected_text || visual_instructions) {
      prompt = `Recreate this exact image but translate all text to ${langLabel}. The source text may be in any language (English, Swedish, or other). Keep the same visual style, layout, colors, and design. Only translate the text.\n\nNEVER TRANSLATE these brand names and certificates — keep them EXACTLY as-is: ${neverTranslateList}.`;
      if (corrected_text) {
        prompt += `\n\nIMPORTANT - Use these exact corrected translations:\n${corrected_text}`;
      }
      if (visual_instructions) {
        prompt += `\n\nADDITIONAL VISUAL INSTRUCTIONS:\n${visual_instructions}`;
      }
    }

    // For 9:16: use outpainting from completed 4:5 sibling instead of translating from source
    let imageInputUrl = translation.source_images.original_url;

    if (translation.aspect_ratio === "9:16") {
      const { data: sibling4x5 } = await db
        .from("image_translations")
        .select("translated_url")
        .eq("source_image_id", translation.source_image_id)
        .eq("language", translation.language)
        .eq("aspect_ratio", "4:5")
        .eq("status", "completed")
        .single();

      if (sibling4x5?.translated_url) {
        imageInputUrl = sibling4x5.translated_url;
        prompt = `Extend this image vertically to fill a 9:16 portrait format. Continue the existing background naturally above and below. Do not add any new text, logos, or visual elements in the extended areas — only extend the background seamlessly.`;
      }
      // If no 4:5 sibling found, fall through to normal translation prompt (backward compat)
    }

    // Call Kie AI
    const { urls: resultUrls, costTimeMs } = await generateImage(
      prompt,
      [imageInputUrl],
      translation.aspect_ratio || "4:5"
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
        duration_ms: Math.round(generationTime * 1000),
        kie_cost_time_ms: costTimeMs,
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

    // Send Telegram notification when translations finish
    await notifyTranslationComplete(db, jobId, newStatus, allTranslations.length, failed.length);
  }
}

async function notifyTranslationComplete(
  db: ReturnType<typeof createServerSupabase>,
  jobId: string,
  status: string,
  totalCount: number,
  failedCount: number,
) {
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (!chatId) return;

    const { data: job } = await db
      .from("image_jobs")
      .select("name, concept_number, product, ad_copy_primary, landing_page_id, ab_test_id, launchpad_priority")
      .eq("id", jobId)
      .single();

    if (!job) return;

    const label = job.concept_number ? `#${job.concept_number} ${job.name}` : job.name;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://contenthub.up.railway.app";

    if (status === "failed") {
      const { sendMessage } = await import("@/lib/telegram");
      await sendMessage(chatId, [
        `⚠️ Translations finished with errors`,
        `Concept: ${label}`,
        `${totalCount - failedCount}/${totalCount} succeeded, ${failedCount} failed`,
        ``,
        `${baseUrl}/images/${jobId}`,
      ].join("\n"));
      return;
    }

    // All succeeded — check what's still needed for launchpad
    const missing: string[] = [];
    if (!job.product) missing.push("product");
    if (!job.landing_page_id && !job.ab_test_id) missing.push("landing page");
    if (!job.ad_copy_primary || job.ad_copy_primary.length === 0) missing.push("ad copy");

    const { sendMessage } = await import("@/lib/telegram");
    if (missing.length === 0 && !job.launchpad_priority) {
      await sendMessage(chatId, [
        `✅ Translations complete — ready for launchpad!`,
        `Concept: ${label}`,
        `${totalCount} images translated`,
        ``,
        `${baseUrl}/images/${jobId}`,
      ].join("\n"));
    } else if (missing.length > 0) {
      await sendMessage(chatId, [
        `✅ Translations complete`,
        `Concept: ${label}`,
        `${totalCount} images translated`,
        `Still needed: ${missing.join(", ")}`,
        ``,
        `${baseUrl}/images/${jobId}`,
      ].join("\n"));
    }
    // If already on launchpad, don't notify (user already knows)
  } catch (err) {
    // Don't let notification failure break the translation flow
    console.error("[Telegram] Translation notification failed:", err);
  }
}
