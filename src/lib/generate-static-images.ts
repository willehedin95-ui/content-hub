/**
 * Shared static ad image generation logic.
 *
 * Extracted from generate-static/route.ts so both the API endpoint and
 * brainstorm/approve can call the same pipeline.
 */

import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { generateImage } from "@/lib/kie";
import { generateImageBriefs, resolveReferenceImages, STATIC_STYLES } from "@/lib/static-ad-prompt";
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

  // Step 1: Claude generates distinct image briefs
  const briefs = await generateImageBriefs({
    job,
    product: product as ProductFull,
    productImages: allProductImages,
    segment,
    iterationContext,
    count,
    styles: requestedStyles,
    previousPrompts,
  });

  if (briefs.briefs.length === 0) {
    throw new Error("Claude returned no valid briefs");
  }

  // Log Claude usage
  const claudeCost = calcClaudeCost(briefs.usage.input_tokens, briefs.usage.output_tokens);
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

      const { urls: resultUrls, costTimeMs } = await generateImage(
        brief.prompt,
        referenceUrls,
        "4:5"
      );

      if (!resultUrls?.length) {
        throw new Error(`${label}: No image generated`);
      }

      const resultRes = await fetch(resultUrls[0]);
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
          generation_prompt: brief.prompt,
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
        prompt: brief.prompt,
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
