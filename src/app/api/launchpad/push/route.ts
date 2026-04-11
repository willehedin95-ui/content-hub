import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { pushConceptToMeta } from "@/lib/meta-push";
import { pushVideoToMeta } from "@/lib/meta-video-push";

export const maxDuration = 800;

const MARKET_TO_LANG: Record<string, string> = { NO: "no", DK: "da", SE: "sv" };

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Support both new { conceptId, type } and legacy { imageJobId }
  const conceptId: string | undefined = body.conceptId ?? body.imageJobId;
  const type: "image" | "video" = body.type ?? "image";

  if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const languages = (body.markets ?? ["NO", "DK", "SE"])
    .map((m: string) => MARKET_TO_LANG[m])
    .filter(Boolean);

  if (type === "video") {
    // --- Video push ---
    const pushResult = await pushVideoToMeta(conceptId, { languages });

    // pushVideoToMeta already records in meta_campaigns + meta_ads and updates video_jobs.status.
    // If all languages were pushed successfully, clear launchpad_priority.
    // Clear push errors for successfully pushed markets
    const pushedVideoMarkets = pushResult.results.filter((r) => r.status === "pushed").map((r) => {
      const mkt = Object.entries(MARKET_TO_LANG).find(([, l]) => l === r.language)?.[0];
      return mkt;
    }).filter(Boolean);
    if (pushedVideoMarkets.length > 0) {
      const { data: vj } = await db.from("video_jobs").select("push_errors").eq("id", conceptId).single();
      const existingErrors = (vj?.push_errors ?? {}) as Record<string, unknown>;
      for (const mkt of pushedVideoMarkets) {
        if (mkt) delete existingErrors[mkt];
      }
      await db.from("video_jobs").update({ push_errors: Object.keys(existingErrors).length > 0 ? existingErrors : null }).eq("id", conceptId);
    }

    const allPushed = pushResult.results.length > 0 && pushResult.results.every((r) => r.status === "pushed");
    if (allPushed) {
      await db
        .from("video_jobs")
        .update({ launchpad_priority: null })
        .eq("id", conceptId)
        .eq("workspace_id", workspaceId);
    }

    return NextResponse.json({ success: true, results: pushResult.results });
  }

  // --- Image push (original logic) ---
  const pushResult = await pushConceptToMeta(conceptId, { languages });

  const now = new Date().toISOString();
  const { data: marketRows } = await db
    .from("image_job_markets")
    .select("id, market")
    .eq("image_job_id", conceptId);

  for (const row of marketRows ?? []) {
    const lang = MARKET_TO_LANG[row.market];
    const langResult = pushResult.results.find((r) => r.language === lang);

    if (langResult?.status === "pushed") {
      // Clear push error for this market
      await db.from("image_job_markets").update({ last_push_error: null, last_push_error_at: null }).eq("id", row.id);

      await db
        .from("concept_lifecycle")
        .update({ exited_at: now })
        .eq("image_job_market_id", row.id)
        .eq("stage", "launchpad")
        .is("exited_at", null);

      await db.from("concept_lifecycle").insert({
        image_job_market_id: row.id,
        stage: "testing",
        entered_at: now,
        signal: "manual_push",
      });
    }
  }

  // Clear from launch pad if all markets pushed
  const { data: remaining } = await db
    .from("concept_lifecycle")
    .select("stage")
    .in("image_job_market_id", (marketRows ?? []).map((m) => m.id))
    .eq("stage", "launchpad")
    .is("exited_at", null);

  if (!remaining || remaining.length === 0) {
    await db
      .from("image_jobs")
      .update({ launchpad_priority: null })
      .eq("id", conceptId)
      .eq("workspace_id", workspaceId);
  }

  return NextResponse.json({ success: true, results: pushResult.results });
}
