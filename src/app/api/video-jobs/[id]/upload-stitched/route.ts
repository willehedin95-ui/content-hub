import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Verify job exists
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("product")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file)
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${job.product}/${id}/stitched.mp4`;

  const { error: uploadError } = await db.storage
    .from(VIDEO_STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (uploadError) return safeError(uploadError, "Storage upload failed");

  const { data: publicUrl } = db.storage
    .from(VIDEO_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  // Update job status
  await db
    .from("video_jobs")
    .update({ status: "generated" })
    .eq("id", id);

  return NextResponse.json({ video_url: publicUrl.publicUrl });
}
