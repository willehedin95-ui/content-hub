import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Verify quiz belongs to this workspace
  const { data: quiz, error: quizErr } = await db
    .from("quizzes")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (quizErr || !quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  // Count before deletion for the response
  const [sessCountRes, evtCountRes] = await Promise.all([
    db
      .from("quiz_sessions")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", id),
    db
      .from("quiz_events")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", id),
  ]);

  const deletedSessions = sessCountRes.count ?? 0;
  const deletedEvents = evtCountRes.count ?? 0;

  // Delete events first (foreign key references sessions)
  const { error: evtDelErr } = await db
    .from("quiz_events")
    .delete()
    .eq("quiz_id", id);

  if (evtDelErr) return safeError(evtDelErr, "Failed to delete events");

  const { error: sessDelErr } = await db
    .from("quiz_sessions")
    .delete()
    .eq("quiz_id", id);

  if (sessDelErr) return safeError(sessDelErr, "Failed to delete sessions");

  return NextResponse.json({ deleted_sessions: deletedSessions, deleted_events: deletedEvents });
}
