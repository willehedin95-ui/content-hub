import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { checkImageTaskStatus, checkVeoStatus } from "@/lib/kie";
import { safeError } from "@/lib/api-error";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  const { data: shots, error: shotsError } = await db
    .from("video_shots")
    .select("*")
    .eq("video_job_id", id)
    .order("shot_number");

  if (shotsError) return safeError(shotsError, "Failed to fetch shots");

  // Check and update status for generating items
  for (const shot of shots || []) {
    // Check image generation status
    if (shot.image_status === "generating" && shot.image_kie_task_id) {
      try {
        const status = await checkImageTaskStatus(shot.image_kie_task_id);
        if (status.status === "completed" && status.urls.length > 0) {
          // Download and upload to storage
          const imgResponse = await fetch(status.urls[0]);
          if (imgResponse.ok) {
            const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
            const storagePath = `${job.product}/${id}/shot-${shot.shot_number}.png`;
            const { error: uploadError } = await db.storage
              .from(VIDEO_STORAGE_BUCKET)
              .upload(storagePath, imgBuffer, { contentType: "image/png", upsert: true });

            if (!uploadError) {
              const { data: publicUrl } = db.storage.from(VIDEO_STORAGE_BUCKET).getPublicUrl(storagePath);
              await db.from("video_shots").update({
                image_status: "completed",
                image_url: publicUrl.publicUrl,
              }).eq("id", shot.id);
              shot.image_status = "completed";
              shot.image_url = publicUrl.publicUrl;
            }
          }
        } else if (status.status === "failed") {
          await db.from("video_shots").update({
            image_status: "failed",
            error_message: status.errorMessage,
          }).eq("id", shot.id);
          shot.image_status = "failed";
          shot.error_message = status.errorMessage;
        }
      } catch (err) {
        console.error(`Error checking image status for shot ${shot.shot_number}:`, err);
      }
    }

    // Check video generation status
    if (shot.video_status === "generating" && shot.video_kie_task_id) {
      try {
        const status = await checkVeoStatus(shot.video_kie_task_id);
        if (status.status === "completed" && status.urls.length > 0) {
          const videoResponse = await fetch(status.urls[0]);
          if (videoResponse.ok) {
            const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
            const storagePath = `${job.product}/${id}/shot-${shot.shot_number}.mp4`;
            const { error: uploadError } = await db.storage
              .from(VIDEO_STORAGE_BUCKET)
              .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: true });

            if (!uploadError) {
              const { data: publicUrl } = db.storage.from(VIDEO_STORAGE_BUCKET).getPublicUrl(storagePath);
              await db.from("video_shots").update({
                video_status: "completed",
                video_url: publicUrl.publicUrl,
              }).eq("id", shot.id);
              shot.video_status = "completed";
              shot.video_url = publicUrl.publicUrl;
            }
          }
        } else if (status.status === "failed") {
          await db.from("video_shots").update({
            video_status: "failed",
            error_message: status.errorMessage,
          }).eq("id", shot.id);
          shot.video_status = "failed";
          shot.error_message = status.errorMessage;
        }
      } catch (err) {
        console.error(`Error checking video status for shot ${shot.shot_number}:`, err);
      }
    }
  }

  // Determine overall pipeline status
  const allShots = shots || [];
  let overallStatus = "pending";

  const anyImageGenerating = allShots.some((s: { image_status: string }) => s.image_status === "generating");
  const anyVideoGenerating = allShots.some((s: { video_status: string }) => s.video_status === "generating");
  const allImagesCompleted = allShots.length > 0 && allShots.every((s: { image_status: string }) => s.image_status === "completed");
  const allVideosCompleted = allShots.length > 0 && allShots.every((s: { video_status: string }) => s.video_status === "completed");
  const anyFailed = allShots.some((s: { image_status: string; video_status: string }) => s.image_status === "failed" || s.video_status === "failed");

  if (anyFailed) overallStatus = "failed";
  else if (allVideosCompleted) overallStatus = "completed";
  else if (anyVideoGenerating) overallStatus = "generating_clips";
  else if (allImagesCompleted) overallStatus = "reviewing";
  else if (anyImageGenerating) overallStatus = "generating_images";

  return NextResponse.json({
    pipeline_mode: job.pipeline_mode,
    character_ref_status: job.character_ref_status,
    character_ref_urls: job.character_ref_urls || [],
    shots: (shots || []).map((s: Record<string, unknown>) => ({
      id: s.id,
      shot_number: s.shot_number,
      shot_description: s.shot_description,
      image_status: s.image_status,
      image_url: s.image_url,
      video_status: s.video_status,
      video_url: s.video_url,
      video_duration_seconds: s.video_duration_seconds,
      error_message: s.error_message,
    })),
    overall_status: overallStatus,
  });
}
