import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "7") || 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const db = createServerSupabase();

  const [viewsResult, clicksResult, fbpResult, attributionsResult] =
    await Promise.all([
      db
        .from("pixel_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "view")
        .gte("created_at", since),
      db
        .from("pixel_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "click")
        .gte("created_at", since),
      db
        .from("pixel_events")
        .select("id", { count: "exact", head: true })
        .not("fbp", "is", null)
        .gte("created_at", since),
      db
        .from("visitor_attributions")
        .select("match_type, revenue, currency")
        .gte("created_at", since),
    ]);

  const attributions = attributionsResult.data ?? [];
  const totalRevenue = attributions.reduce(
    (sum, a) => sum + (parseFloat(a.revenue) || 0),
    0
  );
  const matchTypes = attributions.reduce(
    (acc, a) => {
      acc[a.match_type] = (acc[a.match_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // CAPI enrichment rate
  const [capiTotal, capiEnriched] = await Promise.all([
    db
      .from("meta_capi_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent"),
    db
      .from("visitor_attributions")
      .select("id", { count: "exact", head: true }),
  ]);

  const capiSent = capiTotal.count ?? 0;
  const enriched = capiEnriched.count ?? 0;

  return NextResponse.json({
    period: { days, since },
    pixel: {
      views: viewsResult.count ?? 0,
      clicks: clicksResult.count ?? 0,
      withFbp: fbpResult.count ?? 0,
    },
    attributions: {
      total: attributions.length,
      byMatchType: matchTypes,
      totalRevenue,
      currency: attributions[0]?.currency || "SEK",
    },
    enrichment: {
      capiSent,
      enrichedWithPixel: enriched,
      rate:
        capiSent > 0
          ? parseFloat(((enriched / capiSent) * 100).toFixed(1))
          : 0,
    },
  });
}
