// POST /api/quiz/[id]/apply-adaptation
// Writes an adapted quiz (data + settings) to the quizzes row.
// The client calls this after reviewing the diff from /adapt.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";
import type { QuizData, QuizSettings } from "@/types/quiz";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Resolve workspace
  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  // 2. Parse body
  const body = await req.json().catch(() => null) as {
    data?: QuizData;
    settings?: QuizSettings;
  } | null;

  if (!body || !body.data || !body.settings) {
    return NextResponse.json(
      { error: "data and settings are required" },
      { status: 400 }
    );
  }

  // Light structural validation
  if (!body.data.nodes || typeof body.data.nodes !== "object") {
    return NextResponse.json({ error: "data.nodes is missing or invalid" }, { status: 400 });
  }
  if (!body.data.edges || typeof body.data.edges !== "object") {
    return NextResponse.json({ error: "data.edges is missing or invalid" }, { status: 400 });
  }

  // 3. Write to DB (workspace-scoped PATCH via the standard quiz update path)
  const db = createServerSupabase();
  const { data: updated, error } = await db
    .from("quizzes")
    .update({
      data: body.data,
      settings: body.settings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id, updated_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }
    return safeError(error, "Failed to apply adaptation");
  }

  return NextResponse.json({ ok: true, id: (updated as { id: string }).id });
}
