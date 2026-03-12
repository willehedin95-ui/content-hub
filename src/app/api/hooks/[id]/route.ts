import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

// PATCH /api/hooks/[id] — update a hook
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  const allowed = [
    "hook_text",
    "hook_type",
    "product",
    "awareness_level",
    "angle",
    "tags",
    "status",
    "notes",
  ];

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("hook_library")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) return safeError(error, "Failed to update hook");

  return NextResponse.json(data);
}

// DELETE /api/hooks/[id] — delete a hook
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

  const { error } = await db.from("hook_library").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return safeError(error, "Failed to delete hook");

  return NextResponse.json({ success: true });
}
