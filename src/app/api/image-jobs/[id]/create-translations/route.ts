import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  // Verify job exists and is in "ready" status
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select("id, status, target_languages, target_ratios")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "ready" && job.status !== "draft") {
    return NextResponse.json(
      { error: `Job is not ready for translation (status: ${job.status})` },
      { status: 400 }
    );
  }

  // Get source images that need translation
  const { data: sourceImages, error: siError } = await db
    .from("source_images")
    .select("id, skip_translation")
    .eq("job_id", jobId);

  if (siError || !sourceImages?.length) {
    return NextResponse.json({ error: "No source images found" }, { status: 400 });
  }

  const translatableImages = sourceImages.filter((si) => !si.skip_translation);

  // Create translation rows for each (source_image × language)
  const translationRows: {
    source_image_id: string;
    language: string;
    aspect_ratio: string;
    status: string;
  }[] = [];

  const ratios = job.target_ratios?.length ? job.target_ratios : ["4:5"];
  for (const si of translatableImages) {
    for (const lang of job.target_languages) {
      for (const ratio of ratios) {
        translationRows.push({
          source_image_id: si.id,
          language: lang,
          aspect_ratio: ratio,
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
    return safeError(insertError, "Failed to create image translations");
  }

  // Move job to processing
  await db
    .from("image_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  return NextResponse.json({
    created: translationRows.length,
    languages: job.target_languages.length,
    ratios: ratios.length,
    images: translatableImages.length,
    skipped: sourceImages.length - translatableImages.length,
  });
}
