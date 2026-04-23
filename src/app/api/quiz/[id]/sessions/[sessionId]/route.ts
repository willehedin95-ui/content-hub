import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id, sessionId } = await params;

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

  // Fetch session (must belong to this quiz)
  const [sessionRes, eventsRes] = await Promise.all([
    db
      .from("quiz_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("quiz_id", id)
      .single(),
    db
      .from("quiz_events")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  ]);

  if (sessionRes.error) {
    if (sessionRes.error.code === "PGRST116") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return safeError(sessionRes.error, "Failed to load session");
  }

  if (eventsRes.error) return safeError(eventsRes.error, "Failed to load events");

  return NextResponse.json({
    session: sessionRes.data,
    events: eventsRes.data ?? [],
  });
}
