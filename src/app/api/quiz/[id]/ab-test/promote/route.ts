// POST /api/quiz/[id]/ab-test/promote  body: { winner: "a" | "b" }
// End the test by promoting a winner. Variant A keeps its URL/ad set either way:
//   winner "a" - just unlink B (A already serves A's spec).
//   winner "b" - copy B's spec into A, then unlink, so A's URL now serves B.
// The page still shows both until you Republish (returned as needs_republish).
// Variant B is left as a standalone draft quiz (not deleted).

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";
import { resolveExperiment } from "@/lib/ab-test";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { winner?: string } | null;
  const winner = body?.winner;
  if (winner !== "a" && winner !== "b") {
    return NextResponse.json({ error: "winner must be 'a' or 'b'" }, { status: 400 });
  }

  const db = createServerSupabase();
  const exp = await resolveExperiment(db, workspaceId, id);
  if (!exp) return NextResponse.json({ error: "Not an A/B test" }, { status: 404 });

  // If B wins, copy its spec into A so A's published URL serves the winner.
  if (winner === "b") {
    const { data: variantB, error: bErr } = await db
      .from("quizzes")
      .select("data, settings")
      .eq("id", exp.variantId)
      .maybeSingle();
    if (bErr || !variantB) return safeError(bErr, "Failed to load Variant B");
    const { error: copyErr } = await db
      .from("quizzes")
      .update({ data: variantB.data, settings: variantB.settings, updated_at: new Date().toISOString() })
      .eq("id", exp.ownerId)
      .eq("workspace_id", workspaceId);
    if (copyErr) return safeError(copyErr, "Failed to promote Variant B");
  }

  // Unlink - the test is over.
  const { error: unlinkErr } = await db
    .from("quizzes")
    .update({ ab_variant_quiz_id: null })
    .eq("id", exp.ownerId)
    .eq("workspace_id", workspaceId);
  if (unlinkErr) return safeError(unlinkErr, "Failed to end test");

  return NextResponse.json({ ok: true, winner, owner_id: exp.ownerId, needs_republish: true });
}
