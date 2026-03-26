import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { runPageSpeedCheck } from "@/lib/pagespeed";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  const { url, strategy } = (await req.json()) as {
    url: string;
    strategy: "mobile" | "desktop";
  };

  if (!url || !strategy) {
    return NextResponse.json(
      { error: "url and strategy are required" },
      { status: 400 }
    );
  }

  try {
    const result = await runPageSpeedCheck(url, strategy);
    const db = createServerSupabase();

    const { data, error } = await db
      .from("pagespeed_results")
      .insert({
        workspace_id: workspaceId,
        url,
        strategy,
        performance_score: result.performance_score / 100,
        lcp_ms: result.lcp_ms,
        fcp_ms: result.fcp_ms,
        cls: result.cls,
        tbt_ms: result.tbt_ms,
        si_ms: result.si_ms,
        ttfb_ms: result.ttfb_ms,
        opportunities: result.opportunities,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      result: {
        ...data,
        performance_score: result.performance_score, // return as 0-100 for display
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
