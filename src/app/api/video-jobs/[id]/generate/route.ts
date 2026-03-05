import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { generateVideo } from "@/lib/kie";
import { safeError } from "@/lib/api-error";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 300; // 5 minutes for Vercel

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // 1. Fetch the video job
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);
  if (!job.sora_prompt) {
    return NextResponse.json({ error: "No Sora prompt set on this job" }, { status: 400 });
  }

  // 2. Create source_video row
  const generationParams = {
    model: "sora-2-pro",
    size: "720x1280",
    seconds: String(job.duration_seconds || 12),
    style: "raw",
    stylize: 0,
  };

  const { data: sourceVideo, error: svError } = await db
    .from("source_videos")
    .insert({
      video_job_id: id,
      status: "generating",
      resolution: "720x1280",
      model: "sora-2-pro",
      generation_params: generationParams,
    })
    .select()
    .single();

  if (svError) return safeError(svError, "Failed to create source video record");

  // 3. Update job status
  await db.from("video_jobs").update({ status: "generating" }).eq("id", id);

  // 4. Generate video (this blocks for up to ~5 minutes)
  try {
    const result = await generateVideo(job.sora_prompt, generationParams);

    if (!result.urls.length) {
      throw new Error("Kie.ai returned no video URLs");
    }

    const videoUrl = result.urls[0];

    // 5. Download video and upload to Supabase Storage
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.status}`);
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

    const storagePath = `${job.product}/${id}/source.mp4`;
    const { error: uploadError } = await db.storage
      .from(VIDEO_STORAGE_BUCKET)
      .upload(storagePath, videoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: publicUrl } = db.storage
      .from(VIDEO_STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    // 6. Update source_video
    await db
      .from("source_videos")
      .update({
        status: "completed",
        video_url: publicUrl.publicUrl,
        kie_task_id: result.taskId,
        duration_seconds: job.duration_seconds,
      })
      .eq("id", sourceVideo.id);

    // 7. Update job status
    await db.from("video_jobs").update({ status: "generated" }).eq("id", id);

    // 8. Log usage
    await db.from("usage_logs").insert({
      type: "video_generation",
      model: "sora-2-pro",
      cost_usd: 0,
      metadata: {
        video_job_id: id,
        source_video_id: sourceVideo.id,
        task_id: result.taskId,
        cost_time_ms: result.costTimeMs,
      },
    });

    return NextResponse.json({
      source_video_id: sourceVideo.id,
      video_url: publicUrl.publicUrl,
      task_id: result.taskId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .from("source_videos")
      .update({ status: "failed", error_message: message })
      .eq("id", sourceVideo.id);
    await db.from("video_jobs").update({ status: "draft" }).eq("id", id);

    return safeError(err, "Video generation failed");
  }
}
