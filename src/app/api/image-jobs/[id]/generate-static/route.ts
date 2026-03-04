import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase";
import { generateImage } from "@/lib/kie";
import { generateImageBriefs, resolveReferenceImages, STATIC_STYLES } from "@/lib/static-ad-prompt";
import type { StaticStyleId } from "@/lib/constants";
import { STORAGE_BUCKET, KIE_MODEL, CLAUDE_MODEL } from "@/lib/constants";
import { KIE_IMAGE_COST, calcClaudeCost } from "@/lib/pricing";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import type { ProductFull, ProductSegment } from "@/types";

export const maxDuration = 300;

// POST /api/image-jobs/[id]/generate-static — Generate diverse static ad images
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const validStyleIds = new Set<string>(STATIC_STYLES.map((s) => s.id));
  const requestedStyles: StaticStyleId[] | undefined = Array.isArray(body.styles)
    ? body.styles.filter((s: string) => validStyleIds.has(s)) as StaticStyleId[]
    : undefined;
  const MAX_IMAGES_PER_CONCEPT = 5;
  const count = requestedStyles?.length
    ? Math.min(requestedStyles.length, MAX_IMAGES_PER_CONCEPT)
    : Math.min(Math.max(body.count ?? 3, 1), MAX_IMAGES_PER_CONCEPT);

  const db = createServerSupabase();

  // Fetch the image job
  const { data: job, error: jobErr } = await db
    .from("image_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobErr || !job) {
    return safeError(jobErr ?? new Error("Not found"), "Job not found", 404);
  }

  if (!job.visual_direction) {
    return NextResponse.json(
      { error: "Job has no visual direction. Generate concepts first." },
      { status: 400 }
    );
  }

  if (!job.product) {
    return NextResponse.json(
      { error: "Job has no product assigned" },
      { status: 400 }
    );
  }

  // Fetch product with full details
  const { data: product, error: productErr } = await db
    .from("products")
    .select("*")
    .eq("slug", job.product)
    .single();

  if (productErr || !product) {
    return NextResponse.json(
      { error: `Product "${job.product}" not found` },
      { status: 404 }
    );
  }

  // Fetch ALL product images (not just hero — different styles need different categories)
  const { data: productImages } = await db
    .from("product_images")
    .select("url, category")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  const allProductImages = (productImages ?? []) as Array<{ url: string; category: string }>;

  // V3.3: Fetch target segment (if specified)
  let segment: ProductSegment | null = null;
  if (body.segment_id && isValidUUID(body.segment_id)) {
    const { data: seg } = await db
      .from("product_segments")
      .select("*")
      .eq("id", body.segment_id)
      .single();
    if (seg) segment = seg as ProductSegment;
  }

  // Fetch existing prompts for diversity (avoid repeating similar approaches on re-generate)
  const { data: existingImages } = await db
    .from("source_images")
    .select("generation_prompt")
    .eq("job_id", id)
    .not("generation_prompt", "is", null);

  const previousPrompts = (existingImages ?? [])
    .map((i) => i.generation_prompt as string)
    .filter(Boolean);

  // Step 1: Claude generates distinct image briefs
  let briefs;
  try {
    briefs = await generateImageBriefs({
      job,
      product: product as ProductFull,
      productImages: allProductImages,
      segment,
      iterationContext: job.iteration_context ?? null,
      count,
      styles: requestedStyles,
      previousPrompts,
    });
  } catch (err) {
    return safeError(err, "Failed to generate image briefs");
  }

  if (briefs.briefs.length === 0) {
    return NextResponse.json(
      { error: "Claude returned no valid briefs" },
      { status: 500 }
    );
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
      image_job_id: id,
      briefs_count: briefs.briefs.length,
      styles: briefs.briefs.map((b) => b.style),
      reptile_triggers: briefs.briefs.map((b) => b.reptileTriggers ?? []),
      segment_id: segment?.id ?? null,
      segment_name: segment?.name ?? null,
    },
  });

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

  // Mark job as ready immediately so the client sees progress via polling
  await db
    .from("image_jobs")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", id);

  const settled = await Promise.allSettled(
    briefs.briefs.map(async (brief, index): Promise<ImageResult> => {
      const styleLabel = STATIC_STYLES.find((s) => s.id === brief.style)?.label ?? brief.style;
      const label = `${styleLabel}: ${brief.hookText.length > 35 ? brief.hookText.slice(0, 35) + "..." : brief.hookText}`;

      // Resolve reference images based on brief's strategy
      const referenceUrls = resolveReferenceImages(
        brief,
        allProductImages,
      );

      // Generate via Kie AI (1:1 for Meta)
      const { urls: resultUrls, costTimeMs } = await generateImage(
        brief.prompt,
        referenceUrls,
        "1:1"
      );

      if (!resultUrls?.length) {
        throw new Error(`${label}: No image generated`);
      }

      // Download from Kie CDN
      const resultRes = await fetch(resultUrls[0]);
      if (!resultRes.ok) {
        throw new Error(`${label}: Failed to download generated image`);
      }
      const buffer = Buffer.from(await resultRes.arrayBuffer());

      // Upload to Supabase Storage
      const fileId = crypto.randomUUID();
      const filePath = `image-jobs/${id}/${fileId}.png`;
      const { error: uploadError } = await db.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, buffer, { contentType: "image/png", upsert: false });

      if (uploadError) {
        throw new Error(`${label}: Upload failed — ${uploadError.message}`);
      }

      const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

      // Insert source_images row
      const { data: sourceImage, error: siErr } = await db
        .from("source_images")
        .insert({
          job_id: id,
          original_url: urlData.publicUrl,
          filename: `${brief.style}-${fileId.slice(0, 8)}.png`,
          processing_order: index,
          skip_translation: false,
          generation_prompt: brief.prompt,
          generation_style: brief.style,
        })
        .select()
        .single();

      if (siErr || !sourceImage) {
        throw new Error(`${label}: DB insert failed`);
      }

      // Log Kie usage
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
          image_job_id: id,
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
    .eq("id", id);

  return NextResponse.json({
    generated: results.length,
    failed: errors.length,
    source_images: results,
    errors: errors.length > 0 ? errors : undefined,
    cost_usd: totalCost,
  });
}
