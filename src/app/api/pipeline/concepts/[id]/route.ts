import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// GET /api/pipeline/concepts/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createServerSupabase();
    const workspaceId = await getWorkspaceId();

    const { data, error } = await supabase
      .from("pipeline_concepts")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Concept not found" }, { status: 404 });
    }

    // Verify workspace access through product
    if (data.product) {
      const { data: product } = await supabase
        .from("products")
        .select("id")
        .eq("slug", data.product)
        .eq("workspace_id", workspaceId)
        .single();
      if (!product) {
        return NextResponse.json({ error: "Concept not found" }, { status: 404 });
      }
    }

    return NextResponse.json({ concept: data });
  } catch (error) {
    console.error("[concept-detail] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
