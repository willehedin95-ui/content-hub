import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { Language, LANGUAGES } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { languages } = (await req.json()) as { languages?: string[] };
  if (!languages?.length) {
    return NextResponse.json({ error: "No languages provided" }, { status: 400 });
  }

  const validLangs = LANGUAGES.map((l) => l.value);
  const newLangs = languages.filter((l) => validLangs.includes(l as Language));
  if (newLangs.length === 0) {
    return NextResponse.json({ error: "No valid languages provided" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Fetch job
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select("id, status, target_languages")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Filter to only truly new languages
  const existing = new Set(job.target_languages ?? []);
  const toAdd = newLangs.filter((l) => !existing.has(l));
  if (toAdd.length === 0) {
    return NextResponse.json({ error: "Languages already exist on this concept" }, { status: 400 });
  }

  // Update target_languages on the job
  const updatedLangs = [...job.target_languages, ...toAdd];
  const { error: updateError } = await db
    .from("image_jobs")
    .update({ target_languages: updatedLangs, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (updateError) {
    return safeError(updateError, "Failed to update target languages");
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

  // Create translation rows only for the NEW languages
  const translationRows: {
    source_image_id: string;
    language: string;
    aspect_ratio: string;
    status: string;
  }[] = [];

  for (const si of translatableImages) {
    for (const lang of toAdd) {
      translationRows.push({
        source_image_id: si.id,
        language: lang,
        aspect_ratio: "1:1",
        status: "pending",
      });
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

  // Set job back to processing if it was completed
  if (job.status === "completed" || job.status === "error") {
    await db
      .from("image_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId);
  }

  return NextResponse.json({
    created: translationRows.length,
    added_languages: toAdd,
    images: translatableImages.length,
  });
}
