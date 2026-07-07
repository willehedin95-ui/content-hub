import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }
    return safeError(error, "Failed to fetch quiz");
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const body = await req.json();
  const allowed = ["name", "slug", "data", "settings", "status"] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  patch.updated_at = new Date().toISOString();

  // Optimistic lock (opt-in): when the client sends expected_updated_at,
  // the update only applies if the row hasn't been written since the client
  // last read it. Prevents autosave lost-update races between two editor
  // sessions. Clients not sending the field keep the old last-write-wins.
  const expectedUpdatedAt =
    typeof body.expected_updated_at === "string" && body.expected_updated_at
      ? body.expected_updated_at
      : null;

  const db = createServerSupabase();
  let query = db
    .from("quizzes")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (expectedUpdatedAt) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }
  const { data, error } = await query.select().maybeSingle();

  if (error) {
    return safeError(error, "Failed to update quiz");
  }

  if (!data) {
    // No row updated: either the quiz doesn't exist in this workspace, or
    // the optimistic lock failed. Distinguish so the client can react.
    if (expectedUpdatedAt) {
      const { data: exists } = await db
        .from("quizzes")
        .select("id")
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (exists) {
        return NextResponse.json(
          { error: "Conflict: quiz was modified by another session" },
          { status: 409 },
        );
      }
    }
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const db = createServerSupabase();
  const { error } = await db
    .from("quizzes")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return safeError(error, "Failed to archive quiz");
  return NextResponse.json({ ok: true });
}
