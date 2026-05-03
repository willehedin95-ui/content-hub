import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

/** Escape a CSV field: wrap in quotes if it contains comma, quote, or newline. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(fields: unknown[]): string {
  return fields.map(csvField).join(",");
}

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

  // Verify quiz belongs to this workspace + load quiz data for question labels
  const { data: quiz, error: quizErr } = await db
    .from("quizzes")
    .select("id, name, data")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (quizErr || !quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  // Load all sessions + answer events for this quiz
  const [sessionsRes, answersRes] = await Promise.all([
    db.from("quiz_sessions").select("*").eq("quiz_id", id).order("started_at", { ascending: false }),
    db.from("quiz_events").select("session_id, step_id, option_id, meta").eq("quiz_id", id).eq("event_type", "answer"),
  ]);

  if (sessionsRes.error) return safeError(sessionsRes.error, "Failed to export sessions");
  if (answersRes.error) return safeError(answersRes.error, "Failed to load answers");

  const sessions = sessionsRes.data ?? [];

  // Resolve option_id -> {variable, label} from quiz_data so we can name
  // the columns by question variable instead of raw IDs.
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
  const nodes: Record<string, QuizNode> =
    (quiz.data as { nodes?: Record<string, QuizNode> } | null)?.nodes ?? {};
  const optionMeta = new Map<string, { variable: string; label: string }>();
  // Order variables to match topological step order so CSV columns flow
  // naturally (gender, age, breed, name, ..., time_per_day).
  const variableOrder: string[] = [];
  for (const n of Object.values(nodes)) {
    if (n.kind !== "step") continue;
    for (const el of n.subEls ?? []) {
      if (el.kind !== "question" || !el.variable) continue;
      if (!variableOrder.includes(el.variable)) variableOrder.push(el.variable);
      for (const o of el.options ?? []) {
        optionMeta.set(o.id, { variable: el.variable, label: o.label });
      }
    }
  }

  // Group answer events by session -> variable -> picked labels (multi-select
  // sessions can pick multiple options, joined with `|` in the cell).
  const answersBySession = new Map<string, Record<string, string[]>>();
  for (const e of answersRes.data ?? []) {
    const src = (e.meta as { source?: string } | null)?.source ?? "";
    if (src.startsWith("commit_gate")) continue;
    const meta = optionMeta.get(e.option_id as string);
    if (!meta) continue;
    let bag = answersBySession.get(e.session_id as string);
    if (!bag) {
      bag = {};
      answersBySession.set(e.session_id as string, bag);
    }
    if (!bag[meta.variable]) bag[meta.variable] = [];
    if (!bag[meta.variable].includes(meta.label)) bag[meta.variable].push(meta.label);
  }

  // Build CSV
  const headerFixed = [
    "session_id",
    "started_at",
    "completed_at",
    "status",
    "purchased",
    "purchase_value",
    "time_sec",
    "device",
    "market",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "referrer",
    "email",
  ];
  const headerQuestions = variableOrder.map((v) => `q_${v}`);
  const header = [...headerFixed, ...headerQuestions];

  const lines: string[] = [header.join(",")];

  for (const session of sessions) {
    const utm = session.utm as Record<string, string> | null;
    const status = session.exit_clicked ? "completed" : "abandoned";
    const timeSec =
      session.completed_at && session.started_at
        ? Math.round(
            (new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) /
              1000,
          )
        : "";
    const bag = answersBySession.get(session.id) ?? {};
    const answerCols = variableOrder.map((v) => (bag[v] ? bag[v].join("|") : ""));

    lines.push(
      csvRow([
        session.id,
        session.started_at,
        session.completed_at ?? "",
        status,
        session.purchased ? "yes" : "no",
        session.purchase_value ?? "",
        timeSec,
        session.device_type ?? "",
        session.market ?? "",
        utm?.utm_source ?? "",
        utm?.utm_medium ?? "",
        utm?.utm_campaign ?? "",
        utm?.utm_content ?? "",
        utm?.utm_term ?? "",
        session.referrer ?? "",
        session.email ?? "",
        ...answerCols,
      ]),
    );
  }

  const csv = lines.join("\n");
  const filename = `quiz-${id.slice(0, 8)}-sessions.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
