# Ad Performance Data Sync — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pull ad-level performance data from Meta Insights API twice daily into Supabase, forming the data foundation for the morning brief and all signal detection.

**Architecture:** New cron route `/api/cron/ad-performance-sync` calls a new `getAdInsightsDaily()` function in `meta.ts` (adds `time_increment=1` and extra fields to existing pattern), upserts into `meta_ad_performance` table. Runs at 6 AM and 6 PM UTC. First run backfills 30 days; normal runs sync last 3 days.

**Tech Stack:** Next.js App Router, Meta Marketing API v22.0, Supabase (via Management API for DDL, service role for data), Vercel Cron

---

### Task 1: Create `meta_ad_performance` table in Supabase

**Files:**
- None (Supabase Management API call)

**Step 1: Run the DDL via Supabase Management API**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "CREATE TABLE IF NOT EXISTS meta_ad_performance ( id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, date DATE NOT NULL, meta_ad_id TEXT NOT NULL, ad_name TEXT, adset_id TEXT, adset_name TEXT, campaign_id TEXT, campaign_name TEXT, status TEXT, impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, spend NUMERIC(10,2) NOT NULL DEFAULT 0, ctr NUMERIC(6,4) DEFAULT 0, cpc NUMERIC(10,2) DEFAULT 0, cpm NUMERIC(10,2) DEFAULT 0, frequency NUMERIC(6,2) DEFAULT 0, purchases INTEGER NOT NULL DEFAULT 0, purchase_value NUMERIC(10,2) DEFAULT 0, roas NUMERIC(8,2) DEFAULT 0, cpa NUMERIC(10,2) DEFAULT 0, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(date, meta_ad_id) ); CREATE INDEX IF NOT EXISTS idx_ad_perf_date ON meta_ad_performance(date DESC); CREATE INDEX IF NOT EXISTS idx_ad_perf_ad ON meta_ad_performance(meta_ad_id, date DESC); CREATE INDEX IF NOT EXISTS idx_ad_perf_campaign ON meta_ad_performance(campaign_id, date DESC);"}'
```

**Step 2: Verify the table exists**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''meta_ad_performance'\'' ORDER BY ordinal_position;"}'
```

Expected: Returns all columns with correct types.

**Step 3: Commit**

No file changes — table is in Supabase. Move on.

---

### Task 2: Add `getAdInsightsDaily()` to `meta.ts`

**Files:**
- Modify: `src/lib/meta.ts` (after existing `getAdInsights` function, around line 478)

**Step 1: Add the new export type and function**

Add after line 485 (after the `AdInsightRow` type definition):

```typescript
export interface AdInsightDailyRow {
  date_start: string;
  date_stop: string;
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  cpm: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

/**
 * Fetch ad-level insights with daily breakdown (time_increment=1).
 * Returns one row per ad per day. Includes ad name, ad set, and campaign info
 * for the performance monitoring table.
 */
export async function getAdInsightsDaily(
  since: string,
  until: string
): Promise<AdInsightDailyRow[]> {
  const fields = [
    "ad_id", "ad_name",
    "adset_id", "adset_name",
    "campaign_id", "campaign_name",
    "impressions", "clicks", "spend",
    "ctr", "cpc", "cpm", "frequency",
    "actions", "action_values",
  ].join(",");
  const timeRange = JSON.stringify({ since, until });
  return metaJsonPaginated<AdInsightDailyRow>(
    `/act_${getAdAccountId()}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=ad&time_increment=1&limit=200`
  );
}
```

Key differences from existing `getAdInsights`:
- Adds `time_increment=1` → one row per ad per day (not aggregated over date range)
- Adds `ad_name`, `adset_id`, `adset_name` fields (existing function only has `ad_id`)
- Dedicated return type `AdInsightDailyRow` with all fields typed

**Step 2: Verify it compiles**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No new errors.

**Step 3: Commit**

