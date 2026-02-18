import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { validateImageFile } from "@/lib/validation";
import { STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const validation = validateImageFile(file);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const db = createServerSupabase();

  // Verify job exists
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select("id, target_languages, target_ratios")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Upload to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = `image-jobs/${jobId}/${crypto.randomUUID()}.${validation.ext}`;

  const { error: uploadError } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, {
      contentType: file.type || "image/png",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

  // Create source_image record with expansion_status pending
  // (translations are created later via /create-translations after expansion review)
  const { data: sourceImage, error: siError } = await db
    .from("source_images")
    .insert({
      job_id: jobId,
      original_url: urlData.publicUrl,
      filename: file.name,
      expansion_status: "pending",
    })
    .select()
    .single();

  if (siError || !sourceImage) {
    return NextResponse.json({ error: siError?.message ?? "Failed to create source image" }, { status: 500 });
  }

  return NextResponse.json(sourceImage);
}
