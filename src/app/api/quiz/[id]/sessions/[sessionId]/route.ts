// GET /api/quiz/[id]/sessions/[sessionId]
//
// Returns a single session's full event timeline with resolved step names
// and option labels (so the drawer renders human-readable answers, not
// raw step_*/opt_* IDs). Also computes an `answers` map keyed by the
// question variable for quick scanning.

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

  const { data: quiz, error: quizErr } = await db
    .from("quizzes")
    .select("id, data")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (quizErr || !quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const [sessionRes, eventsRes] = await Promise.all([
    db.from("quiz_sessions").select("*").eq("id", sessionId).eq("quiz_id", id).single(),
    db.from("quiz_events").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
  ]);

  if (sessionRes.error) {
    if (sessionRes.error.code === "PGRST116") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return safeError(sessionRes.error, "Failed to load session");
  }
  if (eventsRes.error) return safeError(eventsRes.error, "Failed to load events");

  // Resolve labels from current quiz_data
  type QuizNode = {
    kind: string;
    id: string;
    name?: string;
    subEls?: Array<{
      kind: string;
      variable?: string;
      options?: Array<{ id: string; label: string; value?: string }>;
    }>;
  };
  const nodes: Record<string, QuizNode> = (quiz.data as { nodes?: Record<string, QuizNode> } | null)?.nodes ?? {};
  const stepNames = new Map<string, string>();
  const optionMeta = new Map<string, { variable: string; label: string }>();
  for (const n of Object.values(nodes)) {
    if (n.kind !== "step") continue;
    if (n.name) stepNames.set(n.id, n.name);
    for (const el of n.subEls ?? []) {
      if (el.kind !== "question") continue;
      for (const o of el.options ?? []) {
        if (el.variable) optionMeta.set(o.id, { variable: el.variable, label: o.label });
      }
    }
  }

  // Enrich events
  type RawEvent = {
    id: number;
    event_type: string;
    step_id: string | null;
    option_id: string | null;
    created_at: string;
    meta: Record<string, unknown> | null;
  };
  const events = (eventsRes.data as RawEvent[]) ?? [];
  const enrichedEvents = events.map((e) => ({
    ...e,
    step_name: e.step_id ? stepNames.get(e.step_id) ?? null : null,
    option_label: e.option_id ? optionMeta.get(e.option_id)?.label ?? null : null,
    option_variable: e.option_id ? optionMeta.get(e.option_id)?.variable ?? null : null,
  }));

  // Build answers map keyed by variable
  const answers: Record<string, string[]> = {};
  for (const e of events) {
    if (e.event_type !== "answer" || !e.option_id) continue;
    // Skip commit-gate clicks - they're not survey answers
    const src = (e.meta as { source?: string } | null)?.source ?? "";
    if (src.startsWith("commit_gate")) continue;
    const meta = optionMeta.get(e.option_id);
    if (!meta) continue;
    if (!answers[meta.variable]) answers[meta.variable] = [];
    if (!answers[meta.variable].includes(meta.label)) {
      answers[meta.variable].push(meta.label);
    }
  }

  return NextResponse.json({
    session: sessionRes.data,
    events: enrichedEvents,
    answers,
  });
}
