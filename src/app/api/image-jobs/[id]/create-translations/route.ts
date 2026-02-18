import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const db = createServerSupabase();

  // Verify job exists and is in "ready" status
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select("id, status, target_languages")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "ready") {
    return NextResponse.json(
      { error: `Job is not ready for translation (status: ${job.status})` },
      { status: 400 }
    );
  }

  // Get all source images
  const { data: sourceImages, error: siError } = await db
    .from("source_images")
    .select("id, expansion_status")
    .eq("job_id", jobId);

  if (siError || !sourceImages?.length) {
    return NextResponse.json({ error: "No source images found" }, { status: 400 });
  }

  // Create translation rows for each (source_image × language × ratio)
  const translationRows: {
    source_image_id: string;
    language: string;
    aspect_ratio: string;
    status: string;
  }[] = [];

  for (const si of sourceImages) {
    for (const lang of job.target_languages) {
      // Always create 1:1 translations
      translationRows.push({
        source_image_id: si.id,
        language: lang,
        aspect_ratio: "1:1",
        status: "pending",
      });

      // Only create 9:16 translations for images with successful expansion
      if (si.expansion_status === "completed") {
        translationRows.push({
          source_image_id: si.id,
          language: lang,
          aspect_ratio: "9:16",
          status: "pending",
        });
      }
    }
  }

  if (translationRows.length === 0) {
    return NextResponse.json({ error: "No translations to create" }, { status: 400 });
  }

  const { error: insertError } = await db
    .from("image_translations")
    .insert(translationRows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Move job to processing
  await db
    .from("image_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  return NextResponse.json({
    created: translationRows.length,
    languages: job.target_languages.length,
    images: sourceImages.length,
  });
}
