import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/pipeline/concepts/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("pipeline_concepts")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Concept not found" }, { status: 404 });
    }

    return NextResponse.json({ concept: data });
  } catch (error) {
    console.error("[concept-detail] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
