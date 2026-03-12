import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { getWorkspaceId } from "@/lib/workspace";

// PATCH /api/source-images/[id]/skip — toggle skip_translation
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const skip = Boolean(body.skip);

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Verify parent image_job belongs to workspace
  const { data: si } = await db.from("source_images").select("job_id").eq("id", id).single();
  if (!si) return NextResponse.json({ error: "Source image not found" }, { status: 404 });
  const { data: jobCheck } = await db.from("image_jobs").select("id").eq("id", si.job_id).eq("workspace_id", workspaceId).single();
  if (!jobCheck) return NextResponse.json({ error: "Source image not found" }, { status: 404 });

  const { error } = await db
    .from("source_images")
    .update({ skip_translation: skip })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, skip_translation: skip });
}
