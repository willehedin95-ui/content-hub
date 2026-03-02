import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import type { AutoPipelineBadgeCount } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/pipeline/badge-count
export async function GET() {
  try {
    const supabase = createServerSupabase();

    // Count concepts in review
    const { count: toReviewCount } = await supabase
      .from("pipeline_concepts")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_review");

    // Count concepts with images complete
    const { count: imagesCompleteCount } = await supabase
      .from("pipeline_concepts")
      .select("*", { count: "exact", head: true })
      .eq("status", "images_complete");

    // TODO: Performance alerts count (Phase 2)
    const performanceAlerts = 0;

    const result: AutoPipelineBadgeCount = {
      count: (toReviewCount || 0) + (imagesCompleteCount || 0) + performanceAlerts,
      breakdown: {
        to_review: toReviewCount || 0,
        images_complete: imagesCompleteCount || 0,
        performance_alerts: performanceAlerts,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[badge-count] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
