import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { STORAGE_BUCKET } from "@/lib/constants";
import { isValidUUID } from "@/lib/validation";
import { getWorkspaceId } from "@/lib/workspace";

// DELETE /api/source-images/[id] — delete a source image and its translations + storage files
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Look up the source image to find its job_id (needed for storage path)
  const { data: si, error: fetchErr } = await db
    .from("source_images")
    .select("id, job_id, image_translations(id)")
    .eq("id", id)
    .single();

  if (fetchErr || !si) {
    return NextResponse.json({ error: "Source image not found" }, { status: 404 });
  }

  // Verify parent image_job belongs to workspace
  const { data: jobCheck } = await db.from("image_jobs").select("id").eq("id", si.job_id).eq("workspace_id", workspaceId).single();
  if (!jobCheck) return NextResponse.json({ error: "Source image not found" }, { status: 404 });

  // Clean up storage files for each translation: image-jobs/{jobId}/{translationId}/*
  const translationIds = (si.image_translations ?? []).map((t: { id: string }) => t.id);
  for (const tId of translationIds) {
    const prefix = `image-jobs/${si.job_id}/${tId}`;
    const { data: files } = await db.storage.from(STORAGE_BUCKET).list(prefix);
    if (files?.length) {
      await db.storage.from(STORAGE_BUCKET).remove(files.map((f) => `${prefix}/${f.name}`));
    }
  }

  // Delete the source image (CASCADE handles image_translations)
  const { error } = await db.from("source_images").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
