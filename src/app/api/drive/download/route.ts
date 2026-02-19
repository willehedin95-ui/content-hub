import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { downloadDriveFile } from "@/lib/google-drive";
import { STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { fileId, fileName, jobId, skipTranslation } = (await req.json()) as {
    fileId: string;
    fileName: string;
    jobId: string;
    skipTranslation?: boolean;
  };

  if (!fileId || !jobId) {
    return NextResponse.json({ error: "fileId and jobId are required" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Verify job exists
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select("id, target_languages, target_ratios")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  try {
    // Download from Google Drive
    const buffer = await downloadDriveFile(fileId);

    // Upload to Supabase Storage
    const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
    const ext = (fileName?.split(".").pop() || "png").toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: png, jpg, jpeg, gif, webp" },
        { status: 400 }
      );
    }
    const filePath = `image-jobs/${jobId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, {
        contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

    // Create source_image record
    const { data: sourceImage, error: siError } = await db
      .from("source_images")
      .insert({
        job_id: jobId,
        original_url: urlData.publicUrl,
        filename: fileName || `${fileId}.png`,
        skip_translation: skipTranslation ?? false,
      })
      .select()
      .single();

    if (siError || !sourceImage) {
      throw new Error(siError?.message ?? "Failed to create source image");
    }

    return NextResponse.json(sourceImage);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 500 }
    );
  }
}
