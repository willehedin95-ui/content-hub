import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createImageTask, createVeoTask, type VideoModel } from "@/lib/kie";
import { safeError } from "@/lib/api-error";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { shot_id, type, model, veo_prompt: newVeoPrompt, image_prompt: newImagePrompt, language } = body as {
    shot_id: string;
    type: "image" | "video";
    model?: VideoModel;
    veo_prompt?: string;
    image_prompt?: string;
    language?: string;
  };

  if (!shot_id || !type) {
    return NextResponse.json({ error: "shot_id and type are required" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  const { data: shot, error: shotError } = await db
    .from("video_shots")
    .select("*")
    .eq("id", shot_id)
    .eq("video_job_id", id)
    .single();

  if (shotError || !shot) return safeError(shotError, "Shot not found", 404);

  try {
    if (type === "image") {
      // If a new image prompt was provided, save it to the shot
      const effectiveDescription = newImagePrompt || shot.shot_description;
      if (newImagePrompt && newImagePrompt !== shot.shot_description) {
        await db.from("video_shots").update({ shot_description: newImagePrompt }).eq("id", shot_id);
      }

      // Build image prompt — use Pixar prompt directly for pixar_animation, add UGC style for others
      const isPixar = job.format_type === "pixar_animation";
      const imagePrompt = isPixar
        ? effectiveDescription
        : buildUgcImagePrompt(effectiveDescription, job.character_description, job.product_description);

      const charRefUrls = job.character_ref_urls || [];
      const taskId = await createImageTask(imagePrompt, charRefUrls, "2:3", "1K");

      await db.from("video_shots").update({
        image_kie_task_id: taskId,
        image_status: "generating",
        image_url: null,
        error_message: null,
      }).eq("id", shot_id);

      return NextResponse.json({ shot_id, type: "image", task_id: taskId });

    } else if (type === "video") {
      if (!shot.image_url) {
        return NextResponse.json({ error: "Shot must have an image before generating video" }, { status: 400 });
      }

      // Resolve the effective VEO prompt: new override > translated > original
      let effectiveVeoPrompt = newVeoPrompt || shot.veo_prompt;
      if (!newVeoPrompt && language) {
        const { data: translation } = await db.from("video_translations")
          .select("translated_shots").eq("video_job_id", id).eq("language", language).single();
        const translatedShots = translation?.translated_shots as Array<{ shot_number: number; translated_veo_prompt?: string }> | null;
        const translatedPrompt = translatedShots?.find((ts) => ts.shot_number === shot.shot_number)?.translated_veo_prompt;
        if (translatedPrompt) effectiveVeoPrompt = translatedPrompt;
      }

      // If a new VEO prompt was provided, save it to the shot
      if (newVeoPrompt && newVeoPrompt !== shot.veo_prompt) {
        await db.from("video_shots").update({ veo_prompt: newVeoPrompt }).eq("id", shot_id);
      }

      const videoModel: VideoModel = model && ["veo3", "veo3_fast"].includes(model) ? model : "veo3_fast";

      const taskId = await createVeoTask(effectiveVeoPrompt, {
        model: videoModel,
        aspect_ratio: "9:16",
        generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
        imageUrls: [shot.image_url],
      });

      // Resolve language for video_clips (default to first target language)
      const clipLang = language || job.target_languages?.[0];
      if (clipLang) {
        // Write to video_clips (per-language)
        await db.from("video_clips").upsert({
          video_job_id: id,
          language: clipLang,
          shot_number: shot.shot_number,
          video_kie_task_id: taskId,
          video_status: "generating",
          video_url: null,
          error_message: null,
          video_duration_seconds: shot.video_duration_seconds,
          updated_at: new Date().toISOString(),
        }, { onConflict: "video_job_id,language,shot_number" });
      } else {
        // Legacy fallback — no language context
        await db.from("video_shots").update({
          video_kie_task_id: taskId,
          video_status: "generating",
          video_url: null,
          error_message: null,
        }).eq("id", shot_id);
      }

      return NextResponse.json({ shot_id, type: "video", task_id: taskId, model: videoModel, language: clipLang });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    return safeError(err, `Failed to regenerate ${type}`);
  }
}

function buildUgcImagePrompt(shotDescription: string, charDesc: string | null, productDesc: string | null): string {
  return [
    shotDescription,
    charDesc ? `\n\nCharacter: ${charDesc}.` : "",
    productDesc ? `\n\nProduct: ${productDesc}` : "",
    `\n\nYou are locked into a permanent capture style: Authentic iPhone front-camera photo realism.`,
    `Rules: Simulate Apple iPhone computational photography pipeline. No cinematic lighting, no flash, no studio lighting. No beauty filters, no symmetry correction, no pose optimization. Slight wide-angle distortion. Subtle edge sharpening. Flattened midtones. Mild overexposure on highlights. Natural shadow noise. Real skin texture (pores, creases, uneven tone). Casual framing, slightly imperfect crop. Micro motion blur allowed. No HDR look. Flat image colors.`,
    `Subject behavior: Neutral expression or as described. Relaxed posture. Arms not posed. This image must look like a casual iPhone video frame or paused reel, NOT a professional photo.`,
  ].filter(Boolean).join(" ");
}
