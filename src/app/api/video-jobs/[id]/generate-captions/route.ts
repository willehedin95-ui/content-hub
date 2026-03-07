import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { generateCaptions, CaptionStyle } from "@/lib/captions";

export const maxDuration = 300; // caption pipeline can take several minutes

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { translationId, style } = body as {
    translationId?: string;
    style?: string;
  };

  // Validate inputs
  if (!translationId) {
    return NextResponse.json(
      { error: "translationId is required" },
      { status: 400 }
    );
  }

  if (!style || (style !== "highlight" && style !== "clean")) {
    return NextResponse.json(
      { error: 'style must be "highlight" or "clean"' },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // 1. Load video_translation and verify it belongs to this video job
  const { data: translation, error: translationError } = await db
    .from("video_translations")
    .select("*")
    .eq("id", translationId)
    .eq("video_job_id", id)
    .single();

  if (translationError || !translation) {
    return safeError(
      translationError,
      "Video translation not found or does not belong to this job",
      404
    );
  }

  // 2. Determine the video URL to use
  // Prefer the translation's own video_url; fall back to source video
  let videoUrl: string | null = translation.video_url;

  if (!videoUrl) {
    // Try to find a completed source video for this job
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

  try {
    // 3. Generate captions
    const { srtUrl, captionedVideoUrl } = await generateCaptions(
      videoUrl,
      translation.language,
      style as CaptionStyle
    );

    // 4. Update video_translations row
    const { error: updateError } = await db
      .from("video_translations")
      .update({
        caption_style: style,
        caption_srt_url: srtUrl,
        captioned_video_url: captionedVideoUrl,
      })
      .eq("id", translationId);

    if (updateError) {
      return safeError(updateError, "Failed to update translation with caption data");
    }

    // 5. Log usage
    await db.from("usage_logs").insert({
      type: "video_captions",
      model: "gladia-v2",
      cost_usd: 0, // Gladia costs tracked separately
      metadata: {
        video_job_id: id,
        translation_id: translationId,
        language: translation.language,
        caption_style: style,
      },
    });

    return NextResponse.json({
      success: true,
      srtUrl,
      captionedVideoUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generate-captions] Error:", message);
    return safeError(err, `Caption generation failed: ${message}`);
  }
}
