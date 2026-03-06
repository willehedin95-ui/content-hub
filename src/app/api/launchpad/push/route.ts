import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { pushConceptToMeta } from "@/lib/meta-push";

const MARKET_TO_LANG: Record<string, string> = { NO: "no", DK: "da", SE: "sv", DE: "de" };

export async function POST(req: NextRequest) {
  const { imageJobId, markets } = await req.json();
  if (!imageJobId) return NextResponse.json({ error: "imageJobId required" }, { status: 400 });

  const db = createServerSupabase();

  const languages = (markets ?? ["NO", "DK", "SE"])
    .map((m: string) => MARKET_TO_LANG[m])
    .filter(Boolean);

  const pushResult = await pushConceptToMeta(imageJobId, { languages });

  const now = new Date().toISOString();
  const { data: marketRows } = await db
    .from("image_job_markets")
    .select("id, market")
    .eq("image_job_id", imageJobId);

  for (const row of marketRows ?? []) {
    const lang = MARKET_TO_LANG[row.market];
    const langResult = pushResult.results.find((r) => r.language === lang);

    if (langResult?.status === "pushed") {
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
      .eq("id", imageJobId);
  }

  return NextResponse.json({ success: true, results: pushResult.results });
}
