import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

// GET /api/video-jobs/model-status — recent success rates per video model
export async function GET() {
  const db = createServerSupabase();

  // Get source_videos from last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: videos } = await db
    .from("source_videos")
    .select("model, status")
    .gte("created_at", sevenDaysAgo)
    .in("status", ["completed", "failed"]);

  const stats: Record<string, { completed: number; failed: number; total: number; rate: number }> = {};

  for (const v of videos ?? []) {
    const model = v.model || "unknown";
    if (!stats[model]) stats[model] = { completed: 0, failed: 0, total: 0, rate: 0 };
    stats[model].total++;
    if (v.status === "completed") stats[model].completed++;
    else stats[model].failed++;
  }

  for (const key of Object.keys(stats)) {
    stats[key].rate = stats[key].total > 0
      ? Math.round((stats[key].completed / stats[key].total) * 100)
      : 0;
  }

  return NextResponse.json(stats);
}
