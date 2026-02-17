import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
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

  // Upload to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "png";
  const filePath = `image-jobs/${jobId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await db.storage
    .from("translated-images")
    .upload(filePath, buffer, {
      contentType: file.type || "image/png",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = db.storage.from("translated-images").getPublicUrl(filePath);

  // Create source_image record
  const { data: sourceImage, error: siError } = await db
    .from("source_images")
    .insert({
      job_id: jobId,
      original_url: urlData.publicUrl,
      filename: file.name,
    })
    .select()
    .single();

  if (siError || !sourceImage) {
    return NextResponse.json({ error: siError?.message ?? "Failed to create source image" }, { status: 500 });
  }

  // Create image_translations for each (language, ratio) combination
  const ratios: string[] = job.target_ratios?.length ? job.target_ratios : ["1:1"];
  const translationRows = job.target_languages.flatMap((lang: string) =>
    ratios.map((ratio: string) => ({
      source_image_id: sourceImage.id,
      language: lang,
      aspect_ratio: ratio,
      status: "pending",
    }))
  );

  const { error: itError } = await db
    .from("image_translations")
    .insert(translationRows);

  if (itError) {
    return NextResponse.json({ error: itError.message }, { status: 500 });
  }

  return NextResponse.json(sourceImage);
}
