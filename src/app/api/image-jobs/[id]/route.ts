import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  let { data: job, error } = await db
    .from("image_jobs")
    .select(`*, source_images(*, image_translations(*, versions(*)))`)
    .eq("id", id)
    .single();

  // Fall back to query without versions if table doesn't exist yet
  if (error && error.message?.includes("versions")) {
    const fallback = await db
      .from("image_jobs")
      .select(`*, source_images(*, image_translations(*))`)
      .eq("id", id)
      .single();
    job = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  // Compute aggregated counts
  const allTranslations = job.source_images?.flatMap(
    (si: { image_translations?: { status: string }[] }) => si.image_translations ?? []
  ) ?? [];

  return NextResponse.json({
    ...job,
    total_images: job.source_images?.length ?? 0,
    total_translations: allTranslations.length,
    completed_translations: allTranslations.filter((t: { status: string }) => t.status === "completed").length,
    failed_translations: allTranslations.filter((t: { status: string }) => t.status === "failed").length,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { status } = body as { status?: string };

  const db = createServerSupabase();

  const { data, error } = await db
    .from("image_jobs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Clean up storage files
  const { data: files } = await db.storage
    .from("translated-images")
    .list(`image-jobs/${id}`);

  if (files?.length) {
    await db.storage
      .from("translated-images")
      .remove(files.map((f) => `image-jobs/${id}/${f.name}`));
  }

  // Delete job (CASCADE handles source_images and image_translations)
  const { error } = await db.from("image_jobs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
