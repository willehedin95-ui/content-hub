import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createStoryboardTask, type StoryboardDuration } from "@/lib/kie";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 60;

const VALID_DURATIONS: StoryboardDuration[] = ["10", "15", "25"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const duration: StoryboardDuration = VALID_DURATIONS.includes(body.duration)
    ? body.duration
    : "15";

  const db = createServerSupabase();

  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  // Fetch all shots with completed images, ordered by shot number
  const { data: shots, error: shotsError } = await db
    .from("video_shots")
    .select("*")
    .eq("video_job_id", id)
    .eq("image_status", "completed")
    .order("shot_number");

  if (shotsError) return safeError(shotsError, "Failed to fetch shots");
  if (!shots?.length) {
    return NextResponse.json(
      { error: "No shots with completed images. Generate shot images first." },
      { status: 400 }
    );
  }

  // Collect all keyframe image URLs in shot order
  const imageUrls = shots
    .map((s) => s.image_url)
    .filter((url): url is string => !!url);

  if (imageUrls.length === 0) {
    return NextResponse.json(
      { error: "No shot images found" },
      { status: 400 }
    );
  }

  try {
    const taskId = await createStoryboardTask(imageUrls, duration, "portrait");

    await db
      .from("video_jobs")
      .update({
        storyboard_kie_task_id: taskId,
        storyboard_status: "generating",
        storyboard_duration: duration,
        video_generation_method: "storyboard",
        status: "generating",
      })
      .eq("id", id);

    // Log usage
    await db.from("usage_logs").insert({
      type: "video_generation",
      model: "sora-2-pro-storyboard",
      cost_usd: 0,
      metadata: {
        video_job_id: id,
        pipeline: "storyboard",
        duration,
        keyframe_count: imageUrls.length,
      },
    });

    return NextResponse.json({ taskId, duration, keyframes: imageUrls.length });
  } catch (err) {
    return safeError(err, "Failed to kick off storyboard generation");
  }
}
