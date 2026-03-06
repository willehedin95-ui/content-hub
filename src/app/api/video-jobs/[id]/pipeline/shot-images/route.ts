import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createImageTask } from "@/lib/kie";
import { safeError } from "@/lib/api-error";

export const maxDuration = 60;

export async function POST(
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
    .eq("image_status", "pending")
    .order("shot_number");

  if (shotsError) return safeError(shotsError, "Failed to fetch shots");
  if (!shots?.length) {
    return NextResponse.json({ message: "No pending shots to generate images for" });
  }

  // Use character ref images as reference input for consistency
  const charRefUrls = job.character_ref_urls || [];

  const results: { shot_id: string; shot_number: number; task_id: string }[] = [];

  try {
    for (const shot of shots) {
      // Adapt veo_prompt for still image generation
      const imagePrompt = `High quality photograph, cinematic still frame. ${shot.shot_description}. Detailed, realistic, 9:16 vertical format.`;

      const taskId = await createImageTask(imagePrompt, charRefUrls, "2:3", "1K");

      await db.from("video_shots").update({
        image_kie_task_id: taskId,
        image_status: "generating",
      }).eq("id", shot.id);

      results.push({ shot_id: shot.id, shot_number: shot.shot_number, task_id: taskId });

      // Small delay between API calls
      await new Promise((r) => setTimeout(r, 500));
    }

    // Log usage
    await db.from("usage_logs").insert({
      type: "video_shot_image",
      model: "nano-banana-2",
      cost_usd: 0,
      metadata: {
        video_job_id: id,
        pipeline: "multi_clip",
        shots_kicked: results.length,
      },
    });

    return NextResponse.json({ kicked: results.length, results });
  } catch (err) {
    return safeError(err, "Failed to kick off shot image generation");
  }
}
