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

  // Fetch all events for this test
  const { data: events, error } = await db
    .from("ab_events")
    .select("variant, event")
    .eq("test_id", id);

  if (error) {
    return safeError(error, "Failed to fetch A/B test stats");
  }

  // Aggregate counts
  const stats = {
    control: { views: 0, clicks: 0, ctr: 0 },
    variant: { views: 0, clicks: 0, ctr: 0 },
  };

  for (const row of events ?? []) {
    const bucket = row.variant === "a" ? stats.control : stats.variant;
    if (row.event === "view") bucket.views++;
    else if (row.event === "click") bucket.clicks++;
  }

  stats.control.ctr =
    stats.control.views > 0
      ? Math.round((stats.control.clicks / stats.control.views) * 10000) / 100
      : 0;
  stats.variant.ctr =
    stats.variant.views > 0
      ? Math.round((stats.variant.clicks / stats.variant.views) * 10000) / 100
      : 0;

  return NextResponse.json(stats);
}
