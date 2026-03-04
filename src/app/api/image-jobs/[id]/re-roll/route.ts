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

export const maxDuration = 180;

// POST /api/image-jobs/[id]/re-roll — Replace a single source image with a new generation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { source_image_id } = body;

  if (!source_image_id || !isValidUUID(source_image_id)) {
    return NextResponse.json({ error: "source_image_id is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Fetch the source image to re-roll
  const { data: sourceImage, error: siErr } = await db
    .from("source_images")
    .select("*")
    .eq("id", source_image_id)
    .eq("job_id", id)
    .single();

  if (siErr || !sourceImage) {
    return safeError(siErr ?? new Error("Not found"), "Source image not found", 404);
  }

  if (!sourceImage.generation_style) {
    return NextResponse.json(
      { error: "Cannot re-roll: image was not AI-generated (no generation_style)" },
      { status: 400 }
    );
  }

  // Fetch the job
  const { data: job, error: jobErr } = await db
    .from("image_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobErr || !job) {
    return safeError(jobErr ?? new Error("Not found"), "Job not found", 404);
  }

  // Fetch product
  const { data: product, error: productErr } = await db
    .from("products")
    .select("*")
    .eq("slug", job.product)
    .single();

  if (productErr || !product) {
    return NextResponse.json({ error: `Product "${job.product}" not found` }, { status: 404 });
  }

  // Fetch product images
  const { data: productImages } = await db
    .from("product_images")
    .select("url, category")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  const allProductImages = (productImages ?? []) as Array<{ url: string; category: string }>;

  // Fetch ALL existing prompts from this job's source images (for diversity)
  const { data: existingImages } = await db
    .from("source_images")
    .select("generation_prompt")
    .eq("job_id", id)
    .not("generation_prompt", "is", null);

  const previousPrompts = (existingImages ?? [])
    .map((i) => i.generation_prompt as string)
    .filter(Boolean);

  // Generate ONE new brief for the same style
  const style = sourceImage.generation_style as StaticStyleId;
  let briefs;
  try {
    briefs = await generateImageBriefs({
      job,
      product: product as ProductFull,
      productImages: allProductImages,
      iterationContext: job.iteration_context ?? null,
      count: 1,
      styles: [style],
      previousPrompts,
    });
  } catch (err) {
    return safeError(err, "Failed to generate replacement brief");
  }

  if (briefs.briefs.length === 0) {
    return NextResponse.json({ error: "No brief generated" }, { status: 500 });
  }

  const brief = briefs.briefs[0];

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
      purpose: "static_ad_reroll",
      image_job_id: id,
      source_image_id,
      style: brief.style,
    },
  });

  // Generate image via Kie AI
  const referenceUrls = resolveReferenceImages(brief, allProductImages);

  let resultUrls: string[] | undefined;
  let costTimeMs: number | undefined;
  try {
    const result = await generateImage(brief.prompt, referenceUrls, "4:5");
    resultUrls = result.urls;
    costTimeMs = result.costTimeMs ?? undefined;
  } catch (err) {
    return safeError(err, "Image generation failed");
  }

  if (!resultUrls?.length) {
    return NextResponse.json({ error: "No image generated" }, { status: 500 });
  }

  // Download from Kie CDN
  const resultRes = await fetch(resultUrls[0]);
  if (!resultRes.ok) {
    return NextResponse.json({ error: "Failed to download generated image" }, { status: 500 });
  }
  const buffer = Buffer.from(await resultRes.arrayBuffer());

  // Upload to Supabase Storage
  const fileId = crypto.randomUUID();
  const filePath = `image-jobs/${id}/${fileId}.png`;
  const { error: uploadError } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, { contentType: "image/png", upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

  // Delete old source image's storage file
  const oldUrl = sourceImage.original_url as string;
  const oldPathMatch = oldUrl.match(/translated-images\/(.+)$/);
  if (oldPathMatch) {
    await db.storage.from(STORAGE_BUCKET).remove([oldPathMatch[1]]);
  }

  // Delete old source image row (CASCADE removes translations)
  await db.from("source_images").delete().eq("id", source_image_id);

  // Insert new source image
  const styleLabel = STATIC_STYLES.find((s) => s.id === brief.style)?.label ?? brief.style;
  const label = `${styleLabel}: ${brief.hookText.length > 35 ? brief.hookText.slice(0, 35) + "..." : brief.hookText}`;

  const { data: newSourceImage, error: insertErr } = await db
    .from("source_images")
    .insert({
      job_id: id,
      original_url: urlData.publicUrl,
      filename: `${brief.style}-${fileId.slice(0, 8)}.png`,
      processing_order: sourceImage.processing_order,
      skip_translation: false,
      generation_prompt: brief.prompt,
      generation_style: brief.style,
    })
    .select()
    .single();

  if (insertErr || !newSourceImage) {
    return safeError(insertErr ?? new Error("Insert failed"), "Failed to save new image");
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
      purpose: "static_ad_reroll",
      image_job_id: id,
      source_image_id: newSourceImage.id,
      old_source_image_id: source_image_id,
      style: brief.style,
      kie_cost_time_ms: costTimeMs,
    },
  });

  return NextResponse.json({
    source_image: {
      id: newSourceImage.id,
      original_url: urlData.publicUrl,
      filename: newSourceImage.filename,
      label,
      style: brief.style,
      prompt: brief.prompt,
      reptileTriggers: brief.reptileTriggers,
    },
    cost_usd: claudeCost + KIE_IMAGE_COST,
  });
}
