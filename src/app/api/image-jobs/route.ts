import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { ImageJob, SourceImage } from "@/types";

export const maxDuration = 60;

function computeCounts(job: ImageJob & { source_images: SourceImage[] }) {
  const allTranslations = job.source_images?.flatMap(
    (si) => si.image_translations ?? []
  ) ?? [];
  return {
    ...job,
    total_images: job.source_images?.length ?? 0,
    total_translations: allTranslations.length,
    completed_translations: allTranslations.filter((t) => t.status === "completed").length,
    failed_translations: allTranslations.filter((t) => t.status === "failed").length,
  };
}

export async function GET() {
  const db = createServerSupabase();

  const { data: jobs, error } = await db
    .from("image_jobs")
    .select(`*, source_images(*, image_translations(*))`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = (jobs ?? []).map(computeCounts);
  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const name = formData.get("name") as string | null;
  const targetLanguagesRaw = formData.get("target_languages") as string | null;
  const images = formData.getAll("images") as File[];

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!targetLanguagesRaw) {
    return NextResponse.json({ error: "Target languages required" }, { status: 400 });
  }
  if (images.length === 0) {
    return NextResponse.json({ error: "At least one image is required" }, { status: 400 });
  }

  const targetLanguages: string[] = JSON.parse(targetLanguagesRaw);
  const db = createServerSupabase();

  // 1. Create the job
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .insert({
      name: name.trim(),
      status: "processing",
      target_languages: targetLanguages,
    })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message ?? "Failed to create job" }, { status: 500 });
  }

  // 2. Upload each image to Supabase Storage and create source_images records
  const sourceImageRows: Array<{ id?: string; job_id: string; original_url: string; filename: string }> = [];

  for (const file of images) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "png";
    const filePath = `image-jobs/${job.id}/${crypto.randomUUID()}.${ext}`;

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

    sourceImageRows.push({
      job_id: job.id,
      original_url: urlData.publicUrl,
      filename: file.name,
    });
  }

  // 3. Insert source_images
  const { data: sourceImages, error: siError } = await db
    .from("source_images")
    .insert(sourceImageRows)
    .select();

  if (siError || !sourceImages) {
    return NextResponse.json({ error: siError?.message ?? "Failed to create source images" }, { status: 500 });
  }

  // 4. Create image_translations for each source_image x language
  const translationRows = sourceImages.flatMap((si) =>
    targetLanguages.map((lang) => ({
      source_image_id: si.id,
      language: lang,
      status: "pending",
    }))
  );

  const { error: itError } = await db
    .from("image_translations")
    .insert(translationRows);

  if (itError) {
    return NextResponse.json({ error: itError.message }, { status: 500 });
  }

  // 5. Return the full job with all nested data
  const { data: fullJob } = await db
    .from("image_jobs")
    .select(`*, source_images(*, image_translations(*))`)
    .eq("id", job.id)
    .single();

  return NextResponse.json(fullJob ? computeCounts(fullJob) : job);
}
