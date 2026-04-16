import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const { data, error } = await db
    .from("video_jobs")
    .select("*, source_videos(*), video_translations(*), video_shots(*), video_clips(*)")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error) {
    return safeError(error, "Video job not found", 404);
  }

  return NextResponse.json(data);
}

const ALLOWED_PATCH_FIELDS = [
  "concept_name",
  "script",
  "sora_prompt",
  "character_description",
  "character_tag",
  "product_description",
  "duration_seconds",
  "target_languages",
  "status",
  "style_notes",
  "awareness_level",
  "hook_type",
  "script_structure",
  "format_type",
  "ad_copy_primary",
  "ad_copy_headline",
  "ad_copy_translations",
  "landing_page_url",
  "landing_page_id",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  // 2026-04-16: ad_copy_translations is handled separately via atomic JSONB
  // merge RPC to avoid clobbering concurrent writers (translate-copy endpoint,
  // user edits from another tab). See resilience-audit-2026-04-16.md.
  const adCopyTranslationsPatch = body.ad_copy_translations;
  for (const key of ALLOWED_PATCH_FIELDS) {
    if (key === "ad_copy_translations") continue;
    if (body[key] !== undefined) {
      updateData[key] = body[key];
    }
  }

  const hasRegularUpdates = Object.keys(updateData).length > 1; // more than just updated_at
  if (!hasRegularUpdates && adCopyTranslationsPatch === undefined) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  if (adCopyTranslationsPatch !== undefined) {
    const { error: mergeError } = await db.rpc("merge_video_ad_copy_translations", {
      p_job_id: id,
      p_patch: adCopyTranslationsPatch,
    });
    if (mergeError) {
      return safeError(mergeError, "Failed to update translations");
    }
  }

  if (hasRegularUpdates) {
    const { error: updateError } = await db
      .from("video_jobs")
      .update(updateData)
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    if (updateError) {
      return safeError(updateError, "Failed to update video job");
    }
  }

  // Return the fresh row with relations
  const { data, error } = await db
    .from("video_jobs")
    .select("*, source_videos(*), video_translations(*), video_shots(*), video_clips(*)")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error) {
    return safeError(error, "Failed to fetch updated video job");
  }

  return NextResponse.json(data);
}

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

  // Verify job exists and belongs to workspace
  const { data: job, error: fetchErr } = await db
    .from("video_jobs")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchErr || !job) {
    return safeError(fetchErr, "Video job not found", 404);
  }

  // Clear FK references that don't cascade
  await db.from("discovered_ads").update({ video_job_id: null }).eq("video_job_id", id);
  await db.from("meta_campaigns").update({ video_job_id: null }).eq("video_job_id", id);

  // Delete the job (source_videos, video_shots, video_clips, video_translations cascade)
  const { error } = await db.from("video_jobs").delete().eq("id", id);

  if (error) {
    return safeError(error, "Failed to delete video job");
  }

  return NextResponse.json({ success: true });
}
