import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { generateImage } from "@/lib/kie";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { KIE_MODEL, STORAGE_BUCKET, EXPANSION_PROMPT } from "@/lib/constants";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const { sourceImageId } = (await req.json()) as { sourceImageId: string };

  if (!sourceImageId) {
    return NextResponse.json({ error: "sourceImageId is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Verify source image belongs to this job
  const { data: sourceImage, error: siError } = await db
    .from("source_images")
    .select("id, original_url, job_id, expansion_status")
    .eq("id", sourceImageId)
    .eq("job_id", jobId)
    .single();

  if (siError || !sourceImage) {
    return NextResponse.json({ error: "Source image not found" }, { status: 404 });
  }

  // Atomically claim: only expand if pending or failed (retry)
  const { data: claimed } = await db
    .from("source_images")
    .update({ expansion_status: "processing", expansion_error: null })
    .eq("id", sourceImageId)
    .in("expansion_status", ["pending", "failed", "processing"])
    .select("id")
    .single();

  if (!claimed) {
    return NextResponse.json(
      { error: "Expansion is already being processed" },
      { status: 409 }
    );
  }

  try {
    // Call Kie AI to expand to 9:16
    const resultUrls = await generateImage(
      EXPANSION_PROMPT,
      [sourceImage.original_url],
      "9:16"
    );

    if (!resultUrls?.length) {
      throw new Error("No result from Kie.ai");
    }

    // Download expanded image from Kie CDN
    const resultRes = await fetch(resultUrls[0]);
    if (!resultRes.ok) {
      throw new Error("Failed to download expanded image from CDN");
    }
    const buffer = Buffer.from(await resultRes.arrayBuffer());

    // Upload to Supabase Storage
    const filePath = `image-jobs/${jobId}/expansions/${sourceImageId}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, { contentType: "image/png", upsert: false });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

    // Update source image with expanded URL
    await db
      .from("source_images")
      .update({
        expanded_url: urlData.publicUrl,
        expansion_status: "completed",
        expansion_error: null,
      })
      .eq("id", sourceImageId);

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
        type: "ratio_expansion",
        image_job_id: jobId,
        source_image_id: sourceImageId,
      },
    });

    // Check if all expansions are done -> move job to "ready"
    await updateJobExpansionStatus(db, jobId);

    return NextResponse.json({ expandedUrl: urlData.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expansion failed";

    await db
      .from("source_images")
      .update({ expansion_status: "failed", expansion_error: message })
      .eq("id", sourceImageId);

    await updateJobExpansionStatus(db, jobId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function updateJobExpansionStatus(
  db: ReturnType<typeof createServerSupabase>,
  jobId: string
) {
  const { data: sourceImages } = await db
    .from("source_images")
    .select("expansion_status")
    .eq("job_id", jobId);

  if (!sourceImages?.length) return;

  const anyPending = sourceImages.some(
    (s) => s.expansion_status === "pending" || s.expansion_status === "processing"
  );

  // Move to "ready" when all expansions have a terminal status
  if (!anyPending) {
    await db
      .from("image_jobs")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "expanding");
  }
}