```bash
cd "/Users/williamhedin/Claude Code/content-hub"
git add src/lib/meta.ts
git commit -m "feat: add getAdInsightsDaily() for daily ad performance sync

Adds time_increment=1 for per-day rows, includes ad_name, adset_id,
adset_name, campaign_id, campaign_name fields needed for performance table.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Create the cron route `/api/cron/ad-performance-sync`

**Files:**
- Create: `src/app/api/cron/ad-performance-sync/route.ts`

**Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getAdInsightsDaily, AdInsightDailyRow } from "@/lib/meta";

export const maxDuration = 120;

function isMetaConfigured(): boolean {
  return !!(process.env.META_SYSTEM_USER_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

/** Extract purchase count from Meta actions array */
function extractPurchases(actions?: Array<{ action_type: string; value: string }>): number {
  if (!actions) return 0;
  const purchase = actions.find(
    (a) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
  );
  return purchase ? parseInt(purchase.value) || 0 : 0;
}

/** Extract purchase value from Meta action_values array */
function extractPurchaseValue(actionValues?: Array<{ action_type: string; value: string }>): number {
  if (!actionValues) return 0;
  const purchase = actionValues.find(
    (a) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
  );
  return purchase ? parseFloat(purchase.value) || 0 : 0;
}

/** Format a date as YYYY-MM-DD */
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMetaConfigured()) {
    return NextResponse.json({ error: "Meta not configured" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Determine date range: backfill 30 days if table is empty, else last 3 days
  const { count } = await db
    .from("meta_ad_performance")
    .select("id", { count: "exact", head: true });

  const isBackfill = (count ?? 0) === 0;
  const daysBack = isBackfill ? 30 : 3;

  const until = new Date();
  until.setDate(until.getDate() - 1); // yesterday (today's data is incomplete)
  const since = new Date(until);
  since.setDate(since.getDate() - daysBack + 1);

  const sinceStr = formatDate(since);
  const untilStr = formatDate(until);

  console.log(
    `[Ad Perf Sync] ${isBackfill ? "BACKFILL" : "Normal"} sync: ${sinceStr} → ${untilStr}`
  );

  // Fetch ad-level insights with daily breakdown
  let rows: AdInsightDailyRow[];
  try {
    rows = await getAdInsightsDaily(sinceStr, untilStr);
  } catch (err) {
    console.error("[Ad Perf Sync] Meta API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Meta API call failed" },
      { status: 500 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      rows_synced: 0,
      date_range: { since: sinceStr, until: untilStr },
      is_backfill: isBackfill,
    });
  }

  // Transform Meta rows into DB rows
  const dbRows = rows.map((row) => {
    const spend = parseFloat(row.spend) || 0;
    const purchases = extractPurchases(row.actions);
    const purchaseValue = extractPurchaseValue(row.action_values);

    return {
      date: row.date_start,
      meta_ad_id: row.ad_id,
      ad_name: row.ad_name || null,
      adset_id: row.adset_id || null,
      adset_name: row.adset_name || null,
      campaign_id: row.campaign_id || null,
      campaign_name: row.campaign_name || null,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
      spend,
      ctr: parseFloat(row.ctr) || 0,
      cpc: parseFloat(row.cpc) || 0,
      cpm: parseFloat(row.cpm) || 0,
      frequency: parseFloat(row.frequency ?? "0") || 0,
      purchases,
      purchase_value: purchaseValue,
      roas: spend > 0 ? Math.round((purchaseValue / spend) * 100) / 100 : 0,
      cpa: purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : 0,
      synced_at: new Date().toISOString(),
    };
  });

  // Upsert in batches of 500 (Supabase limit)
  const BATCH_SIZE = 500;
  let totalSynced = 0;

  for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
    const batch = dbRows.slice(i, i + BATCH_SIZE);
    const { error } = await db
      .from("meta_ad_performance")
      .upsert(batch, { onConflict: "date,meta_ad_id" });

    if (error) {
      console.error(`[Ad Perf Sync] Upsert error (batch ${i / BATCH_SIZE + 1}):`, error);
      return NextResponse.json(
        { error: error.message, synced_before_error: totalSynced },
        { status: 500 }
      );
    }
    totalSynced += batch.length;
  }

  console.log(
    `[Ad Perf Sync] Done: ${totalSynced} rows synced (${sinceStr} → ${untilStr})`
  );

  return NextResponse.json({
    ok: true,
    rows_synced: totalSynced,
    date_range: { since: sinceStr, until: untilStr },
    is_backfill: isBackfill,
  });
}
```

**Step 2: Verify it compiles**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No errors.

**Step 3: Commit**

```bash
cd "/Users/williamhedin/Claude Code/content-hub"
git add src/app/api/cron/ad-performance-sync/route.ts
git commit -m "feat: add ad performance sync cron route

Pulls ad-level Meta Insights daily into meta_ad_performance table.
Backfills 30 days on first run, then syncs last 3 days (overlap for
late attribution). Extracts purchases/revenue from actions array,
computes ROAS and CPA. Upserts in 500-row batches.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Add cron schedules to `vercel.json`

**Files:**
- Modify: `vercel.json`

**Step 1: Add the two new cron entries**

Update `vercel.json` to:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-snapshot",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/pipeline-push",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/ad-performance-sync",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/ad-performance-sync",
      "schedule": "0 18 * * *"
    }
  ]
}
```

Note: Two entries for the same path — Vercel supports this for running the same route on different schedules (6 AM + 6 PM UTC).

**Step 2: Commit**

```bash
cd "/Users/williamhedin/Claude Code/content-hub"
git add vercel.json
git commit -m "feat: add ad-performance-sync cron at 6 AM + 6 PM UTC

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Manual test — trigger the sync locally

**Step 1: Test the backfill locally**

```bash
cd "/Users/williamhedin/Claude Code/content-hub"
curl -s -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  "http://localhost:3000/api/cron/ad-performance-sync" | jq .
```

Expected response:
```json
{
  "ok": true,
  "rows_synced": <number>,
  "date_range": { "since": "2026-02-01", "until": "2026-03-02" },
  "is_backfill": true
}
```

**Step 2: Verify data in Supabase**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT date, COUNT(*) as ads, SUM(spend) as total_spend, SUM(purchases) as total_purchases FROM meta_ad_performance GROUP BY date ORDER BY date DESC LIMIT 10;"}'
```

Expected: Rows grouped by date with spend and purchase totals.

**Step 3: Test normal sync (re-run — should be 3-day overlap)**

```bash
curl -s -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  "http://localhost:3000/api/cron/ad-performance-sync" | jq .
```

Expected: `is_backfill: false`, syncs last 3 days only.

**Step 4: Commit any fixes if needed, then final commit**

```bash
cd "/Users/williamhedin/Claude Code/content-hub"
git add -A
git commit -m "feat: ad performance data sync complete (Phase 1 foundation)

- meta_ad_performance table in Supabase
- getAdInsightsDaily() in meta.ts (time_increment=1, daily breakdown)
- /api/cron/ad-performance-sync route (30-day backfill, 3-day normal)
- Cron at 6 AM + 6 PM UTC in vercel.json
- Extracts purchases/revenue, computes ROAS/CPA per ad per day

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Create Supabase table | DDL via Management API |
| 2 | Add `getAdInsightsDaily()` | `src/lib/meta.ts` |
| 3 | Create cron route | `src/app/api/cron/ad-performance-sync/route.ts` |
| 4 | Add cron schedules | `vercel.json` |
| 5 | Manual test + verify | curl commands |
