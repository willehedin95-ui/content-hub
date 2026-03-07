import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("video_jobs")
    .select("*, source_videos(*), video_translations(*), video_shots(*)")
    .eq("id", id)
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
  "ab_test_id",
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

  for (const key of ALLOWED_PATCH_FIELDS) {
    if (body[key] !== undefined) {
      updateData[key] = body[key];
    }
  }

  // Only updated_at means no valid fields were provided
  if (Object.keys(updateData).length === 1) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("video_jobs")
    .update(updateData)
    .eq("id", id)
    .select("*, source_videos(*), video_translations(*), video_shots(*)")
    .single();

  if (error) {
    return safeError(error, "Failed to update video job");
  }

  return NextResponse.json(data);
}
