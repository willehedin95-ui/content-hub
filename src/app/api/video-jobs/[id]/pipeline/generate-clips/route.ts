import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createVeoTask, type VideoModel } from "@/lib/kie";
import { safeError } from "@/lib/api-error";

export const maxDuration = 60;

const VALID_MODELS: VideoModel[] = ["veo3", "veo3_fast"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const model: VideoModel = VALID_MODELS.includes(body.model) ? body.model : "veo3_fast";
  const shotIds: string[] | undefined = body.shot_ids;

  const db = createServerSupabase();

  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  // Fetch shots — either specific ones or all with completed images and pending video
  let query = db
    .from("video_shots")
    .select("*")
    .eq("video_job_id", id)
    .eq("image_status", "completed");

  if (shotIds?.length) {
    query = query.in("id", shotIds);
  } else {
    query = query.eq("video_status", "pending");
  }

  const { data: shots, error: shotsError } = await query.order("shot_number");
  if (shotsError) return safeError(shotsError, "Failed to fetch shots");
  if (!shots?.length) {
    return NextResponse.json({ message: "No shots ready for video generation" });
  }

  const results: { shot_id: string; shot_number: number; task_id: string }[] = [];

  try {
    for (const shot of shots) {
      // Use FIRST_AND_LAST_FRAMES_2_VIDEO with the shot's keyframe image
      const taskId = await createVeoTask(shot.veo_prompt, {
        model,
        aspect_ratio: "9:16",
        generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
        imageUrls: shot.image_url ? [shot.image_url] : undefined,
      });

      await db.from("video_shots").update({
        video_kie_task_id: taskId,
        video_status: "generating",
      }).eq("id", shot.id);

      results.push({ shot_id: shot.id, shot_number: shot.shot_number, task_id: taskId });

      // Rate limiting delay
      await new Promise((r) => setTimeout(r, 500));
    }

    await db.from("video_jobs").update({ status: "generating" }).eq("id", id);

    // Log usage
    await db.from("usage_logs").insert({
      type: "video_generation",
      model,
      cost_usd: 0,
      metadata: {
        video_job_id: id,
        pipeline: "multi_clip",
        shots_kicked: results.length,
        generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO",
      },
    });

    return NextResponse.json({ kicked: results.length, model, results });
  } catch (err) {
    return safeError(err, "Failed to kick off video clip generation");
  }
}
