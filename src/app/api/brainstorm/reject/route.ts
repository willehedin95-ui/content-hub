import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

// POST /api/brainstorm/reject — Store a rejected concept for future avoidance
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { product, angle, awareness_level, concept_description, reason } = body;

  if (!product) {
    return NextResponse.json({ error: "product is required" }, { status: 400 });
  }

  if (!concept_description && !angle) {
    return NextResponse.json(
      { error: "At least angle or concept_description is required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { error } = await db.from("rejected_concepts").insert({
    product,
    angle: angle ?? null,
    awareness_level: awareness_level ?? null,
    concept_description: concept_description ?? null,
    reason: reason ?? null,
    workspace_id: workspaceId,
  });

  if (error) {
    return safeError(error, "Failed to save rejected concept");
  }

  return NextResponse.json({ success: true });
}
