import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import type { AutoPipelineConceptStatus } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/pipeline/concepts?status=pending_review&limit=20
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as AutoPipelineConceptStatus | null;
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const supabase = createServerSupabase();

    let query = supabase
      .from("pipeline_concepts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[concepts] Fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch concepts" }, { status: 500 });
    }

    return NextResponse.json({ concepts: data });
  } catch (error) {
    console.error("[concepts] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
