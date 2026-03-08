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
  const language: string | undefined = body.language;

  const db = createServerSupabase();

  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  // Resolve language — required for video_clips, default to first target language
  const lang = language || job.target_languages?.[0];
  if (!lang) {
    return NextResponse.json(
      { error: "No language specified and job has no target languages" },
      { status: 400 }
    );
  }

  // If language differs from original, fetch translated VEO prompts
  let translatedPrompts: Map<number, string> | null = null;
  if (language) {
    const { data: translation } = await db
      .from("video_translations")
      .select("translated_shots")
      .eq("video_job_id", id)
      .eq("language", language)
      .single();

    if (translation?.translated_shots) {
      translatedPrompts = new Map();
      for (const ts of translation.translated_shots as Array<{
        shot_number: number;
        translated_veo_prompt?: string;
      }>) {
        if (ts.translated_veo_prompt) {
          translatedPrompts.set(ts.shot_number, ts.translated_veo_prompt);
        }
      }
    }
  }

  // Fetch shots with completed images
  let query = db
    .from("video_shots")
    .select("*")
    .eq("video_job_id", id)
    .eq("image_status", "completed");

  if (shotIds?.length) {
    query = query.in("id", shotIds);
  }

  const { data: shots, error: shotsError } = await query.order("shot_number");
  if (shotsError) return safeError(shotsError, "Failed to fetch shots");
  if (!shots?.length) {
    return NextResponse.json({ message: "No shots ready for video generation" });
  }

  // Check which shots already have completed clips for this language
  const { data: existingClips } = await db
    .from("video_clips")
    .select("shot_number, video_status")
    .eq("video_job_id", id)
    .eq("language", lang);

  const completedShotNumbers = new Set(
    (existingClips || [])
      .filter((c) => c.video_status === "completed")
      .map((c) => c.shot_number)
  );

  // Filter to shots that don't yet have a completed clip (unless specific shot_ids requested)
  const eligibleShots = shotIds?.length
    ? shots
    : shots.filter((s) => !completedShotNumbers.has(s.shot_number));

  if (!eligibleShots.length) {
    return NextResponse.json({ message: "All shots already have completed clips for this language" });
  }

  const results: { shot_id: string; shot_number: number; task_id: string }[] = [];

  try {
    for (const shot of eligibleShots) {
      // Use translated prompt if available, otherwise original
      const prompt = translatedPrompts?.get(shot.shot_number) || shot.veo_prompt;

      // Use FIRST_AND_LAST_FRAMES_2_VIDEO with the shot's keyframe image
      const taskId = await createVeoTask(prompt, {
        model,
        aspect_ratio: "9:16",
        generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
        imageUrls: shot.image_url ? [shot.image_url] : undefined,
      });

      // Write to video_clips (per-language) instead of video_shots
      await db.from("video_clips").upsert(
        {
          video_job_id: id,
          language: lang,
          shot_number: shot.shot_number,
          video_kie_task_id: taskId,
          video_status: "generating",
          video_duration_seconds: shot.video_duration_seconds,
          error_message: null,
          video_url: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "video_job_id,language,shot_number" }
      );

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
        language: lang,
      },
    });

    return NextResponse.json({ kicked: results.length, model, language: lang, results });
  } catch (err) {
    return safeError(err, "Failed to kick off video clip generation");
  }
}
