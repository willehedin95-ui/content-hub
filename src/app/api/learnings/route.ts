import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const params = req.nextUrl.searchParams;

  const product = params.get("product");
  const market = params.get("market");
  const outcome = params.get("outcome");
  const angle = params.get("angle");
  const awareness = params.get("awareness_level");
  const limit = Number(params.get("limit") ?? "100");

  let query = db
    .from("concept_learnings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (product) query = query.eq("product", product);
  if (market) query = query.eq("market", market);
  if (outcome) query = query.eq("outcome", outcome);
  if (angle) query = query.eq("angle", angle);
  if (awareness) query = query.eq("awareness_level", awareness);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const learnings = data ?? [];
  const patterns: Record<string, { wins: number; losses: number }> = {};

  for (const l of learnings) {
    if (l.angle) {
      patterns[`angle:${l.angle}`] ??= { wins: 0, losses: 0 };
      patterns[`angle:${l.angle}`][l.outcome === "winner" ? "wins" : "losses"]++;
    }
    if (l.awareness_level) {
      patterns[`awareness:${l.awareness_level}`] ??= { wins: 0, losses: 0 };
      patterns[`awareness:${l.awareness_level}`][l.outcome === "winner" ? "wins" : "losses"]++;
    }
    if (l.style) {
      patterns[`style:${l.style}`] ??= { wins: 0, losses: 0 };
      patterns[`style:${l.style}`][l.outcome === "winner" ? "wins" : "losses"]++;
    }
  }

  return NextResponse.json({ learnings, patterns });
}
