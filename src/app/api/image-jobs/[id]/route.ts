import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { STORAGE_BUCKET } from "@/lib/constants";

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

  // Clean up storage files (nested: image-jobs/{id}/{translationId}/{file}.png)
  const { data: subfolders } = await db.storage
    .from(STORAGE_BUCKET)
    .list(`image-jobs/${id}`);

  const allPaths: string[] = [];
  for (const item of subfolders ?? []) {
    const prefix = `image-jobs/${id}/${item.name}`;
    if (!item.id) {
      // It's a folder — list its contents
      const { data: nested } = await db.storage
        .from(STORAGE_BUCKET)
        .list(prefix);
      for (const file of nested ?? []) {
        allPaths.push(`${prefix}/${file.name}`);
      }
    } else {
      // It's a file at this level
      allPaths.push(prefix);
    }
  }

  if (allPaths.length) {
    await db.storage.from(STORAGE_BUCKET).remove(allPaths);
  }

  // Delete job (CASCADE handles source_images and image_translations)
  const { error } = await db.from("image_jobs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
