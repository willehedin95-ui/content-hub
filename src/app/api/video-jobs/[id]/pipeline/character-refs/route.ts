import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createImageTask, pollTaskResult } from "@/lib/kie";
import { safeError } from "@/lib/api-error";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 180;

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
  if (!job.character_description) {
    return NextResponse.json({ error: "No character description on this job" }, { status: 400 });
  }

  await db.from("video_jobs").update({ character_ref_status: "generating" }).eq("id", id);

  try {
    const prompt = `Professional portrait photograph of ${job.character_description}. Clean neutral background. Multiple expressions. High quality, detailed, realistic. 9:16 vertical format.`;

    // Generate 2 character reference images
    const refUrls: string[] = [];
    for (let i = 0; i < 2; i++) {
      const taskId = await createImageTask(prompt, [], "2:3", "1K");
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
