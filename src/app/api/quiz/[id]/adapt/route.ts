// POST /api/quiz/[id]/adapt
// Runs the AI adaptation layer on the quiz and returns the adapted data for review.
// Does NOT save — the client reviews the diff and calls /apply-adaptation to write it.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";
import { adaptQuiz } from "@/lib/quiz-adapt";
import type { QuizRow } from "@/types/quiz";

// Claude on a 20+ question quiz can take over 60s.
export const maxDuration = 180;

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
    productId?: string;
    userNotes?: string;
  } | null;

  if (!body || typeof body.productId !== "string" || !body.productId.trim()) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  const { productId, userNotes } = body;

  // 3. Fetch the quiz (workspace-scoped)
  const db = createServerSupabase();
  const { data: quizRow, error: quizError } = await db
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (quizError || !quizRow) {
    if (quizError?.code === "PGRST116") {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }
    return safeError(quizError ?? new Error("Quiz not found"), "Failed to fetch quiz");
  }

  const quiz = quizRow as QuizRow;

  // 4. Run adaptation
  try {
    const result = await adaptQuiz({
      data: quiz.data,
      settings: quiz.settings,
      productId,
      targetMarket: quiz.market,
      userNotes: userNotes ?? undefined,
    });

    return NextResponse.json({
      adaptedData: result.data,
      adaptedSettings: result.settings,
      changes: result.changes,
      warnings: result.warnings,
      usage: result.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quiz/adapt] Error:", message);
    return NextResponse.json(
      { error: `Adaptation failed: ${message}` },
      { status: 500 }
    );
  }
}
