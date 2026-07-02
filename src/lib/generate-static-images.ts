/**
 * Shared static ad image generation logic.
 *
 * Extracted from generate-static/route.ts so both the API endpoint and
 * brainstorm/approve can call the same pipeline.
 */

import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { generateImage } from "@/lib/kie";
import { generateImageBriefs, resolveReferenceImages, STATIC_STYLES, type ImageBrief } from "@/lib/static-ad-prompt";
import { getProductAppearance } from "@/lib/product-appearance";
import { lintImagePrompt, autoFixPrompt, summarizeLint } from "@/lib/prompt-lint";
import { correctImageText, qaImage } from "@/lib/image-quality";

const LANG_NAMES: Record<string, string> = { sv: "Swedish", da: "Danish", no: "Norwegian", de: "German", en: "English" };
import type { StaticStyleId } from "@/lib/constants";
import { STORAGE_BUCKET, KIE_MODEL, CLAUDE_MODEL } from "@/lib/constants";
import { KIE_IMAGE_COST, calcClaudeCost } from "@/lib/pricing";
import { isValidUUID } from "@/lib/validation";
import type { ProductFull, ProductSegment } from "@/types";

export interface GenerateStaticOptions {
  jobId: string;
  workspaceId: string;
  count?: number;
  styles?: StaticStyleId[];
  batch?: number;
  batchLabel?: string;
  iterationContext?: Record<string, unknown>;
  targetMarket?: string;
  segmentId?: string;
  /** When provided, use these briefs directly and skip the Claude brief generation (e.g. Genesis image bots). */
  injectedBriefs?: ImageBrief[];
  /** Run a Nano-Banana text-correction pass on each rendered image (fixes garbled diacritics). */
  textCorrection?: boolean;
  /** Vision-QA each image and reroll bad ones (wrong product / garbled text / defects). */
  imageQa?: boolean;
}

export interface GenerateStaticResult {
  generated: number;
  failed: number;
  batch: number;
  batchLabel: string | null;
  sourceImages: Array<{
    source_image_id: string;
    original_url: string;
    filename: string;
    label: string;
    style: string;
    reptileTriggers?: string[];
    prompt: string;
  }>;
  errors: string[];
  costUsd: number;
}

