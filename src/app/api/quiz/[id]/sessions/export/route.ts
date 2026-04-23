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

  // Load all sessions for this quiz
  const { data: sessions, error: sessErr } = await db
    .from("quiz_sessions")
    .select("*")
    .eq("quiz_id", id)
    .order("started_at", { ascending: false });

  if (sessErr) return safeError(sessErr, "Failed to export sessions");

  // Collect unique question element IDs from answers across all sessions
  const allQuestionIds = new Set<string>();
  for (const session of sessions ?? []) {
    const answers = session.answers as Record<string, string[]> | null;
    if (answers) {
      for (const qId of Object.keys(answers)) {
        allQuestionIds.add(qId);
      }
    }
  }
  const questionIds = [...allQuestionIds].sort();

  // Build CSV
  const headerFixed = [
    "session_id",
    "started_at",
    "completed_at",
    "status",
    "time_sec",
    "device",
    "market",
    "utm_source",
    "utm_campaign",
    "email",
  ];
  const headerQuestions = questionIds.map((qId) => `answer_${qId}`);
  const header = [...headerFixed, ...headerQuestions];

  const lines: string[] = [header.join(",")];

  for (const session of sessions ?? []) {
    const answers = session.answers as Record<string, string[]> | null;
    const utm = session.utm as Record<string, string> | null;
    const status = session.exit_clicked ? "completed" : "abandoned";
    const timeSec =
      session.completed_at && session.started_at
        ? Math.round(
            (new Date(session.completed_at).getTime() -
              new Date(session.started_at).getTime()) /
              1000,
          )
        : "";

    const answerCols = questionIds.map((qId) => {
      const val = answers?.[qId];
      return Array.isArray(val) ? val.join("|") : (val ?? "");
    });

    lines.push(
      csvRow([
        session.id,
        session.started_at,
        session.completed_at ?? "",
        status,
        timeSec,
        session.device_type ?? "",
        session.market ?? "",
        utm?.utm_source ?? utm?.source ?? "",
        utm?.utm_campaign ?? utm?.campaign ?? "",
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
