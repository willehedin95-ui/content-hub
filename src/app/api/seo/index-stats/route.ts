import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceSettings } from "@/lib/workspace";
import type { GscProperty } from "@/types";

/**
 * Indexation stats from gsc_index_stats: latest measurement + week-ago
 * for trend calculation. Scoped to the current workspace's GSC properties.
 */
export async function GET() {
  const db = createServerSupabase();
  const settings = await getWorkspaceSettings();
  const gscProperties: GscProperty[] = (settings?.gsc_properties as GscProperty[]) ?? [];
  const propertyList = gscProperties.map((p) => p.property);

  if (propertyList.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  // Pull last 30 days of measurements for trend
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: rows } = await db
    .from("gsc_index_stats")
    .select("property, sitemap_path, submitted, indexed, errors, warnings, last_submitted, checked_at")
    .in("property", propertyList)
    .gte("checked_at", since)
    .order("checked_at", { ascending: false });

  // Group by (property, sitemap_path), take latest + week-ago
  type IndexRow = {
    property: string;
    sitemap_path: string;
    submitted: number;
    indexed: number;
    errors: number;
    warnings: number;
    last_submitted: string | null;
    checked_at: string;
  };

  type Latest = {
    property: string;
    sitemapPath: string;
    submitted: number;
    indexed: number;
    indexationRate: number;
    errors: number;
    warnings: number;
    lastSubmitted: string | null;
    checkedAt: string;
    weekAgoIndexed: number | null;
    weekOverWeekChange: number | null;
  };

  const byKey = new Map<string, { latest: IndexRow; history: IndexRow[] }>();
  for (const r of rows ?? []) {
    const row = r as IndexRow;
    const key = `${row.property}::${row.sitemap_path}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { latest: row, history: [row] });
    } else {
      existing.history.push(row);
    }
  }

  const result: Latest[] = [];
  for (const { latest, history } of byKey.values()) {
    // Find the row closest to 7 days ago
    const target = Date.now() - 7 * 86400_000;
    let weekAgo: IndexRow | null = null;
    let bestDelta = Infinity;
    for (const row of history) {
      const delta = Math.abs(new Date(row.checked_at).getTime() - target);
      if (delta < bestDelta && delta < 3 * 86400_000) {
        bestDelta = delta;
        weekAgo = row;
      }
    }

    const wowChange = weekAgo && weekAgo.indexed > 0
      ? Math.round(((latest.indexed - weekAgo.indexed) / weekAgo.indexed) * 100)
      : null;

    result.push({
      property: latest.property,
      sitemapPath: latest.sitemap_path,
      submitted: latest.submitted,
      indexed: latest.indexed,
      indexationRate: latest.submitted > 0
        ? Math.round((latest.indexed / latest.submitted) * 100)
        : 0,
      errors: latest.errors,
      warnings: latest.warnings,
      lastSubmitted: latest.last_submitted,
      checkedAt: latest.checked_at,
      weekAgoIndexed: weekAgo ? weekAgo.indexed : null,
      weekOverWeekChange: wowChange,
    });
  }

  result.sort((a, b) => b.indexed - a.indexed);

  return NextResponse.json({ rows: result });
}
