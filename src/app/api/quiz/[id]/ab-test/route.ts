// POST   /api/quiz/[id]/ab-test  - turn a quiz into a whole-quiz A/B test:
//        duplicate it into "Variant B" and link the two (quizzes.ab_variant_quiz_id).
//        Variant B is a normal quiz row, edited in the builder like any other.
//        Publishing A bakes both specs into one page (runtime coin-flips 50/50).
// DELETE /api/quiz/[id]/ab-test  - end the test: unlink B (B is kept as its own quiz).
//
// Idempotent: POST when a link already exists returns the existing variant B.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const db = createServerSupabase();

  const { data: source, error: fetchError } = await db
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }
    return safeError(fetchError, "Failed to fetch quiz");
  }
  if (!source) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  // Already an experiment - return the existing variant B (idempotent).
  const existingBId = (source as { ab_variant_quiz_id?: string | null }).ab_variant_quiz_id;
  if (existingBId) {
    const { data: existingB } = await db
      .from("quizzes")
      .select("id, name, slug")
      .eq("id", existingBId)
      .maybeSingle();
    if (existingB) {
      return NextResponse.json({ variantB: existingB, created: false });
    }
    // Linked B was deleted out from under us - fall through and make a new one.
  }

  // Create variant B as an independent, editable copy.
  const tsSuffix = Date.now().toString(36).slice(-4);
  const { data: variantB, error: insertError } = await db
    .from("quizzes")
    .insert({
      workspace_id: workspaceId,
      market: source.market,
      slug: `${source.slug}-b-${tsSuffix}`,
      name: `${source.name} (Variant B)`,
      status: "draft",
      data: source.data,
      settings: source.settings,
      published_url: null,
      published_at: null,
    })
    .select("id, name, slug")
    .single();

  if (insertError) return safeError(insertError, "Failed to create variant B");

  // Link A -> B (50/50 by default).
  const { error: linkError } = await db
    .from("quizzes")
    .update({ ab_variant_quiz_id: variantB.id, ab_split_a: 50 })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (linkError) return safeError(linkError, "Failed to link variant B");

  return NextResponse.json({ variantB, created: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const db = createServerSupabase();
  const { error } = await db
    .from("quizzes")
    .update({ ab_variant_quiz_id: null })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return safeError(error, "Failed to end A/B test");
  return NextResponse.json({ ok: true });
}
