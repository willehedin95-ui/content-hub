/**
 * Autopilot translation pipeline — creates translation rows, translates ad copy,
 * and processes image translations via Kie AI. Used by both Hub UI and Telegram
 * approve handlers (no cookie/workspace dependency).
 */

import { createServerSupabase } from "@/lib/supabase-admin";
import { generateImage } from "@/lib/kie";
import { KIE_IMAGE_COST, calcOpenAICost } from "@/lib/pricing";
import { KIE_MODEL, STORAGE_BUCKET, OPENAI_MODEL } from "@/lib/constants";
import { Language, LANGUAGES } from "@/types";
import { getShortLocalizationNote } from "@/lib/localization";
import { deriveCopyGrade, gradeToNumeric } from "@/lib/quality-grades";
import { reviewTranslationQuality, calcHaikuCost } from "@/lib/translation-review";
import OpenAI from "openai";

type DB = ReturnType<typeof createServerSupabase>;

/**
 * Full autopilot translation pipeline. Call after approve.
 * 1. Creates image_translation rows
 * 2. Translates ad copy via OpenAI
 * 3. Processes 4:5 image translations in parallel via Kie AI
 * 4. After 4:5 done, processes 9:16 (outpainting) in parallel
 * 5. Updates job status + sends Telegram notification
 */
