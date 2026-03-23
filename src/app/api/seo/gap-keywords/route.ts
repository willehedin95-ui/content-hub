import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { gscCountryToMarket } from "@/lib/gsc";

/**
 * Gap zone keywords: positions 5-20 with high impressions.
 * These are the "almost winning" keywords — easiest to push to page 1.
 * Sorted by opportunity score: impressions * (21 - position)
 */
export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const url = new URL(req.url);
  const property = url.searchParams.get("property");
  const country = url.searchParams.get("country");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);

  // Date ranges (accounting for GSC 2-3 day delay)
  const now = new Date();
  const d3 = new Date(now);
  d3.setDate(d3.getDate() - 3);
  const d10 = new Date(now);
  d10.setDate(d10.getDate() - 10);
  const d17 = new Date(now);
  d17.setDate(d17.getDate() - 17);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let curQuery = db
    .from("gsc_keywords")
    .select("query, page, country, property, clicks, impressions, ctr, position")
    .eq("workspace_id", workspaceId)
    .gte("date", fmt(d10))
    .lte("date", fmt(d3));

  let prevQuery = db
    .from("gsc_keywords")
    .select("query, country, property, position")
    .eq("workspace_id", workspaceId)
    .gte("date", fmt(d17))
    .lt("date", fmt(d10));

  if (property) {
    curQuery = curQuery.eq("property", property);
    prevQuery = prevQuery.eq("property", property);
  }
  if (country) {
    curQuery = curQuery.eq("country", country);
    prevQuery = prevQuery.eq("country", country);
  }

  const [curRes, prevRes] = await Promise.all([curQuery, prevQuery]);
  const curRows = curRes.data ?? [];
  const prevRows = prevRes.data ?? [];

  // Build previous period position averages
  const prevMap = new Map<string, { posSum: number; count: number }>();
  for (const r of prevRows) {
    const key = `${r.query}|${r.country}|${r.property}`;
    const existing = prevMap.get(key) ?? { posSum: 0, count: 0 };
    existing.posSum += r.position ?? 0;
    existing.count += 1;
    prevMap.set(key, existing);
  }

  // Aggregate current period
  const aggMap = new Map<
    string,
    {
      query: string;
      page: string | null;
      country: string;
      market: string;
      property: string;
      clicks: number;
      impressions: number;
      ctrSum: number;
      posSum: number;
      count: number;
    }
  >();

  for (const r of curRows) {
    const key = `${r.query}|${r.country}|${r.property}`;
    const existing = aggMap.get(key);
    if (existing) {
      existing.clicks += r.clicks ?? 0;
      existing.impressions += r.impressions ?? 0;
      existing.ctrSum += r.ctr ?? 0;
      existing.posSum += r.position ?? 0;
      existing.count += 1;
      if (!existing.page && r.page) existing.page = r.page;
    } else {
      aggMap.set(key, {
        query: r.query,
        page: r.page,
        country: r.country,
        market: gscCountryToMarket(r.country),
        property: r.property,
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctrSum: r.ctr ?? 0,
        posSum: r.position ?? 0,
        count: 1,
      });
    }
  }

  // Filter to gap zone (positions 5-20) and compute opportunity score
  const results = Array.from(aggMap.values())
    .map((agg) => {
      const key = `${agg.query}|${agg.country}|${agg.property}`;
      const avgPosition = agg.count > 0 ? agg.posSum / agg.count : 0;
      const avgCtr = agg.count > 0 ? agg.ctrSum / agg.count : 0;
      const prev = prevMap.get(key);
      const prevAvgPosition = prev && prev.count > 0 ? prev.posSum / prev.count : null;
      const positionTrend = prevAvgPosition !== null ? prevAvgPosition - avgPosition : 0;

      // Opportunity score: higher impressions + closer to page 1 = bigger opportunity
      const opportunityScore = agg.impressions * (21 - avgPosition);

      return {
        query: agg.query,
        page: agg.page,
        country: agg.country,
        market: agg.market,
        property: agg.property,
        totalClicks: agg.clicks,
        totalImpressions: agg.impressions,
        avgCtr: Math.round(avgCtr * 10000) / 10000,
        avgPosition: Math.round(avgPosition * 10) / 10,
        positionTrend: Math.round(positionTrend * 10) / 10,
        opportunityScore: Math.round(opportunityScore),
      };
    })
    .filter((r) => r.avgPosition >= 5 && r.avgPosition <= 20 && r.totalImpressions >= 10)
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, limit);

  return NextResponse.json(results);
}
