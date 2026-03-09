import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const market: string | undefined = body.market;

  // Support new format: { order: [{ conceptId, type }] } and legacy: { order: string[] }
  const order: Array<{ conceptId: string; type: "image" | "video" }> = Array.isArray(body.order)
    ? body.order.map((item: string | { conceptId: string; type: "image" | "video" }) =>
        typeof item === "string"
          ? { conceptId: item, type: "image" as const }
          : item
      )
    : [];

  if (order.length === 0) {
    return NextResponse.json({ error: "order array required" }, { status: 400 });
  }

  const db = createServerSupabase();

  if (market) {
    // Per-market reorder (new behavior)
    for (let i = 0; i < order.length; i++) {
      const { conceptId, type } = order[i];
      const priority = i + 1;

      if (type === "image") {
        await db
          .from("image_job_markets")
          .update({ launchpad_priority: priority })
          .eq("image_job_id", conceptId)
          .eq("market", market);
      } else {
        // Update video_jobs.launchpad_market_priorities JSONB
        const { data: job } = await db
          .from("video_jobs")
          .select("launchpad_market_priorities")
          .eq("id", conceptId)
          .single();

        const priorities = (job?.launchpad_market_priorities as Record<string, number>) ?? {};
        priorities[market] = priority;

        await db
          .from("video_jobs")
          .update({ launchpad_market_priorities: priorities })
          .eq("id", conceptId);
      }
    }
  } else {
    // Legacy global reorder (backward compat)
    for (let i = 0; i < order.length; i++) {
      const { conceptId, type } = order[i];
      const table = type === "video" ? "video_jobs" : "image_jobs";
      await db
        .from(table)
        .update({ launchpad_priority: i + 1 })
        .eq("id", conceptId);
    }
  }

  return NextResponse.json({ success: true });
}
