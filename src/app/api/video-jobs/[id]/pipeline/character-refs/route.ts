import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createImageTask, pollTaskResult } from "@/lib/kie";
import { safeError } from "@/lib/api-error";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 180;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);
  if (!job.character_description) {
    return NextResponse.json({ error: "No character description on this job" }, { status: 400 });
  }

  await db.from("video_jobs").update({ character_ref_status: "generating" }).eq("id", id);

  try {
    // Three-view character reference sheet (VEO Studio approach):
    // Front view, 3/4 view, and side profile on clean white background.
    // Gives the image generator maximum visual information for character consistency.
    const isPixar = job.format_type === "pixar_animation";
    const prompt = isPixar
      ? `Generate a single reference sheet showing ONLY this one character: ${job.character_description}.

Three-view layout on a clean solid white background:
- LEFT: Front view, facing camera directly
- CENTER: 3/4 angle view, slight turn
- RIGHT: Side profile view

Requirements:
- Show ONLY this single character, nothing else
- Clean, simple white or light gray background
- Consistent proportions and appearance across all three views
- Pixar-style 3D animated aesthetic with expressive oversized eyes
- Smooth glossy materials, soft rounded features
- No other characters, objects, or text in the image
- Stylized 3D animation style, NOT photorealistic`
      : `Generate a single reference sheet showing ONLY this one character: ${job.character_description}.

Three-view layout on a clean solid white background:
- LEFT: Front view, facing camera directly, neutral expression
- CENTER: 3/4 angle view, slight head turn
- RIGHT: Side profile view

Requirements:
- Show ONLY this single character, nothing else
- Clean, simple white or light gray background
- Consistent proportions and appearance across all three views
- Real skin texture with visible pores, natural imperfections
- Natural casual clothing as described
- No other characters, objects, or text in the image
- Photorealistic style, NOT stylized or artistic`;

    // Generate 1 comprehensive three-view reference sheet
    // (more useful than 2 separate portraits — gives front/side/back in one image)
    const refUrls: string[] = [];
    for (let i = 0; i < 1; i++) {
      const taskId = await createImageTask(prompt, [], "16:9", "1K");
      const result = await pollTaskResult(taskId);

      if (result.urls.length > 0) {
        // Download and upload to storage
        const imgResponse = await fetch(result.urls[0]);
        if (!imgResponse.ok) throw new Error(`Failed to download ref image ${i}`);
        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());

        const storagePath = `${job.product}/${id}/char-ref-${i}.png`;
        const { error: uploadError } = await db.storage
          .from(VIDEO_STORAGE_BUCKET)
          .upload(storagePath, imgBuffer, { contentType: "image/png", upsert: true });

        if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

        const { data: publicUrl } = db.storage.from(VIDEO_STORAGE_BUCKET).getPublicUrl(storagePath);
        refUrls.push(publicUrl.publicUrl);
      }
    }

    await db.from("video_jobs").update({
      character_ref_urls: refUrls,
      character_ref_status: "completed",
    }).eq("id", id);

    await db.from("usage_logs").insert({
      type: "video_character_ref",
      model: "nano-banana-2",
      cost_usd: 0,
      metadata: { video_job_id: id, ref_count: refUrls.length },
    });

    return NextResponse.json({ character_ref_urls: refUrls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db.from("video_jobs").update({ character_ref_status: "failed" }).eq("id", id);
    return safeError(err, `Character ref generation failed: ${message}`);
  }
}
