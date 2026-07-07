// POST /api/quiz/[id]/publish
// Publishes a quiz to Cloudflare Pages.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";
import { publishQuiz } from "@/lib/quiz-publish";
import { validateQuizForPublish } from "@/lib/quiz-graph";
import type { QuizData } from "@/types/quiz";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const { id } = await params;

  // Verify the quiz belongs to this workspace
  const db = createServerSupabase();
  const { data: quiz, error: fetchErr } = await db
    .from("quizzes")
    .select("id, workspace_id, status, data")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchErr || !quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  if (quiz.status === "archived") {
    return NextResponse.json(
      { error: "Cannot publish an archived quiz" },
      { status: 400 },
    );
  }

  // Graph validation gate. Blocks NEW publishes of broken graphs (steps with
  // no outgoing edges, edges to deleted nodes, unreachable exits, bad variant
  // splits, image_cards without images). An already published quiz keeps
  // serving its last good deploy - we only abort here, before any CF upload.
  const problems = validateQuizForPublish(quiz.data as QuizData);
  if (problems.length > 0) {
    return NextResponse.json(
      { error: "Quiz graph failed validation", problems },
      { status: 422 },
    );
  }

  try {
    const result = await publishQuiz(id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[quiz/publish] error:", err);
    return safeError(err as Error, "Publish failed");
  }
}