export async function generateStaticImages(
  opts: GenerateStaticOptions
): Promise<GenerateStaticResult> {
  const {
    jobId,
    workspaceId,
    count: rawCount,
    styles: requestedStyles,
    batch: requestedBatch,
    batchLabel,
    iterationContext: overrideIterationContext,
    targetMarket,
    segmentId,
    injectedBriefs,
    textCorrection,
    imageQa,
  } = opts;

  const MAX_IMAGES_PER_CONCEPT = 5;
  const count = requestedStyles?.length
    ? Math.min(requestedStyles.length, MAX_IMAGES_PER_CONCEPT)
    : Math.min(Math.max(rawCount ?? 3, 1), MAX_IMAGES_PER_CONCEPT);

  const db = createServerSupabase();

  // Fetch the image job
  const { data: job, error: jobErr } = await db
    .from("image_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .single();

  if (jobErr || !job) {
    throw new Error("Job not found");
  }

  if (!job.visual_direction) {
    throw new Error("Job has no visual direction. Generate concepts first.");
  }

  if (!job.product) {
    throw new Error("Job has no product assigned");
  }

  // Fetch product with full details
  const { data: product, error: productErr } = await db
    .from("products")
    .select("*")
    .eq("slug", job.product)
    .single();

  if (productErr || !product) {
    throw new Error(`Product "${job.product}" not found`);
  }

  // Fetch ALL product images
  const { data: productImages } = await db
    .from("product_images")
    .select("url, category")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  const allProductImages = (productImages ?? []) as Array<{ url: string; category: string }>;

  // Fetch target segment if specified
  let segment: ProductSegment | null = null;
  if (segmentId && isValidUUID(segmentId)) {
    const { data: seg } = await db
      .from("product_segments")
      .select("*")
      .eq("id", segmentId)
      .single();
    if (seg) segment = seg as ProductSegment;
  }

  // Fetch existing prompts for diversity
  const { data: existingImages } = await db
    .from("source_images")
    .select("generation_prompt, batch")
    .eq("job_id", jobId)
    .not("generation_prompt", "is", null);

  const previousPrompts = (existingImages ?? [])
    .map((i) => i.generation_prompt as string)
    .filter(Boolean);

  // Compute batch number
  const maxExistingBatch = Math.max(1, ...(existingImages ?? []).map((i) => (i.batch as number) ?? 1));
  const batch = requestedBatch ?? (existingImages && existingImages.length > 0 ? maxExistingBatch + 1 : 1);

  const iterationContext = overrideIterationContext ?? job.iteration_context ?? null;

  // Step 1: image briefs - either injected (e.g. Genesis image bots) or Claude-generated.
  const productAppearance = getProductAppearance(product);
  const langName = LANG_NAMES[(job.target_languages?.[0] as string) || "sv"] || "Swedish";

  const briefs = injectedBriefs
    ? { briefs: injectedBriefs, usage: { input_tokens: 0, output_tokens: 0 } }
    : await generateImageBriefs({
        job,
        product: product as ProductFull,
        productImages: allProductImages,
        segment,
        iterationContext,
        count,
        styles: requestedStyles,
        previousPrompts,
        productAppearance,
      });

  if (briefs.briefs.length === 0) {
    throw new Error(injectedBriefs ? "No briefs provided" : "Claude returned no valid briefs");
  }

  // Log Claude usage (only for Claude-generated briefs).
  let claudeCost = 0;
  if (!injectedBriefs) {
  claudeCost = calcClaudeCost(briefs.usage.input_tokens, briefs.usage.output_tokens);
  await db.from("usage_logs").insert({
    type: "claude_rewrite",
    page_id: null,
    translation_id: null,
    model: CLAUDE_MODEL,
    input_tokens: briefs.usage.input_tokens,
    output_tokens: briefs.usage.output_tokens,
    cost_usd: claudeCost,
    metadata: {
      purpose: "static_ad_briefs",
      image_job_id: jobId,
      briefs_count: briefs.briefs.length,
      styles: briefs.briefs.map((b) => b.style),
      reptile_triggers: briefs.briefs.map((b) => b.reptileTriggers ?? []),
      segment_id: segment?.id ?? null,
      segment_name: segment?.name ?? null,
    },
  });
  }

  // Mark job as ready immediately so the client sees progress via polling
  await db
    .from("image_jobs")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  // Step 2: Generate images from briefs (in parallel)
  type ImageResult = {
    source_image_id: string;
    original_url: string;
    filename: string;
    label: string;
    style: string;
    reptileTriggers?: string[];
    prompt: string;
  };

  const settled = await Promise.allSettled(
    briefs.briefs.map(async (brief, index): Promise<ImageResult> => {
      const styleLabel = STATIC_STYLES.find((s) => s.id === brief.style)?.label ?? brief.style;
      const label = `${styleLabel}: ${brief.hookText.length > 35 ? brief.hookText.slice(0, 35) + "..." : brief.hookText}`;

      const referenceUrls = resolveReferenceImages(brief, allProductImages);

      // Pre-render lint (Phase 2): auto-fix known visual violations (amber/shot-glass/dashes),
      // log anything the lint flags so we get telemetry on how often briefs violate.
      let renderPrompt = brief.prompt;
      const lintCtx = { productSlug: product.slug, language: job.target_languages?.[0] as string | undefined };
      const lint = lintImagePrompt(renderPrompt, lintCtx);
      if (!lint.pass) {
        const fixed = autoFixPrompt(renderPrompt, lintCtx);
        if (fixed.changed) renderPrompt = fixed.prompt;
        console.warn(`[static-images] ${label}: ${summarizeLint(lint)}${fixed.changed ? " (auto-fixed)" : ""}`);
      }

      // Render + quality gate (opt-in): reroll on failed vision-QA, then text-correction pass.
      let finalUrl = "";
      let costTimeMs: number | null = null;
      const maxAttempts = imageQa ? 3 : 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const r = await generateImage(renderPrompt, referenceUrls, "4:5");
        if (!r.urls?.length) throw new Error(`${label}: No image generated`);
        costTimeMs = r.costTimeMs;
        let url = r.urls[0];
        if (imageQa && attempt < maxAttempts) {
          const qa = await qaImage(url, { language: langName, productAppearance });
          if (!qa.ok) {
            console.warn(`[static-images] ${label}: QA fail (${qa.issues.join("; ")}) - reroll ${attempt}/${maxAttempts - 1}`);
            continue;
          }
        }
        if (textCorrection) url = await correctImageText(url, langName, "4:5");
        finalUrl = url;
        break;
      }

      const resultRes = await fetch(finalUrl);
      if (!resultRes.ok) {
        throw new Error(`${label}: Failed to download generated image`);
      }
      const buffer = Buffer.from(await resultRes.arrayBuffer());

      const fileId = crypto.randomUUID();
      const filePath = `image-jobs/${jobId}/${fileId}.png`;
      const { error: uploadError } = await db.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, buffer, { contentType: "image/png", upsert: false });

      if (uploadError) {
        throw new Error(`${label}: Upload failed — ${uploadError.message}`);
      }

      const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

      const { data: sourceImage, error: siErr } = await db
        .from("source_images")
        .insert({
          job_id: jobId,
          original_url: urlData.publicUrl,
          filename: `${brief.style}-${fileId.slice(0, 8)}.png`,
          processing_order: index,
          skip_translation: false,
          generation_prompt: renderPrompt,
          generation_style: brief.style,
          batch,
          ...(batchLabel ? { batch_label: batchLabel } : {}),
          ...(targetMarket ? { target_market: targetMarket } : {}),
        })
        .select()
        .single();

      if (siErr || !sourceImage) {
        throw new Error(`${label}: DB insert failed`);
      }

      // Same-language auto-passthrough: when the copy is generated natively in a target language
      // (e.g. Genesis sv concepts), create the completed "translation" row immediately so
      // Preview & Push works with zero clicks - no sv->sv Translate step needed.
      const srcLang = job.source_language as string | null;
      if (srcLang && (job.target_languages as string[] | null)?.includes(srcLang)) {
        await db.from("image_translations").insert({
          source_image_id: sourceImage.id,
          language: srcLang,
          aspect_ratio: "4:5",
          status: "completed",
          translated_url: urlData.publicUrl,
        });
      }

      await db.from("usage_logs").insert({
        type: "image_generation",
        page_id: null,
        translation_id: null,
        model: KIE_MODEL,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: KIE_IMAGE_COST,
        metadata: {
          purpose: "static_ad_generation",
          image_job_id: jobId,
          source_image_id: sourceImage.id,
          style: brief.style,
          label,
          kie_cost_time_ms: costTimeMs,
          reference_image_count: referenceUrls.length,
          reference_strategy: brief.referenceStrategy,
          reptile_triggers: brief.reptileTriggers ?? [],
        },
      });

      return {
        source_image_id: sourceImage.id,
        original_url: urlData.publicUrl,
        filename: sourceImage.filename,
        label,
        style: brief.style,
        reptileTriggers: brief.reptileTriggers,
        prompt: renderPrompt,
      };
    })
  );

  const results: ImageResult[] = [];
  const errors: string[] = [];
  let totalCost = claudeCost;

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
      totalCost += KIE_IMAGE_COST;
    } else {
      errors.push(outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason));
    }
  }

  // Update job timestamp
  await db
    .from("image_jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId);

  // Alert on any image generation failure
  if (errors.length > 0) {
    try {
      const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
      if (chatId) {
        const { sendMessage } = await import("@/lib/telegram");
        const { data: jobInfo } = await db.from("image_jobs").select("name, concept_number").eq("id", jobId).single();
        const label = jobInfo?.concept_number ? `#${jobInfo.concept_number} ${jobInfo.name}` : jobId.slice(0, 8);
        await sendMessage(chatId, [
          `⚠️ Image generation partial failure`,
          `Concept: ${label}`,
          `${results.length}/${results.length + errors.length} images succeeded`,
          `Errors: ${errors.slice(0, 3).join("; ")}`,
        ].join("\n"));
      }
    } catch { /* don't let notification failure break the flow */ }
  }

  return {
    generated: results.length,
    failed: errors.length,
    batch,
    batchLabel: batchLabel ?? null,
    sourceImages: results,
    errors,
    costUsd: totalCost,
  };
}
