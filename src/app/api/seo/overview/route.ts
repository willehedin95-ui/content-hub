import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import { buildWorkspacePageFilter, pageMatchesWorkspace } from "@/lib/seo-workspace-filter";
import type { GscProperty, SeoOverview } from "@/types";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const settings = await getWorkspaceSettings();
  const gscProperties: GscProperty[] = (settings?.gsc_properties as GscProperty[]) ?? [];

  if (gscProperties.length === 0) {
    return NextResponse.json({
      totalKeywords: 0,
      totalClicks: 0,
      totalImpressions: 0,
      avgPosition: null,
      clicksTrend: null,
      impressionsTrend: null,
      positionTrend: null,
      byProperty: [],
      lastSyncedAt: null,
      hasProperties: false,
    } satisfies SeoOverview);
  }

  const propertyUrls = gscProperties.map((p) => p.property);
  const pageFilter = await buildWorkspacePageFilter(db, workspaceId, gscProperties);

  // Last 7 days vs previous 7 days for trends
  // GSC has 2-3 day delay, so "last 7 days" = 10 days ago to 3 days ago
  const now = new Date();
  const d3 = new Date(now);
  d3.setDate(d3.getDate() - 3);
  const d10 = new Date(now);
  d10.setDate(d10.getDate() - 10);
  const d17 = new Date(now);
  d17.setDate(d17.getDate() - 17);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [cur, prev, syncLogRes] = await Promise.all([
    db
      .from("gsc_keywords")
      .select("property, query, page, clicks, impressions, position")
      .in("property", propertyUrls)
      .gte("date", fmt(d10))
      .lte("date", fmt(d3)),
    db
      .from("gsc_keywords")
      .select("property, query, page, clicks, impressions, position")
      .in("property", propertyUrls)
      .gte("date", fmt(d17))
      .lt("date", fmt(d10)),
    db
      .from("gsc_sync_log")
      .select("completed_at")
      .in("property", propertyUrls)
      .is("error", null)
      .order("completed_at", { ascending: false })
      .limit(1),
  ]);

  const curRows = ((cur.data ?? []) as Array<{ property: string; query: string; page: string; clicks: number | null; impressions: number | null; position: number | null }>).filter((r) => pageMatchesWorkspace(r.page, r.property, pageFilter));
  const prevRows = ((prev.data ?? []) as Array<{ property: string; query: string; page: string; clicks: number | null; impressions: number | null; position: number | null }>).filter((r) => pageMatchesWorkspace(r.page, r.property, pageFilter));

  // Aggregate current period
  const curClicks = curRows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const curImpressions = curRows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const curPositionSum = curRows.reduce((s, r) => s + (r.position ?? 0), 0);
  const curAvgPosition = curRows.length > 0 ? Math.round((curPositionSum / curRows.length) * 10) / 10 : null;
  const curUniqueKeywords = new Set(curRows.map((r) => r.query)).size;

  // Aggregate previous period
  const prevClicks = prevRows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const prevImpressions = prevRows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const prevPositionSum = prevRows.reduce((s, r) => s + (r.position ?? 0), 0);
  const prevAvgPosition = prevRows.length > 0 ? prevPositionSum / prevRows.length : null;

  // Calculate trends — null when no comparison data available
  const clicksTrend = prevClicks > 0 ? Math.round(((curClicks - prevClicks) / prevClicks) * 100) : null;
  const impressionsTrend = prevImpressions > 0 ? Math.round(((curImpressions - prevImpressions) / prevImpressions) * 100) : null;
  const positionTrend = prevAvgPosition !== null && curAvgPosition !== null
    ? Math.round((prevAvgPosition - curAvgPosition) * 10) / 10
    : null;

  // Per-property breakdown
  const byProp = new Map<string, { clicks: number; impressions: number; posSum: number; count: number }>();
  for (const r of curRows) {
    const key = r.property;
    const existing = byProp.get(key) ?? { clicks: 0, impressions: 0, posSum: 0, count: 0 };
    existing.clicks += r.clicks ?? 0;
    existing.impressions += r.impressions ?? 0;
    existing.posSum += r.position ?? 0;
    existing.count += 1;
    byProp.set(key, existing);
  }

  const byProperty = gscProperties.map((p) => {
    const agg = byProp.get(p.property);
    return {
      property: p.property,
      language: p.language,
      label: p.label,
      totalClicks: agg?.clicks ?? 0,
      totalImpressions: agg?.impressions ?? 0,
      avgPosition: agg && agg.count > 0 ? Math.round((agg.posSum / agg.count) * 10) / 10 : null,
    };
  });

  const lastSyncedAt = syncLogRes.data?.[0]?.completed_at ?? null;

  return NextResponse.json({
    totalKeywords: curUniqueKeywords,
    totalClicks: curClicks,
    totalImpressions: curImpressions,
    avgPosition: curAvgPosition,
    clicksTrend,
    impressionsTrend,
    positionTrend,
    byProperty,
    lastSyncedAt,
    hasProperties: true,
  } satisfies SeoOverview);
}
