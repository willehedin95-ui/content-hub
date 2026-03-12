import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { generateImage } from "@/lib/kie";
import { STORAGE_BUCKET, KIE_MODEL } from "@/lib/constants";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export const maxDuration = 300;

// POST /api/image-jobs/[id]/generate-competitor
// Generates competitor-swipe images from pending_competitor_gen data.
// Called automatically by the detail page when it detects a draft job with pending data.
// Images are inserted into source_images one-by-one so the polling UI can show them progressively.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Fetch the job
  const { data: job, error: jobErr } = await db
    .from("image_jobs")
    .select("id, status, pending_competitor_gen")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (jobErr || !job) {
    return safeError(jobErr ?? new Error("Not found"), "Job not found", 404);
  }

  if (!job.pending_competitor_gen) {
    return NextResponse.json(
      { error: "No pending competitor generation data" },
      { status: 400 }
    );
  }

  const pendingGen = job.pending_competitor_gen as {
    image_prompts: Array<{ source_index?: number; prompt: string; hook_text: string; headline_text: string }>;
    competitor_image_urls?: string[];
    competitor_image_url?: string; // legacy single-URL support
    product_hero_urls: string[];
  };

  const image_prompts = pendingGen.image_prompts;
  const competitorImageUrls = pendingGen.competitor_image_urls
    ?? (pendingGen.competitor_image_url ? [pendingGen.competitor_image_url] : []);
  const product_hero_urls = pendingGen.product_hero_urls;

  // Clear pending data immediately so a retry won't double-generate
  await db
    .from("image_jobs")
    .update({ pending_competitor_gen: null })
    .eq("id", id);

  const jobId = job.id;

  let generated = 0;
  let failed = 0;
  const errors: string[] = [];

  // Generate images sequentially so they appear one-by-one during polling
  for (let index = 0; index < image_prompts.length; index++) {
    const imgPrompt = image_prompts[index];
    try {
      // Use source_index to pick the correct competitor image as reference
      const sourceIdx = imgPrompt.source_index ?? 0;
      const competitorRef = competitorImageUrls[sourceIdx] ?? competitorImageUrls[0];
      const referenceUrls = [competitorRef, ...product_hero_urls];

      const { urls: resultUrls, costTimeMs } = await generateImage(
        imgPrompt.prompt,
        referenceUrls,
        "4:5"
      );

      if (!resultUrls?.length) {
        throw new Error(`Image ${index + 1}: No image generated`);
      }

      // Download from Kie CDN
      const resultRes = await fetch(resultUrls[0]);
      if (!resultRes.ok) {
        throw new Error(`Image ${index + 1}: Failed to download generated image`);
      }
      const buffer = Buffer.from(await resultRes.arrayBuffer());

      // Upload to Supabase Storage
      const fileId = crypto.randomUUID();
      const filePath = `image-jobs/${jobId}/${fileId}.png`;
      const { error: uploadError } = await db.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, buffer, { contentType: "image/png", upsert: false });

      if (uploadError) {
        throw new Error(`Image ${index + 1}: Upload failed — ${uploadError.message}`);
      }

      const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

      // Insert source_images row (immediately visible to polling clients)
      const { data: sourceImage, error: siErr } = await db
        .from("source_images")
        .insert({
          job_id: jobId,
          original_url: urlData.publicUrl,
          filename: `competitor-swipe-${fileId.slice(0, 8)}.png`,
          processing_order: index,
          skip_translation: false,
          generation_prompt: imgPrompt.prompt,
          generation_style: "competitor-swipe",
          batch: 1,
        })
        .select()
        .single();

      if (siErr || !sourceImage) {
        throw new Error(`Image ${index + 1}: DB insert failed`);
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
          purpose: "competitor_swipe_generation",
          image_job_id: jobId,
          source_image_id: sourceImage.id,
          kie_cost_time_ms: costTimeMs,
          reference_image_count: referenceUrls.length,
        },
      });

      generated++;
    } catch (err) {
      failed++;
      errors.push(err instanceof Error ? err.message : String(err));
      console.error(`[generate-competitor] Image ${index + 1} failed:`, err);
    }
  }

  // Mark job as ready now that all images are generated
  await db
    .from("image_jobs")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  return NextResponse.json({
    generated,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
