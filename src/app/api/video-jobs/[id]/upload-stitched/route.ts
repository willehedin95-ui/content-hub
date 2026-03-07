import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Verify job exists and get target languages
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("product, target_languages")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const language = formData.get("language") as string | null;

  if (!file)
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Use language-specific storage path when uploading per-language
  const storagePath = language
    ? `${job.product}/${id}/stitched-${language}.mp4`
    : `${job.product}/${id}/stitched.mp4`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await db.storage
    .from(VIDEO_STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (uploadError) return safeError(uploadError, "Storage upload failed");

  const { data: publicUrl } = db.storage
    .from(VIDEO_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  const videoUrl = publicUrl.publicUrl;

  // Update job status
  await db
    .from("video_jobs")
    .update({ status: "generated" })
    .eq("id", id);

  // If a specific language is provided, only update that language's translation.
  // Otherwise update all target languages (backward compat for VideoStitcher).
  const languages: string[] = language ? [language] : (job.target_languages ?? []);
  for (const lang of languages) {
    const { data: existing } = await db
      .from("video_translations")
      .select("id")
      .eq("video_job_id", id)
      .eq("language", lang)
      .single();

    if (existing) {
      await db
        .from("video_translations")
        .update({ video_url: videoUrl, status: "completed" })
        .eq("id", existing.id);
    } else {
      await db.from("video_translations").insert({
        video_job_id: id,
        language: lang,
        video_url: videoUrl,
        status: "completed",
      });
    }
  }

  return NextResponse.json({ video_url: videoUrl });
}
