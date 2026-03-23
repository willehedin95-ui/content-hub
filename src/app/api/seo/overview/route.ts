import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
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
      avgPosition: 0,
      clicksTrend: 0,
      impressionsTrend: 0,
      positionTrend: 0,
      byProperty: [],
      lastSyncedAt: null,
    } satisfies SeoOverview);
  }

  // Last 7 days vs previous 7 days for trends
  const now = new Date();
  const d7 = new Date(now);
  d7.setDate(d7.getDate() - 10); // GSC has 2-3 day delay, so "last 7 days" = 10 days ago to 3 days ago
  const d14 = new Date(now);
  d14.setDate(d14.getDate() - 17);
  const d3 = new Date(now);
  d3.setDate(d3.getDate() - 3);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Fetch current period (last 7 days) and previous period in parallel
  const [currentRes, prevRes, syncLogRes] = await Promise.all([
    db.rpc("gsc_overview_agg", {
      p_workspace_id: workspaceId,
      p_date_from: fmt(d7),
      p_date_to: fmt(d3),
    }),
    db.rpc("gsc_overview_agg", {
      p_workspace_id: workspaceId,
      p_date_from: fmt(d14),
      p_date_to: fmt(d7),
    }),
    db
      .from("gsc_sync_log")
      .select("completed_at")
      .eq("workspace_id", workspaceId)
      .is("error", null)
      .order("completed_at", { ascending: false })
      .limit(1),
  ]);

  // If RPC doesn't exist yet, fall back to raw query approach
  if (currentRes.error?.code === "PGRST202") {
    // RPC not found — use direct queries instead
    const [cur, prev] = await Promise.all([
      db
        .from("gsc_keywords")
        .select("property, query, clicks, impressions, position")
        .eq("workspace_id", workspaceId)
        .gte("date", fmt(d7))
        .lte("date", fmt(d3)),
      db
        .from("gsc_keywords")
        .select("property, query, clicks, impressions, position")
        .eq("workspace_id", workspaceId)
        .gte("date", fmt(d14))
        .lt("date", fmt(d7)),
    ]);

    const curRows = cur.data ?? [];
    const prevRows = prev.data ?? [];

    // Aggregate current period
    const curClicks = curRows.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const curImpressions = curRows.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const curPositionSum = curRows.reduce((s, r) => s + (r.position ?? 0), 0);
    const curAvgPosition = curRows.length > 0 ? curPositionSum / curRows.length : 0;
    const curUniqueKeywords = new Set(curRows.map((r) => r.query)).size;

    // Aggregate previous period
    const prevClicks = prevRows.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const prevImpressions = prevRows.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const prevPositionSum = prevRows.reduce((s, r) => s + (r.position ?? 0), 0);
    const prevAvgPosition = prevRows.length > 0 ? prevPositionSum / prevRows.length : 0;

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
        avgPosition: agg && agg.count > 0 ? Math.round((agg.posSum / agg.count) * 10) / 10 : 0,
      };
    });

    const lastSyncedAt = syncLogRes.data?.[0]?.completed_at ?? null;

    return NextResponse.json({
      totalKeywords: curUniqueKeywords,
      totalClicks: curClicks,
      totalImpressions: curImpressions,
      avgPosition: Math.round(curAvgPosition * 10) / 10,
      clicksTrend: prevClicks > 0 ? Math.round(((curClicks - prevClicks) / prevClicks) * 100) : 0,
      impressionsTrend: prevImpressions > 0 ? Math.round(((curImpressions - prevImpressions) / prevImpressions) * 100) : 0,
      positionTrend: prevAvgPosition > 0 ? Math.round((prevAvgPosition - curAvgPosition) * 10) / 10 : 0,
      byProperty,
      lastSyncedAt,
    } satisfies SeoOverview);
  }

  return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
}
