import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { generateCaptionsFromScript, ShotDialogue } from "@/lib/captions";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { translationId } = body as { translationId?: string };

  if (!translationId) {
    return NextResponse.json(
      { error: "translationId is required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // 1. Load video_translation + video_shots for this job
  const [{ data: translation, error: translationError }, { data: videoShots }] =
    await Promise.all([
      db
        .from("video_translations")
        .select("*")
        .eq("id", translationId)
        .eq("video_job_id", id)
        .single(),
      db
        .from("video_shots")
        .select("shot_number, shot_description, veo_prompt, video_duration_seconds")
        .eq("video_job_id", id)
        .order("shot_number", { ascending: true }),
    ]);

  if (translationError || !translation) {
    return safeError(
      translationError,
      "Video translation not found or does not belong to this job",
      404
    );
  }

  // 2. Determine the video URL
  let videoUrl: string | null = translation.video_url;
  if (!videoUrl) {
    const { data: sourceVideos } = await db
      .from("source_videos")
      .select("video_url")
      .eq("video_job_id", id)
      .eq("status", "completed")
      .limit(1);
    videoUrl = sourceVideos?.[0]?.video_url || null;
  }

  if (!videoUrl) {
    return NextResponse.json(
      { error: "No video URL available for captioning" },
      { status: 400 }
    );
  }

  // 3. Build shot dialogues from translated_shots (preferred) or original shots
  const translatedShots: Array<{
    shot_number: number;
    translated_dialogue: string;
  }> = translation.translated_shots ?? [];

  const shots: ShotDialogue[] = (videoShots ?? []).map((shot) => {
    // Use translated dialogue if available for this language
    const translated = translatedShots.find(
      (ts) => ts.shot_number === shot.shot_number
    );

    let dialogue = translated?.translated_dialogue || "";

    // Fallback: extract dialogue from veo_prompt (format: says: "dialogue here")
    if (!dialogue && shot.veo_prompt) {
      const match = shot.veo_prompt.match(/says:\s*"([^"]+)"/);
      dialogue = match?.[1] || "";
    }

    return {
      dialogue,
      durationSeconds: shot.video_duration_seconds || 5,
    };
  });

  if (shots.length === 0 || shots.every((s) => !s.dialogue.trim())) {
    return NextResponse.json(
      { error: "No dialogue found in shots for captioning" },
      { status: 400 }
    );
  }

  try {
    // 4. Generate captions from script
    const { captionedVideoUrl } = await generateCaptionsFromScript(
      videoUrl,
      shots,
    );

    // 5. Update video_translations row
    const { error: updateError } = await db
      .from("video_translations")
      .update({
        caption_style: "highlight",
        captioned_video_url: captionedVideoUrl,
      })
      .eq("id", translationId);

    if (updateError) {
      return safeError(updateError, "Failed to update translation with caption data");
    }

    // 6. Log usage (Whisper ~$0.006/min, estimate 30s video)
    await db.from("usage_logs").insert({
      type: "video_captions",
      model: "whisper-1",
      cost_usd: 0.003,
      metadata: {
        video_job_id: id,
        translation_id: translationId,
        language: translation.language,
        method: "whisper-timing",
      },
    });

    return NextResponse.json({
      success: true,
      captionedVideoUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generate-captions] Error:", message);
    return safeError(err, `Caption generation failed: ${message}`);
  }
}
