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
  const reuseFirstFrame = job.reuse_first_frame ?? true;

  const results: { shot_id: string; shot_number: number; task_id: string; reused?: boolean }[] = [];

  const isPixar = job.format_type === "pixar_animation";

  try {
    if (reuseFirstFrame) {
      // REUSE FIRST FRAME MODE (VEO Studio approach for talking head UGC):
      // Generate only shot 1's image, all other shots wait for it.
      // The status endpoint will copy shot 1's image_url to all other shots once it completes.
      const firstShot = shots[0]; // shots are ordered by shot_number, so [0] is the lowest pending

      const imagePrompt = isPixar
        ? firstShot.shot_description
        : buildImagePrompt(firstShot.shot_description, job.character_description, job.product_description);
      const taskId = await createImageTask(imagePrompt, charRefUrls, "2:3", "1K");

      await db.from("video_shots").update({
        image_kie_task_id: taskId,
        image_status: "generating",
      }).eq("id", firstShot.id);

      results.push({ shot_id: firstShot.id, shot_number: firstShot.shot_number, task_id: taskId });

      // Mark remaining shots as "generating" too (they'll be resolved when shot 1 completes)
      const remainingShots = shots.filter(s => s.id !== firstShot.id);
      for (const shot of remainingShots) {
        await db.from("video_shots").update({
          image_status: "generating",
          // Store metadata to indicate this shot reuses shot 1's image
          image_kie_task_id: `reuse:${firstShot.id}`,
        }).eq("id", shot.id);

        results.push({ shot_id: shot.id, shot_number: shot.shot_number, task_id: `reuse:${firstShot.id}`, reused: true });
      }
    } else {
      // INDIVIDUAL IMAGE MODE: Generate a unique keyframe for each shot
      for (const shot of shots) {
        const imagePrompt = isPixar
          ? shot.shot_description
          : buildImagePrompt(shot.shot_description, job.character_description, job.product_description);
        const taskId = await createImageTask(imagePrompt, charRefUrls, "2:3", "1K");

        await db.from("video_shots").update({
          image_kie_task_id: taskId,
          image_status: "generating",
        }).eq("id", shot.id);

        results.push({ shot_id: shot.id, shot_number: shot.shot_number, task_id: taskId });

        // Small delay between API calls
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Log usage
    const actualGenerations = results.filter(r => !r.reused).length;
    await db.from("usage_logs").insert({
      type: "video_shot_image",
      model: "nano-banana-2",
      cost_usd: 0,
      metadata: {
        video_job_id: id,
        pipeline: "multi_clip",
        shots_kicked: results.length,
        actual_generations: actualGenerations,
        reuse_first_frame: reuseFirstFrame,
      },
    });

    return NextResponse.json({ kicked: results.length, reuse_first_frame: reuseFirstFrame, results });
  } catch (err) {
    return safeError(err, "Failed to kick off shot image generation");
  }
}

function buildImagePrompt(shotDescription: string, charDesc: string | null, productDesc: string | null): string {
  return [
    shotDescription,
    charDesc ? `\n\nCharacter: ${charDesc}.` : "",
    productDesc ? `\n\nProduct: ${productDesc}` : "",
    `\n\nYou are locked into a permanent capture style: Authentic iPhone front-camera photo realism.`,
    `Rules: Simulate Apple iPhone computational photography pipeline. No cinematic lighting, no flash, no studio lighting. No beauty filters, no symmetry correction, no pose optimization. Slight wide-angle distortion. Subtle edge sharpening. Flattened midtones. Mild overexposure on highlights. Natural shadow noise. Real skin texture (pores, creases, uneven tone). Casual framing, slightly imperfect crop. Micro motion blur allowed. No HDR look. Flat image colors.`,
    `Subject behavior: Neutral expression or as described. Relaxed posture. Arms not posed. This image must look like a casual iPhone video frame or paused reel, NOT a professional photo.`,
  ].filter(Boolean).join(" ");
}
