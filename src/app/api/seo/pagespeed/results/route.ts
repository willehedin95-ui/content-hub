import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();

  // Get latest result per (url, strategy) — uses DISTINCT ON
  const { data, error } = await db.rpc("pagespeed_latest", {
    ws_id: workspaceId,
  });

  if (error) {
    // Fallback: manual query if RPC doesn't exist yet
    const { data: fallback, error: fallbackErr } = await db
      .from("pagespeed_results")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("checked_at", { ascending: false })
      .limit(50);

    if (fallbackErr) {
      return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
    }

    // Deduplicate: keep latest per (url, strategy)
    const seen = new Set<string>();
    const latest = (fallback ?? []).filter((r) => {
      const key = `${r.url}:${r.strategy}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ results: latest });
  }

  return NextResponse.json({ results: data ?? [] });
}
