import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { generateVideo } from "@/lib/kie";
import { safeError } from "@/lib/api-error";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // 1. Fetch job + pending translations
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*, video_translations(*)")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  const pending = (job.video_translations || []).filter(
    (t: { status: string; translated_sora_prompt: string | null }) =>
      t.status === "pending" && t.translated_sora_prompt
  );

  if (pending.length === 0) {
    return NextResponse.json({ message: "No pending translations to generate" });
  }

  const results: Array<{ language: string; status: string; video_url?: string }> = [];

  // 2. Generate sequentially (rate limit safety)
  for (const translation of pending) {
    await db
      .from("video_translations")
      .update({ status: "generating" })
      .eq("id", translation.id);

    try {
      const result = await generateVideo(translation.translated_sora_prompt, {
        seconds: String(job.duration_seconds || 12),
      });

      if (!result.urls.length) throw new Error("No video URLs returned");

      // Download and upload to storage
      const videoResponse = await fetch(result.urls[0]);
      if (!videoResponse.ok) throw new Error(`Download failed: ${videoResponse.status}`);
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

      const storagePath = `${job.product}/${id}/${translation.language}.mp4`;
      await db.storage.from(VIDEO_STORAGE_BUCKET).upload(storagePath, videoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

      const { data: publicUrl } = db.storage
        .from(VIDEO_STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      await db
        .from("video_translations")
        .update({
          status: "completed",
          video_url: publicUrl.publicUrl,
          kie_task_id: result.taskId,
        })
        .eq("id", translation.id);

      results.push({ language: translation.language, status: "completed", video_url: publicUrl.publicUrl });

      // Rate limit: 2s delay between generations
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await db
        .from("video_translations")
        .update({ status: "failed", error_message: message })
        .eq("id", translation.id);

      results.push({ language: translation.language, status: "failed" });
    }
  }

  // 3. Check if all translations are done
  const { data: allTranslations } = await db
    .from("video_translations")
    .select("status")
    .eq("video_job_id", id);

  const allDone = (allTranslations || []).every(
    (t: { status: string }) => t.status === "completed" || t.status === "failed"
  );

  if (allDone) {
    await db.from("video_jobs").update({ status: "translated" }).eq("id", id);
  }

  return NextResponse.json({ results });
}
