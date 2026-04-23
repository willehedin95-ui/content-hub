// POST /api/quiz/[id]/publish
// Publishes a quiz to Cloudflare Pages.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";
import { publishQuiz } from "@/lib/quiz-publish";

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
    .select("id, workspace_id, status")
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

  try {
    const result = await publishQuiz(id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[quiz/publish] error:", err);
    return safeError(err as Error, "Publish failed");
  }
}
