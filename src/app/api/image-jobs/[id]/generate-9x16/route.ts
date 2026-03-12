import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
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
  const workspaceId = await getWorkspaceId();

  // Get the job's target_ratios to determine primary ratio
  const { data: job } = await db
    .from("image_jobs")
    .select("target_ratios")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .single();
  const primaryRatio = job?.target_ratios?.[0] ?? "4:5";

  // Get all image_translations for this job via source_images join
  const { data: sourceImages, error: siError } = await db
    .from("source_images")
    .select("id, image_translations(id, language, aspect_ratio, status, translated_url)")
    .eq("job_id", jobId);

  if (siError || !sourceImages?.length) {
    return NextResponse.json({ error: "No source images found" }, { status: 400 });
  }

  // Collect all translations
  const allTranslations = sourceImages.flatMap(
    (si) => (si.image_translations ?? []).map((t) => ({ ...t, source_image_id: si.id }))
  );

  // Check: all primary-ratio translations must be completed
  const translationsPrimary = allTranslations.filter((t) => t.aspect_ratio === primaryRatio);
  const incompletePrimary = translationsPrimary.filter((t) => t.status !== "completed");
  if (incompletePrimary.length > 0) {
    return NextResponse.json(
      { error: `${incompletePrimary.length} of ${translationsPrimary.length} ${primaryRatio} translations are not yet completed` },
      { status: 400 }
    );
  }

  if (translationsPrimary.length === 0) {
    return NextResponse.json({ error: `No ${primaryRatio} translations found` }, { status: 400 });
  }

  // Check: don't create duplicates — skip if 9:16 rows already exist for this (source_image, language)
  const existing9x16 = new Set(
    allTranslations
      .filter((t) => t.aspect_ratio === "9:16")
      .map((t) => `${t.source_image_id}:${t.language}`)
  );

  const rowsToCreate = translationsPrimary
    .filter((t) => !existing9x16.has(`${t.source_image_id}:${t.language}`))
    .map((t) => ({
      source_image_id: t.source_image_id,
      language: t.language,
      aspect_ratio: "9:16",
      status: "pending",
    }));

  if (rowsToCreate.length === 0) {
    return NextResponse.json({ error: "9:16 translations already exist for all images" }, { status: 400 });
  }

  const { error: insertError } = await db
    .from("image_translations")
    .insert(rowsToCreate);

  if (insertError) {
    return safeError(insertError, "Failed to create 9:16 translations");
  }

  // Set job to processing
  await db
    .from("image_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  return NextResponse.json({
    created: rowsToCreate.length,
    languages: new Set(rowsToCreate.map((r) => r.language)).size,
    images: new Set(rowsToCreate.map((r) => r.source_image_id)).size,
  });
}
