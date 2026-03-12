import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createKlingTask } from "@/lib/kie";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const multiShots: boolean = body.multi_shots ?? false;
  const mode: "std" | "pro" = body.mode === "pro" ? "pro" : "std";
  const useStartFrame: boolean = body.use_start_frame ?? true;
  const language: string | undefined = body.language;

  const db = createServerSupabase();

  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  // If language is specified, fetch translated script
  let translatedScript: string | null = null;
  if (language) {
    const { data: translation } = await db
      .from("video_translations")
      .select("translated_script")
      .eq("video_job_id", id)
      .eq("language", language)
      .single();
    translatedScript = translation?.translated_script || null;
  }

  // Fetch completed shot images (for optional start frame)
  const { data: shots } = await db
    .from("video_shots")
    .select("*")
    .eq("video_job_id", id)
    .eq("image_status", "completed")
    .order("shot_number");

  // Build the text prompt from job data
  const promptParts: string[] = [];

  if (job.character_description) {
    promptParts.push(`Character: ${job.character_description}`);
  }

  if (job.format_type === "pixar_animation") {
    promptParts.push(
      `Setting: High-end Pixar-style 3D character animation. Anthropomorphic animated object speaking directly to camera in portrait 9:16 format. Stylized realism, expressive oversized eyes, cinematic lighting, premium animated film quality.`
    );
  } else {
    const formatLabel = job.format_type
      ? job.format_type.replace(/_/g, " ")
      : "UGC";
    promptParts.push(
      `Setting: ${formatLabel} style UGC video, person talking directly to phone camera in portrait 9:16 format.`
    );
  }

  const scriptToUse = translatedScript || job.script;
  if (scriptToUse) {
    promptParts.push(`Script (the character says this):\n${scriptToUse}`);
  }

  const prompt = promptParts.join("\n\n");

  // Optionally use first keyframe as start frame
  const imageUrls: string[] = [];
  if (useStartFrame && shots?.length && shots[0].image_url) {
    imageUrls.push(shots[0].image_url);
  }

  try {
    const taskId = await createKlingTask({
      prompt,
      imageUrls,
      multiShots,
      sound: true,
      duration: 15,
      aspectRatio: "9:16",
      mode,
    });

    await db
      .from("video_jobs")
      .update({
        storyboard_kie_task_id: taskId,
        storyboard_status: "generating",
        storyboard_duration: "15",
        video_generation_method: "kling",
        status: "generating",
      })
      .eq("id", id);

    // Log usage
    await db.from("usage_logs").insert({
      type: "video_generation",
      model: "kling-3.0/video",
      cost_usd: 0,
      metadata: {
        video_job_id: id,
        pipeline: "kling",
        multi_shots: multiShots,
        mode,
        has_start_frame: imageUrls.length > 0,
      },
    });

    return NextResponse.json({
      taskId,
      multi_shots: multiShots,
      mode,
      has_start_frame: imageUrls.length > 0,
    });
  } catch (err) {
    return safeError(err, "Failed to kick off Kling video generation");
  }
}
