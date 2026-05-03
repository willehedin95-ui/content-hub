// GET /api/quiz/[id]/sessions
//
// Lists sessions for a quiz with inline answer summaries (gender, age,
// breed, primary_pain, time_per_day, severity). The summaries come from
// joining quiz_events to the current quiz_data option labels - we don't
// rely on the legacy sessions.answers JSONB which the runtime never
// populates. This makes the SessionsTable a research tool: scroll a list
// and see at a glance how each respondent answered the key questions.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

const PAGE_SIZE = 20;

// Variables we want to surface in the table inline (one column each).
// All optional - missing answers render as empty cell.
const SUMMARY_VARS = ["gender", "age", "breed", "primary_pain", "problem_duration", "time_per_day"] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Verify quiz belongs to this workspace + grab the quiz data so we can
  // resolve option_id -> label without a second roundtrip per session.
  const { data: quiz, error: quizErr } = await db
    .from("quizzes")
    .select("id, data")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (quizErr || !quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const url = req.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const status = url.searchParams.get("status") ?? "all"; // all | completed | abandoned | purchased
  // Optional cohort filter: ?filter_var=primary_pain&filter_val=koppeldragning
  const filterVar = url.searchParams.get("filter_var");
  const filterVal = url.searchParams.get("filter_val");

  let query = db
    .from("quiz_sessions")
    .select("*", { count: "exact" })
    .eq("quiz_id", id)
    .order("started_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status === "completed") {
    query = query.eq("exit_clicked", true);
  } else if (status === "abandoned") {
    query = query.eq("exit_clicked", false);
  } else if (status === "purchased") {
    query = query.eq("purchased", true);
  }

  const { data: rows, error, count } = await query;
  if (error) return safeError(error, "Failed to load sessions");

  const sessions = rows ?? [];
  const sessionIds = sessions.map((s) => s.id);

  // Resolve step_id + option_id -> {variable, label} from current quiz data.
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
  const optionMeta = new Map<string, { variable: string; label: string }>();
  // step_id -> variable (so we can map answer events to a variable)
  const stepVariable = new Map<string, string>();
  for (const n of Object.values(nodes)) {
    if (n.kind !== "step") continue;
    let stepVar = "";
    for (const el of n.subEls ?? []) {
      if (el.kind !== "question" || !el.variable) continue;
      stepVar = el.variable;
      for (const o of el.options ?? []) {
        optionMeta.set(o.id, { variable: el.variable, label: o.label });
      }
    }
    if (stepVar) stepVariable.set(n.id, stepVar);
  }

  // Fetch answer events for these sessions in one shot
  let answerMap: Map<string, Record<string, string[]>> = new Map();
  if (sessionIds.length) {
    const { data: events } = await db
      .from("quiz_events")
      .select("session_id, step_id, option_id, meta")
      .in("session_id", sessionIds)
      .eq("event_type", "answer");
    for (const e of events ?? []) {
      // Skip commit-gate events from answer summary
      const src = (e.meta as { source?: string } | null)?.source ?? "";
      if (src.startsWith("commit_gate")) continue;
      const m = optionMeta.get(e.option_id as string);
      if (!m) continue;
      let bag = answerMap.get(e.session_id as string);
      if (!bag) {
        bag = {};
        answerMap.set(e.session_id as string, bag);
      }
      if (!bag[m.variable]) bag[m.variable] = [];
      if (!bag[m.variable].includes(m.label)) bag[m.variable].push(m.label);
    }
  }

  // Optional cross-session filter (e.g. only sessions where
  // primary_pain=koppeldragning) - applied in JS since the answer
  // store is materialized server-side.
  let filtered = sessions;
  if (filterVar && filterVal) {
    filtered = sessions.filter((s) => {
      const bag = answerMap.get(s.id) ?? {};
      const picks = bag[filterVar] ?? [];
      return picks.some((p) => p.toLowerCase() === filterVal.toLowerCase());
    });
  }

  // Build the response: every session gets an `answers_summary` map
  // with {variable: [labels]} for the most-relevant questions.
  const enriched = filtered.map((s) => {
    const bag = answerMap.get(s.id) ?? {};
    const summary: Record<string, string[]> = {};
    for (const v of SUMMARY_VARS) {
      if (bag[v]) summary[v] = bag[v];
    }
    // Surface ALL captured answers too, for the SessionDrawer
    return { ...s, answers_summary: summary, answers_full: bag };
  });

  return NextResponse.json({
    sessions: enriched,
    total: filterVar && filterVal ? enriched.length : (count ?? 0),
    page,
    pageSize: PAGE_SIZE,
  });
}