export async function triggerAutopilotTranslations(jobId: string): Promise<{
  translationRows: number;
  copyTranslated: boolean;
  imagesProcessed: number;
  imagesFailed: number;
}> {
  const db = createServerSupabase();

  // Fetch job
  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, concept_number, product, target_languages, target_ratios, ad_copy_primary, ad_copy_headline, ad_copy_translations, landing_page_id, launchpad_priority")
    .eq("id", jobId)
    .single();

  if (!job) throw new Error(`Job ${jobId} not found`);

  const targetLangs = (job.target_languages as string[]) ?? ["sv", "da", "no"];
  const targetRatios = (job.target_ratios as string[])?.length ? job.target_ratios as string[] : ["4:5"];

  // Step 1: Create image_translation rows
  const translationRows = await createTranslationRows(db, jobId, targetLangs, targetRatios);
  console.log(`[autopilot-translate] Created ${translationRows} translation rows for job ${jobId}`);

  // Update job status to processing
  await db.from("image_jobs").update({
    status: "processing",
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  // Step 2: Translate ad copy (fast, ~15s total)
  let copyTranslated = false;
  try {
    await translateAdCopy(db, jobId, job, targetLangs as Language[]);
    copyTranslated = true;
    console.log(`[autopilot-translate] Ad copy translated for job ${jobId}`);
  } catch (err) {
    console.error(`[autopilot-translate] Ad copy translation failed:`, err);
  }

  // Step 3: Process 4:5 image translations in parallel
  const primaryRatio = targetRatios[0] ?? "4:5";
  const { processed: primaryProcessed, failed: primaryFailed } = await processImageTranslations(
    db, jobId, primaryRatio
  );
  console.log(`[autopilot-translate] ${primaryRatio} translations: ${primaryProcessed} done, ${primaryFailed} failed`);

  // Step 4: Process 9:16 translations (outpainting from completed 4:5)
  let secondaryProcessed = 0;
  let secondaryFailed = 0;
  if (targetRatios.includes("9:16")) {
    const result = await processImageTranslations(db, jobId, "9:16");
    secondaryProcessed = result.processed;
    secondaryFailed = result.failed;
    console.log(`[autopilot-translate] 9:16 translations: ${secondaryProcessed} done, ${secondaryFailed} failed`);
  }

  // Step 5: Update job status
  await updateJobStatusFinal(db, jobId);

  return {
    translationRows,
    copyTranslated,
    imagesProcessed: primaryProcessed + secondaryProcessed,
    imagesFailed: primaryFailed + secondaryFailed,
  };
}

// --- Step 1: Create translation rows ---

async function createTranslationRows(
  db: DB,
  jobId: string,
  targetLangs: string[],
  targetRatios: string[]
): Promise<number> {
  const { data: sourceImages } = await db
    .from("source_images")
    .select("id, skip_translation, original_url")
    .eq("job_id", jobId);

  if (!sourceImages?.length) return 0;

  // Check which translation rows already exist (e.g. images already translated via client)
  const sourceImageIds = sourceImages.map((si) => si.id);
  const { data: existingTranslations } = await db
    .from("image_translations")
    .select("source_image_id, language, aspect_ratio")
    .in("source_image_id", sourceImageIds);

  const existingKeys = new Set(
    (existingTranslations ?? []).map((t) => `${t.source_image_id}:${t.language}:${t.aspect_ratio}`)
  );

  const translatableImages = sourceImages.filter((si) => !si.skip_translation);
  const skippedImages = sourceImages.filter((si) => si.skip_translation);
  const primaryRatio = targetRatios[0] ?? "4:5";
  const rows: { source_image_id: string; language: string; aspect_ratio: string; status: string; translated_url?: string }[] = [];

  // Normal images: all ratios as "pending"
  for (const si of translatableImages) {
    for (const lang of targetLangs) {
      for (const ratio of targetRatios) {
        const key = `${si.id}:${lang}:${ratio}`;
        if (existingKeys.has(key)) continue; // Already exists
        rows.push({
          source_image_id: si.id,
          language: lang,
          aspect_ratio: ratio,
          status: "pending",
        });
      }
    }
  }

  // Skipped images (no text): primary ratio as pre-completed (original URL),
  // secondary ratios (9:16) as pending so outpainting still runs
  for (const si of skippedImages) {
    for (const lang of targetLangs) {
      const primaryKey = `${si.id}:${lang}:${primaryRatio}`;
      if (!existingKeys.has(primaryKey)) {
        rows.push({
          source_image_id: si.id,
          language: lang,
          aspect_ratio: primaryRatio,
          status: "completed",
          translated_url: si.original_url,
        });
      }
      for (const ratio of targetRatios) {
        if (ratio !== primaryRatio) {
          const key = `${si.id}:${lang}:${ratio}`;
          if (existingKeys.has(key)) continue;
          rows.push({
            source_image_id: si.id,
            language: lang,
            aspect_ratio: ratio,
            status: "pending",
          });
        }
      }
    }
  }

  if (rows.length === 0) return 0;

  const { error } = await db.from("image_translations").insert(rows);
  if (error) {
    console.error("[autopilot-translate] Failed to create translation rows:", error);
    throw error;
  }

  return rows.length;
}

// --- Step 2: Translate ad copy ---

async function translateAdCopy(
  db: DB,
  jobId: string,
  job: { ad_copy_primary: string[] | null; ad_copy_headline: string[] | null; ad_copy_translations: Record<string, unknown> | null },
  languages: Language[]
): Promise<void> {
  const allPrimaryTexts = (job.ad_copy_primary ?? []).filter((t: string) => t.trim());
  const allHeadlineTexts = (job.ad_copy_headline ?? []).filter((t: string) => t.trim());

  if (allPrimaryTexts.length === 0) return;

  // Limit to 1 primary text + 2 headlines for focused, higher-quality translations
  const primaryTexts = allPrimaryTexts.slice(0, 1);
  const headlineTexts = allHeadlineTexts.slice(0, 2);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const openai = new OpenAI({ apiKey });
  const results: Record<string, unknown> = { ...(job.ad_copy_translations ?? {}) };

  for (const lang of languages) {
    // Skip languages already translated
    const existing = results[lang] as { status?: string } | undefined;
    if (existing?.status === "completed") {
      console.log(`[autopilot-translate] Skipping ad copy for ${lang} — already translated`);
      continue;
    }

    const langLabel = LANGUAGES.find((l) => l.value === lang)?.label ?? lang;

    try {
      const MAX_QUALITY_RETRIES = 3;
      const { data: jobForName } = await db.from("image_jobs").select("name").eq("id", jobId).single();
      const conceptName = jobForName?.name ?? "Unnamed concept";

      let currentPrimary: string[] = [];
      let currentHeadlines: string[] = [];
      let lastReview: Awaited<ReturnType<typeof reviewTranslationQuality>>["result"] | null = null;
      let corrections: string | undefined;

      for (let attempt = 1; attempt <= MAX_QUALITY_RETRIES; attempt++) {
        // Translate (with corrections on retry)
        const translateResponse = await openai.chat.completions.create({
          model: OPENAI_MODEL,
          max_completion_tokens: 4000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are a professional ad copywriter and translator. Translate all ad copy variants from English to ${langLabel}.
Maintain the tone, style, and persuasive power of the original.
Adapt cultural references and idioms naturally.${getShortLocalizationNote(lang)}${corrections ? `\n\nIMPORTANT — The previous translation had quality issues. Fix these problems:\n${corrections}` : ""}
Return a JSON object with exactly two keys:
- "primary_texts": an array of translated primary texts (same order as input)
- "headlines": an array of translated headlines (same order as input)
No other text.`,
            },
            {
              role: "user",
              content: JSON.stringify({ primary_texts: primaryTexts, headlines: headlineTexts }),
            },
          ],
        });

        const content = translateResponse.choices[0]?.message?.content?.trim();
        if (!content) throw new Error("No translation returned");

        const parsed = JSON.parse(content) as { primary_texts: string[]; headlines: string[] };
        currentPrimary = parsed.primary_texts;
        currentHeadlines = parsed.headlines;

        // Log translation usage
        const tInput = translateResponse.usage?.prompt_tokens ?? 0;
        const tOutput = translateResponse.usage?.completion_tokens ?? 0;
        await db.from("usage_logs").insert({
          type: "translation",
          model: OPENAI_MODEL,
          input_tokens: tInput,
          output_tokens: tOutput,
          cost_usd: calcOpenAICost(tInput, tOutput),
          metadata: { purpose: "concept_copy_translation", language: lang, job_id: jobId, attempt },
        });

        // Quality review — Claude Haiku native reader review
        const { result: review, inputTokens: rInput, outputTokens: rOutput } = await reviewTranslationQuality(
          currentPrimary,
          currentHeadlines,
          lang,
          primaryTexts,
          conceptName,
        );
        lastReview = review;

        await db.from("usage_logs").insert({
          type: "translation",
          model: "claude-haiku-4-5-20251001",
          input_tokens: rInput,
          output_tokens: rOutput,
          cost_usd: calcHaikuCost(rInput, rOutput),
          metadata: { purpose: "concept_copy_quality_analysis", language: lang, job_id: jobId, attempt },
        });

        // If passed, break out — no retry needed
        if (review.review_verdict === "pass") {
          console.log(`[autopilot-translate] ${lang} passed quality review on attempt ${attempt}`);
          break;
        }

        // Build corrections for next attempt
        const issues: string[] = [];
        if (review.narrative_issues?.length) issues.push(`Narrative issues: ${review.narrative_issues.join("; ")}`);
        if (review.naturalness_issues?.length) issues.push(`Naturalness issues: ${review.naturalness_issues.join("; ")}`);
        if (review.grammar_issues?.length) issues.push(`Grammar issues: ${review.grammar_issues.join("; ")}`);
        if (review.context_errors?.length) issues.push(`Context errors: ${review.context_errors.join("; ")}`);
        corrections = issues.join("\n");

        if (attempt < MAX_QUALITY_RETRIES) {
          console.log(`[autopilot-translate] ${lang} failed quality review (attempt ${attempt}/${MAX_QUALITY_RETRIES}), retrying with corrections`);
        } else {
          console.log(`[autopilot-translate] ${lang} still has issues after ${MAX_QUALITY_RETRIES} attempts — marking for review`);
        }
      }

      const grade = deriveCopyGrade(lastReview ?? {});
      const qualityScore = gradeToNumeric(grade);
      const copyStatus = lastReview?.review_verdict === "pass" ? "completed" : "review";

      results[lang] = {
        primary_texts: currentPrimary,
        headlines: currentHeadlines,
        quality_score: qualityScore,
        quality_analysis: { ...(lastReview ?? {}), quality_score: qualityScore },
        status: copyStatus,
        ...(copyStatus === "review" ? { reviewed_at: new Date().toISOString() } : {}),
      };
    } catch (err) {
      results[lang] = {
        primary_texts: [],
        headlines: [],
        quality_score: null,
        quality_analysis: null,
        status: "error",
        error: err instanceof Error ? err.message : "Translation failed",
      };
    }

    // Save after each language
    await db.from("image_jobs").update({ ad_copy_translations: results }).eq("id", jobId);
  }
}

// --- Step 3 & 4: Process image translations ---

async function processImageTranslations(
  db: DB,
  jobId: string,
  aspectRatio: string
): Promise<{ processed: number; failed: number }> {
  // Get all pending translations for this ratio
  const { data: translations } = await db
    .from("image_translations")
    .select("id, language, aspect_ratio, source_image_id, source_images!inner(id, original_url, job_id)")
    .eq("source_images.job_id", jobId)
    .eq("aspect_ratio", aspectRatio)
    .eq("status", "pending");

  if (!translations?.length) return { processed: 0, failed: 0 };

  // Normalize source_images from array (Supabase join) to single object
  const normalized = translations.map((t) => ({
    ...t,
    source_images: Array.isArray(t.source_images) ? t.source_images[0] : t.source_images,
  }));

  // Process all translations in parallel
  const results = await Promise.allSettled(
    normalized.map((t) => processOneTranslation(db, jobId, t, aspectRatio))
  );

  const processed = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return { processed, failed };
}

async function processOneTranslation(
  db: DB,
  jobId: string,
  translation: {
    id: string;
    language: string;
    aspect_ratio: string;
    source_image_id: string;
    source_images: { id: string; original_url: string; job_id: string };
  },
  aspectRatio: string
): Promise<void> {
  const translationId = translation.id;
  const startTime = Date.now();

  // Claim the translation
  const { data: claimed } = await db
    .from("image_translations")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", translationId)
    .eq("status", "pending")
    .select("id")
    .single();

  if (!claimed) return; // Already being processed

  // Get next version number
  const { data: existingVersions } = await db
    .from("versions")
    .select("version_number")
    .eq("image_translation_id", translationId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersionNumber = (existingVersions?.[0]?.version_number ?? 0) + 1;

  try {
    // Build prompt
    const langLabel = LANGUAGES.find((l) => l.value === translation.language)?.label ?? translation.language;
    let imageInputUrl = translation.source_images.original_url;
    let prompt = `Recreate this exact image but translate all visible text to ${langLabel}. Keep the same visual style, layout, colors, and design. Only change the text language — do not add any new text, logos, badges, or visual elements that are not already in the image.`;

    // For 9:16: outpaint from completed 4:5 sibling
    if (aspectRatio === "9:16") {
      const { data: jobData } = await db
        .from("image_jobs")
        .select("target_ratios")
        .eq("id", jobId)
        .single();
      const primaryRatio = jobData?.target_ratios?.[0] ?? "4:5";

      const { data: sibling } = await db
        .from("image_translations")
        .select("translated_url")
        .eq("source_image_id", translation.source_image_id)
        .eq("language", translation.language)
        .eq("aspect_ratio", primaryRatio)
        .eq("status", "completed")
        .single();

      if (sibling?.translated_url) {
        imageInputUrl = sibling.translated_url;
        prompt = `Extend this image vertically to fill a 9:16 portrait format. Continue the existing background naturally above and below. Do not add any new text, logos, or visual elements in the extended areas — only extend the background seamlessly.`;
      }
    }

    // Call Kie AI
    const { urls: resultUrls, costTimeMs } = await generateImage(
      prompt,
      [imageInputUrl],
      aspectRatio
    );

    if (!resultUrls?.length) throw new Error("No image generated");

    // Download from Kie CDN
    const resultRes = await fetch(resultUrls[0]);
    if (!resultRes.ok) throw new Error("Failed to fetch generated image from Kie.ai");
    const buffer = Buffer.from(await resultRes.arrayBuffer());

    // Upload to Supabase Storage
    const filePath = `image-jobs/${jobId}/${translationId}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, { contentType: "image/png", upsert: false });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const generationTime = (Date.now() - startTime) / 1000;

    // Deactivate previous versions
    await db.from("versions").update({ is_active: false }).eq("image_translation_id", translationId);

    // Create version row
    const { data: version, error: vError } = await db
      .from("versions")
      .insert({
        image_translation_id: translationId,
        version_number: nextVersionNumber,
        translated_url: urlData.publicUrl,
        generation_time_seconds: generationTime,
        is_active: true,
      })
      .select()
      .single();

    if (vError || !version) throw new Error(`Failed to create version: ${vError?.message}`);

    // Update translation as completed
    await db.from("image_translations").update({
      status: "completed",
      translated_url: urlData.publicUrl,
      active_version_id: version.id,
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq("id", translationId);

    // For skipped (no-text) images: the 9:16 outpaint is identical across languages,
    // so copy the result to all other pending 9:16 siblings to avoid redundant Kie AI calls
    if (aspectRatio === "9:16") {
      const { data: sourceImg } = await db
        .from("source_images")
        .select("skip_translation")
        .eq("id", translation.source_image_id)
        .single();

      if (sourceImg?.skip_translation) {
        const { data: pendingSiblings } = await db
          .from("image_translations")
          .select("id")
          .eq("source_image_id", translation.source_image_id)
          .eq("aspect_ratio", "9:16")
          .eq("status", "pending")
          .neq("id", translationId);

        if (pendingSiblings?.length) {
          await db
            .from("image_translations")
            .update({
              status: "completed",
              translated_url: urlData.publicUrl,
              error_message: null,
              updated_at: new Date().toISOString(),
            })
            .in("id", pendingSiblings.map((s) => s.id));
        }
      }
    }

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
        source: "autopilot",
        generation_time_seconds: generationTime,
        kie_cost_time_ms: costTimeMs,
      },
    });
  } catch (error) {
    const generationTime = (Date.now() - startTime) / 1000;

    // Create failed version
    await db.from("versions").insert({
      image_translation_id: translationId,
      version_number: nextVersionNumber,
      error_message: error instanceof Error ? error.message : "Unknown error",
      generation_time_seconds: generationTime,
      is_active: false,
    });

    // Mark as failed
    await db.from("image_translations").update({
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown error",
      updated_at: new Date().toISOString(),
    }).eq("id", translationId);

    throw error;
  }
}

// --- Step 5: Update final job status + notify ---

async function updateJobStatusFinal(db: DB, jobId: string): Promise<void> {
  const { data: allTranslations } = await db
    .from("image_translations")
    .select("status, source_images!inner(job_id)")
    .eq("source_images.job_id", jobId);

  if (!allTranslations?.length) return;

  const pending = allTranslations.filter((t) => t.status === "pending" || t.status === "processing");
  const failed = allTranslations.filter((t) => t.status === "failed");

  if (pending.length === 0) {
    const newStatus = failed.length > 0 ? "failed" : "completed";
    await db.from("image_jobs").update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    // Send Telegram notification
    await notifyTranslationsDone(db, jobId, newStatus, allTranslations.length, failed.length);
  }
}

async function notifyTranslationsDone(
  db: DB,
  jobId: string,
  status: string,
  totalCount: number,
  failedCount: number
): Promise<void> {
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (!chatId) return;

    const { data: job } = await db
      .from("image_jobs")
      .select("name, concept_number, product, launchpad_priority")
      .eq("id", jobId)
      .single();

    if (!job) return;

    const label = job.concept_number ? `#${job.concept_number} ${job.name}` : job.name;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";
    const { sendMessage } = await import("@/lib/telegram");

    if (status === "failed") {
      await sendMessage(chatId, [
        `⚠️ Autopilot translations finished with errors`,
        `Concept: ${label}`,
        `${totalCount - failedCount}/${totalCount} succeeded, ${failedCount} failed`,
        ``,
        `${baseUrl}/images/${jobId}`,
      ].join("\n"));
    } else {
      // Check if any ad copy translations need review
      const { data: fullJob } = await db
        .from("image_jobs")
        .select("ad_copy_translations")
        .eq("id", jobId)
        .single();

      const copyTranslations = fullJob?.ad_copy_translations as Record<string, { status?: string; quality_analysis?: Record<string, unknown> }> | null;
      const reviewLangs: string[] = [];
      const reviewIssues: string[] = [];

      if (copyTranslations) {
        for (const [lang, t] of Object.entries(copyTranslations)) {
          if (t.status === "review") {
            const ll = LANGUAGES.find((l) => l.value === lang)?.label ?? lang;
            reviewLangs.push(ll);
            const a = t.quality_analysis;
            if (a) {
              const issues = [
                ...((a.narrative_issues as string[]) ?? []),
                ...((a.naturalness_issues as string[]) ?? []),
                ...((a.grammar_issues as string[]) ?? []),
              ].slice(0, 3);
              if (issues.length) reviewIssues.push(`${ll}: ${issues.join("; ")}`);
            }
          }
        }
      }

      if (reviewLangs.length > 0) {
        const { sendMessageWithInlineKeyboard } = await import("@/lib/telegram");
        await sendMessageWithInlineKeyboard(chatId, [
          `⚠️ Translation quality review needed`,
          `Concept: ${label}`,
          `Languages: ${reviewLangs.join(", ")}`,
          `${totalCount} images translated`,
          ``,
          ...reviewIssues.slice(0, 5),
          ``,
          `${baseUrl}/images/${jobId}`,
          `Review: ${baseUrl}/review?highlight=${jobId}`,
        ].join("\n"), [
          [
            { text: "✅ Approve translations", callback_data: `quality_approve:${jobId}` },
            { text: "✏️ Hold for edit", callback_data: `quality_hold:${jobId}` },
          ],
        ]);
      } else {
        await sendMessage(chatId, [
          `✅ Autopilot translations complete — ready for push!`,
          `Concept: ${label}`,
          `${totalCount} images translated`,
          ``,
          `Pipeline will auto-push next cycle.`,
        ].join("\n"));
      }
    }
  } catch (err) {
    console.error("[autopilot-translate] Telegram notification failed:", err);
  }
}

/**
 * Re-roll translation pipeline — creates translation rows for a single
 * re-rolled source image and processes them. Called via after() from the
 * re-roll endpoint. Does NOT re-translate ad copy (already done).
 */
export async function triggerRerollTranslations(
  jobId: string,
  sourceImageId: string
): Promise<{ created: number; processed: number; failed: number }> {
  const db = createServerSupabase();

  // Fetch job config
  const { data: job } = await db
    .from("image_jobs")
    .select("id, target_languages, target_ratios")
    .eq("id", jobId)
    .single();

  if (!job) throw new Error(`Job ${jobId} not found`);

  const targetLangs = (job.target_languages as string[]) ?? ["sv", "da", "no"];
  const targetRatios = (job.target_ratios as string[])?.length ? job.target_ratios as string[] : ["4:5"];

  // Fetch source image
  const { data: sourceImage } = await db
    .from("source_images")
    .select("id, skip_translation, original_url")
    .eq("id", sourceImageId)
    .single();

  if (!sourceImage) throw new Error(`Source image ${sourceImageId} not found`);

  // Create translation rows for this one image
  const primaryRatio = targetRatios[0] ?? "4:5";
  const rows: { source_image_id: string; language: string; aspect_ratio: string; status: string; translated_url?: string }[] = [];

  if (sourceImage.skip_translation) {
    // No-text image: primary ratio pre-completed, secondary pending for outpainting
    for (const lang of targetLangs) {
      rows.push({
        source_image_id: sourceImageId,
        language: lang,
        aspect_ratio: primaryRatio,
        status: "completed",
        translated_url: sourceImage.original_url,
      });
      for (const ratio of targetRatios) {
        if (ratio !== primaryRatio) {
          rows.push({ source_image_id: sourceImageId, language: lang, aspect_ratio: ratio, status: "pending" });
        }
      }
    }
  } else {
    for (const lang of targetLangs) {
      for (const ratio of targetRatios) {
        rows.push({ source_image_id: sourceImageId, language: lang, aspect_ratio: ratio, status: "pending" });
      }
    }
  }

  if (rows.length > 0) {
    await db.from("image_translations").insert(rows);
  }

  console.log(`[reroll-translate] Created ${rows.length} translation rows for source image ${sourceImageId}`);

  // Set job to processing
  await db.from("image_jobs").update({
    status: "processing",
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  // Process 4:5 first
  const primary = await processImageTranslations(db, jobId, primaryRatio);
  console.log(`[reroll-translate] ${primaryRatio}: ${primary.processed} done, ${primary.failed} failed`);

  // Then 9:16
  let secondary = { processed: 0, failed: 0 };
  if (targetRatios.includes("9:16")) {
    secondary = await processImageTranslations(db, jobId, "9:16");
    console.log(`[reroll-translate] 9:16: ${secondary.processed} done, ${secondary.failed} failed`);
  }

  // Update final job status
  await updateJobStatusFinal(db, jobId);

  return {
    created: rows.length,
    processed: primary.processed + secondary.processed,
    failed: primary.failed + secondary.failed,
  };
}
