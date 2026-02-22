import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  // Fetch events and conversions in parallel
  const [eventsResult, conversionsResult] = await Promise.all([
    db.from("ab_events").select("variant, event").eq("test_id", id),
    db.from("ab_conversions").select("variant, revenue").eq("test_id", id),
  ]);

  if (eventsResult.error) {
    return safeError(eventsResult.error, "Failed to fetch A/B test stats");
  }

  // Aggregate event counts
  const stats = {
    control: { views: 0, clicks: 0, ctr: 0, conversions: 0, revenue: 0, cvr: 0, revenuePerVisitor: 0 },
    variant: { views: 0, clicks: 0, ctr: 0, conversions: 0, revenue: 0, cvr: 0, revenuePerVisitor: 0 },
  };

  for (const row of eventsResult.data ?? []) {
    const bucket = row.variant === "a" ? stats.control : stats.variant;
    if (row.event === "view") bucket.views++;
    else if (row.event === "click") bucket.clicks++;
  }

  // Aggregate conversions
  for (const row of conversionsResult.data ?? []) {
    const bucket = row.variant === "a" ? stats.control : stats.variant;
    bucket.conversions++;
    bucket.revenue += Number(row.revenue);
  }

  // Calculate rates
  for (const bucket of [stats.control, stats.variant]) {
    bucket.ctr = bucket.views > 0
      ? Math.round((bucket.clicks / bucket.views) * 10000) / 100
      : 0;
    bucket.cvr = bucket.views > 0
      ? Math.round((bucket.conversions / bucket.views) * 10000) / 100
      : 0;
    bucket.revenue = Math.round(bucket.revenue * 100) / 100;
    bucket.revenuePerVisitor = bucket.views > 0
      ? Math.round((bucket.revenue / bucket.views) * 100) / 100
      : 0;
  }

  return NextResponse.json(stats);
}
