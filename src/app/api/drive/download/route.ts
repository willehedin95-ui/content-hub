import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { downloadDriveFile } from "@/lib/google-drive";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { fileId, fileName, jobId } = (await req.json()) as {
    fileId: string;
    fileName: string;
    jobId: string;
  };

  if (!fileId || !jobId) {
    return NextResponse.json({ error: "fileId and jobId are required" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Verify job exists
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select("id, target_languages")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  try {
    // Download from Google Drive
    const buffer = await downloadDriveFile(fileId);

    // Upload to Supabase Storage
    const ext = fileName?.split(".").pop() || "png";
    const filePath = `image-jobs/${jobId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await db.storage
      .from("translated-images")
      .upload(filePath, buffer, {
        contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = db.storage.from("translated-images").getPublicUrl(filePath);

    // Create source_image record
    const { data: sourceImage, error: siError } = await db
      .from("source_images")
      .insert({
        job_id: jobId,
        original_url: urlData.publicUrl,
        filename: fileName || `${fileId}.png`,
      })
      .select()
      .single();

    if (siError || !sourceImage) {
      throw new Error(siError?.message ?? "Failed to create source image");
    }

    // Create image_translations for each target language
    const translationRows = job.target_languages.map((lang: string) => ({
      source_image_id: sourceImage.id,
      language: lang,
      status: "pending",
    }));

    await db.from("image_translations").insert(translationRows);

    return NextResponse.json(sourceImage);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 500 }
    );
  }
}
