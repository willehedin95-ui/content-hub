import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { fetchSearchAnalytics, isGscConfigured, daysAgo } from "@/lib/gsc";
import type { GscProperty } from "@/types";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGscConfigured()) {
    return NextResponse.json({ skipped: true, reason: "GSC not configured" });
  }

  const db = createServerSupabase();

  // Get all workspaces with GSC properties configured
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, slug, settings");

  if (!workspaces || workspaces.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No workspaces" });
  }

  const allResults: Array<{
    workspace: string;
    property: string;
    rows: number;
    error?: string;
  }> = [];

  for (const ws of workspaces) {
    const gscProperties: GscProperty[] =
      (ws.settings as Record<string, unknown>)?.gsc_properties as GscProperty[] ?? [];
    if (gscProperties.length === 0) continue;

    for (const prop of gscProperties) {
      const logId = crypto.randomUUID();
      const startedAt = new Date().toISOString();

      try {
        // Check if we have existing data
        const { count } = await db
          .from("gsc_keywords")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", ws.id)
          .eq("property", prop.property);

        const isBackfill = !count || count === 0;
        const startDate = isBackfill ? daysAgo(90) : daysAgo(10);
        const endDate = daysAgo(2);

        const rows = await fetchSearchAnalytics(prop.property, startDate, endDate);

        if (rows.length > 0) {
          const batchSize = 500;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize).map((r) => ({
              workspace_id: ws.id,
              property: prop.property,
              query: r.query,
              page: r.page || "",
              country: r.country,
              date: r.date,
              clicks: r.clicks,
              impressions: r.impressions,
              ctr: r.ctr,
              position: r.position,
              synced_at: new Date().toISOString(),
            }));

            await db
              .from("gsc_keywords")
              .upsert(batch, {
                onConflict: "workspace_id,property,query,page,country,date",
              });
          }
        }

        await db.from("gsc_sync_log").insert({
          id: logId,
          workspace_id: ws.id,
          property: prop.property,
          sync_type: isBackfill ? "backfill" : "weekly",
          rows_synced: rows.length,
          date_from: startDate,
          date_to: endDate,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });

        allResults.push({ workspace: ws.slug, property: prop.property, rows: rows.length });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        await db.from("gsc_sync_log").insert({
          id: logId,
          workspace_id: ws.id,
          property: prop.property,
          sync_type: "weekly",
          rows_synced: 0,
          error: errorMsg,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        });
        allResults.push({ workspace: ws.slug, property: prop.property, rows: 0, error: errorMsg });
      }
    }
  }

  return NextResponse.json({ results: allResults });
}
