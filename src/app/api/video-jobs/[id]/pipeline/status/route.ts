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
  const language = req.nextUrl.searchParams.get("language") || null;
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

  // Fetch video_clips for the requested language (or none for legacy)
  const clipsByShot: Record<number, {
    id: string;
    video_url: string | null;
    video_kie_task_id: string | null;
    video_status: string;
    video_duration_seconds: number;
    error_message: string | null;
  }> = {};

  if (language) {
    const { data: clips } = await db
      .from("video_clips")
      .select("*")
      .eq("video_job_id", id)
      .eq("language", language);

    for (const clip of clips || []) {
      clipsByShot[clip.shot_number] = clip;
    }
  }

  // Check and update status for generating items
  for (const shot of shots || []) {
    // Check image generation status (shared across languages — stays on video_shots)
    if (shot.image_status === "generating" && shot.image_kie_task_id) {
      // Handle "reuse" shots — these inherit the source shot's completed image
      if (shot.image_kie_task_id.startsWith("reuse:")) {
        const sourceId = shot.image_kie_task_id.replace("reuse:", "");
        const sourceShot = (shots || []).find((s: { id: string }) => s.id === sourceId);
        if (sourceShot?.image_status === "completed" && sourceShot?.image_url) {
          await db.from("video_shots").update({
            image_status: "completed",
            image_url: sourceShot.image_url,
          }).eq("id", shot.id);
          shot.image_status = "completed";
          shot.image_url = sourceShot.image_url;
        } else if (sourceShot?.image_status === "failed") {
          await db.from("video_shots").update({
            image_status: "failed",
            error_message: "Source shot image failed",
          }).eq("id", shot.id);
          shot.image_status = "failed";
          shot.error_message = "Source shot image failed";
        }
        continue;
      }

      try {
        const status = await checkImageTaskStatus(shot.image_kie_task_id);
        if (status.status === "completed" && status.urls.length > 0) {
          const imgResponse = await fetch(status.urls[0]);
          if (imgResponse.ok) {
            const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
            const storagePath = `${job.product}/${id}/shot-${shot.shot_number}.png`;
            const { error: uploadError } = await db.storage
              .from(VIDEO_STORAGE_BUCKET)
              .upload(storagePath, imgBuffer, { contentType: "image/png", upsert: true });

            if (!uploadError) {
              const { data: publicUrl } = db.storage.from(VIDEO_STORAGE_BUCKET).getPublicUrl(storagePath);
              const bustUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
              await db.from("video_shots").update({
                image_status: "completed",
                image_url: bustUrl,
              }).eq("id", shot.id);
              shot.image_status = "completed";
              shot.image_url = bustUrl;
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

    // Check video generation status — use video_clips if language provided, else legacy video_shots
    if (language) {
      const clip = clipsByShot[shot.shot_number];
      if (clip?.video_status === "generating" && clip.video_kie_task_id) {
        try {
          const status = await checkVeoStatus(clip.video_kie_task_id);
          if (status.status === "completed" && status.urls.length > 0) {
            const videoResponse = await fetch(status.urls[0]);
            if (videoResponse.ok) {
              const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
              // Language-segmented storage path
              const storagePath = `${job.product}/${id}/${language}/shot-${shot.shot_number}.mp4`;
              const { error: uploadError } = await db.storage
                .from(VIDEO_STORAGE_BUCKET)
                .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: true });

              if (!uploadError) {
                const { data: publicUrl } = db.storage.from(VIDEO_STORAGE_BUCKET).getPublicUrl(storagePath);
                const bustUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
                await db.from("video_clips").update({
                  video_status: "completed",
                  video_url: bustUrl,
                  updated_at: new Date().toISOString(),
                }).eq("id", clip.id);
                clip.video_status = "completed";
                clip.video_url = bustUrl;
              }
            }
          } else if (status.status === "failed") {
            await db.from("video_clips").update({
              video_status: "failed",
              error_message: status.errorMessage,
              updated_at: new Date().toISOString(),
            }).eq("id", clip.id);
            clip.video_status = "failed";
            clip.error_message = status.errorMessage;
          }
        } catch (err) {
          console.error(`Error checking clip status for shot ${shot.shot_number} (${language}):`, err);
        }
      }
    } else {
      // Legacy: poll video_shots directly (for old jobs without video_clips)
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
                const bustUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
                await db.from("video_shots").update({
                  video_status: "completed",
                  video_url: bustUrl,
                }).eq("id", shot.id);
                shot.video_status = "completed";
                shot.video_url = bustUrl;
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
  }

  // Check storyboard generation status
  let storyboardStatus = job.storyboard_status || "pending";
  let storyboardUrl = job.storyboard_url || null;

  if (storyboardStatus === "generating" && job.storyboard_kie_task_id) {
    try {
      const status = await checkImageTaskStatus(job.storyboard_kie_task_id);
      if (status.status === "completed" && status.urls.length > 0) {
        const videoResponse = await fetch(status.urls[0]);
        if (videoResponse.ok) {
          const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
          const storagePath = `${job.product}/${id}/storyboard.mp4`;
          const { error: uploadError } = await db.storage
            .from(VIDEO_STORAGE_BUCKET)
            .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: true });

          if (!uploadError) {
            const { data: publicUrl } = db.storage.from(VIDEO_STORAGE_BUCKET).getPublicUrl(storagePath);
            storyboardUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
            storyboardStatus = "completed";
            await db.from("video_jobs").update({
              storyboard_status: "completed",
              storyboard_url: storyboardUrl,
              status: "generated",
            }).eq("id", id);

            // Task 10: Copy storyboard result to video_translations for each target language
            for (const lang of job.target_languages || []) {
              const { data: existing } = await db
                .from("video_translations")
                .select("id")
                .eq("video_job_id", id)
                .eq("language", lang)
                .single();

              if (existing) {
                await db.from("video_translations")
                  .update({ video_url: storyboardUrl, status: "completed" })
                  .eq("id", existing.id);
              } else {
                await db.from("video_translations").insert({
                  video_job_id: id,
                  language: lang,
                  video_url: storyboardUrl,
                  status: "completed",
                });
              }
            }
          }
        }
      } else if (status.status === "failed") {
        storyboardStatus = "failed";
        await db.from("video_jobs").update({
          storyboard_status: "failed",
        }).eq("id", id);
      }
    } catch (err) {
      console.error("Error checking storyboard status:", err);
    }
  }

  // Determine overall pipeline status
  const allShots = shots || [];

  // Image status (always from video_shots — shared)
  const anyImageGenerating = allShots.some((s: { image_status: string }) => s.image_status === "generating");
  const allImagesCompleted = allShots.length > 0 && allShots.every((s: { image_status: string }) => s.image_status === "completed");
  const anyImageFailed = allShots.some((s: { image_status: string }) => s.image_status === "failed");

  // Video/clip status — from video_clips if language provided, else legacy video_shots
  let anyVideoGenerating = false;
  let allVideosCompleted = false;
  let anyVideoFailed = false;

  if (language && Object.keys(clipsByShot).length > 0) {
    const clipValues = Object.values(clipsByShot);
    anyVideoGenerating = clipValues.some((c) => c.video_status === "generating");
    allVideosCompleted = allShots.length > 0 &&
      allShots.every((s: { shot_number: number }) => clipsByShot[s.shot_number]?.video_status === "completed");
    anyVideoFailed = clipValues.some((c) => c.video_status === "failed");
  } else if (!language) {
    anyVideoGenerating = allShots.some((s: { video_status: string }) => s.video_status === "generating");
    allVideosCompleted = allShots.length > 0 && allShots.every((s: { video_status: string }) => s.video_status === "completed");
    anyVideoFailed = allShots.some((s: { video_status: string }) => s.video_status === "failed");
  }

  const anyFailed = anyImageFailed || anyVideoFailed;

  let overallStatus = "pending";
  const isStoryboard = job.video_generation_method === "storyboard" || job.video_generation_method === "kling";
  if (isStoryboard && storyboardStatus === "completed") overallStatus = "completed";
  else if (isStoryboard && storyboardStatus === "generating") overallStatus = "generating_storyboard";
  else if (isStoryboard && storyboardStatus === "failed") overallStatus = "failed";
  else if (anyFailed) overallStatus = "failed";
  else if (allVideosCompleted) overallStatus = "completed";
  else if (anyVideoGenerating) overallStatus = "generating_clips";
  else if (allImagesCompleted) overallStatus = "reviewing";
  else if (anyImageGenerating) overallStatus = "generating_images";

  return NextResponse.json({
    pipeline_mode: job.pipeline_mode,
    video_generation_method: job.video_generation_method || "veo3",
    character_ref_status: job.character_ref_status,
    character_ref_urls: job.character_ref_urls || [],
    reuse_first_frame: job.reuse_first_frame ?? true,
    storyboard_status: storyboardStatus,
    storyboard_url: storyboardUrl,
    storyboard_duration: job.storyboard_duration || "15",
    language: language || null,
    shots: (shots || []).map((s: Record<string, unknown>) => {
      const clip = language ? clipsByShot[s.shot_number as number] : null;
      return {
        id: s.id,
        shot_number: s.shot_number,
        shot_description: s.shot_description,
        image_status: s.image_status,
        image_url: s.image_url,
        // Use clip data if available, fall back to legacy video_shots columns
        video_status: clip?.video_status ?? s.video_status ?? "pending",
        video_url: clip?.video_url ?? s.video_url ?? null,
        veo_prompt: s.veo_prompt,
        video_duration_seconds: clip?.video_duration_seconds ?? s.video_duration_seconds,
        error_message: clip?.error_message ?? s.error_message,
      };
    }),
    overall_status: overallStatus,
  });
}
