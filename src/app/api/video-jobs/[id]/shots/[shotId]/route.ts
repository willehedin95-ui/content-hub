import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

const ALLOWED_FIELDS = ["shot_description", "veo_prompt"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const { id, shotId } = await params;
  const body = await req.json().catch(() => ({}));

  // Only allow updating specific fields
  const updates: Record<string, string> = {};
  for (const field of ALLOWED_FIELDS) {
    if (typeof body[field] === "string") {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Verify shot belongs to this job
  const workspaceId = await getWorkspaceId();

  // Verify video job belongs to workspace
  const { data: jobCheck, error: jobCheckError } = await db
    .from("video_jobs")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (jobCheckError || !jobCheck) {
    return safeError(jobCheckError, "Video job not found", 404);
  }

  const { data: shot, error: shotError } = await db
    .from("video_shots")
    .select("id")
    .eq("id", shotId)
    .eq("video_job_id", id)
    .single();

  if (shotError || !shot) return safeError(shotError, "Shot not found", 404);

  const { error: updateError } = await db
    .from("video_shots")
    .update(updates)
    .eq("id", shotId);

  if (updateError) return safeError(updateError, "Failed to update shot");

  return NextResponse.json({ ok: true, updated: Object.keys(updates) });
}
