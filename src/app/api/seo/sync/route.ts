import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import { fetchSearchAnalytics, isGscConfigured, daysAgo, formatDate } from "@/lib/gsc";
import type { GscProperty } from "@/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!isGscConfigured()) {
    return NextResponse.json(
      { error: "Google service account not configured. Set GDRIVE_SERVICE_ACCOUNT_EMAIL and GDRIVE_PRIVATE_KEY." },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const settings = await getWorkspaceSettings();
  const gscProperties: GscProperty[] = (settings?.gsc_properties as GscProperty[]) ?? [];

  if (gscProperties.length === 0) {
    return NextResponse.json(
      { error: "No GSC properties configured. Go to SEO > Settings to add your blog domains." },
      { status: 400 }
    );
  }

  const results: Array<{ property: string; rows: number; error?: string }> = [];

  for (const prop of gscProperties) {
    const logId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    try {
      // Check if we have existing data to determine backfill vs incremental.
      // Keyed by property (not workspace) since gsc_keywords is deduplicated
      // across workspaces via the (property,query,page,country,date) unique index.
      const { count } = await db
        .from("gsc_keywords")
        .select("id", { count: "exact", head: true })
        .eq("property", prop.property);

      // Backfill 90 days on first sync, otherwise last 7 days
      const isBackfill = !count || count === 0;
      const startDate = isBackfill ? daysAgo(90) : daysAgo(10);
      const endDate = daysAgo(2); // GSC data has 2-3 day delay

      const rows = await fetchSearchAnalytics(prop.property, startDate, endDate);

      if (rows.length > 0) {
        // Upsert in batches of 500
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize).map((r) => ({
            workspace_id: workspaceId,
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
              onConflict: "property,query,page,country,date",
            });
        }
      }

      // Log success
      await db.from("gsc_sync_log").insert({
        id: logId,
        workspace_id: workspaceId,
        property: prop.property,
        sync_type: isBackfill ? "backfill" : "manual",
        rows_synced: rows.length,
        date_from: startDate,
        date_to: endDate,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      });

      results.push({ property: prop.property, rows: rows.length });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";

      // Log error
      await db.from("gsc_sync_log").insert({
        id: logId,
        workspace_id: workspaceId,
        property: prop.property,
        sync_type: "manual",
        rows_synced: 0,
        error: errorMsg,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      });

      results.push({ property: prop.property, rows: 0, error: errorMsg });
    }
  }

  return NextResponse.json({ results });
}
