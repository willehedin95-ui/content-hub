import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
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
  const workspaceId = await getWorkspaceId();

  // Fetch job
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select("id, status, target_languages, target_ratios, source_language")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
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
    .select("id, skip_translation, original_url")
    .eq("job_id", jobId);

  if (siError || !sourceImages?.length) {
    return NextResponse.json({ error: "No source images found" }, { status: 400 });
  }

  const translatableImages = sourceImages.filter((si) => !si.skip_translation);
  const skippedImages = sourceImages.filter((si) => si.skip_translation);

  // Create translation rows only for the NEW languages (mirrors the
  // create-translations route: same-language and no-text images get
  // pre-completed passthrough rows instead of pending Kie rows)
  const translationRows: {
    source_image_id: string;
    language: string;
    aspect_ratio: string;
    status: string;
    translated_url?: string;
  }[] = [];

  const ratios = job.target_ratios?.length ? job.target_ratios : ["4:5"];
  const primaryRatio = ratios[0] ?? "4:5";
  const sourceLang = job.source_language as string | null;

  // Normal images: all ratios as "pending"
  // EXCEPTION: adding the SOURCE language = no transformation needed for the
  // primary ratio, so it completes immediately with the original image
  for (const si of translatableImages) {
    for (const lang of toAdd) {
      const isSameLanguage = sourceLang && lang === sourceLang;
      for (const ratio of ratios) {
        if (isSameLanguage && ratio === primaryRatio) {
          translationRows.push({
            source_image_id: si.id,
            language: lang,
            aspect_ratio: ratio,
            status: "completed",
            translated_url: si.original_url,
          });
        } else {
          translationRows.push({
            source_image_id: si.id,
            language: lang,
            aspect_ratio: ratio,
            status: "pending",
          });
        }
      }
    }
  }

  // Skipped images (no text): primary ratio as pre-completed (original URL),
  // secondary ratios (9:16) as pending so outpainting still runs
  for (const si of skippedImages) {
    for (const lang of toAdd) {
      translationRows.push({
        source_image_id: si.id,
        language: lang,
        aspect_ratio: primaryRatio,
        status: "completed",
        translated_url: si.original_url,
      });
      for (const ratio of ratios) {
        if (ratio !== primaryRatio) {
          translationRows.push({
            source_image_id: si.id,
            language: lang,
            aspect_ratio: ratio,
            status: "pending",
          });
        }
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
    ratios: ratios.length,
    images: translatableImages.length,
  });
}
