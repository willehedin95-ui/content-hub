import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import {
  getAdInsightsDaily,
  AdInsightDailyRow,
  getAdSetInsightsDaily,
  AdSetInsightDailyRow,
  listCampaigns,
  getCampaignBudget,
} from "@/lib/meta";

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
    `[Ad Perf Sync] Ad-level done: ${totalSynced} rows synced (${sinceStr} → ${untilStr})`
  );

  // --- Ad-set level sync ---
  let adsetSynced = 0;
  try {
    const adsetRows = await getAdSetInsightsDaily(sinceStr, untilStr);
    if (adsetRows.length > 0) {
      const adsetDbRows = adsetRows.map((row: AdSetInsightDailyRow) => {
        const spend = parseFloat(row.spend) || 0;
        const purchases = extractPurchases(row.actions);
        const purchaseValue = extractPurchaseValue(row.action_values);
        return {
          date: row.date_start,
          adset_id: row.adset_id,
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

      for (let i = 0; i < adsetDbRows.length; i += BATCH_SIZE) {
        const batch = adsetDbRows.slice(i, i + BATCH_SIZE);
        const { error } = await db
          .from("meta_adset_performance")
          .upsert(batch, { onConflict: "date,adset_id" });
        if (error) {
          console.error(`[Ad Perf Sync] Adset upsert error:`, error);
        } else {
          adsetSynced += batch.length;
        }
      }
      console.log(`[Ad Perf Sync] Ad-set level: ${adsetSynced} rows synced`);
    }
  } catch (err) {
    console.error("[Ad Perf Sync] Ad-set sync error (non-fatal):", err);
  }

  // --- Campaign budget snapshots ---
  let budgetsSynced = 0;
  try {
    const campaigns = await listCampaigns();
    const today = formatDate(new Date());
    const budgetRows = [];

    for (const campaign of campaigns) {
      try {
        const budget = await getCampaignBudget(campaign.id);
        budgetRows.push({
          date: today,
          campaign_id: campaign.id,
          campaign_name: budget.name || campaign.name,
          daily_budget: parseInt(budget.daily_budget) || 0,
          status: campaign.status,
        });
      } catch {
        // Skip campaigns where budget fetch fails
      }
    }

    if (budgetRows.length > 0) {
      const { error } = await db
        .from("campaign_budget_snapshots")
        .upsert(budgetRows, { onConflict: "date,campaign_id" });
      if (error) {
        console.error("[Ad Perf Sync] Budget snapshot error:", error);
      } else {
        budgetsSynced = budgetRows.length;
        console.log(`[Ad Perf Sync] Budget snapshots: ${budgetsSynced} campaigns`);
      }
    }
  } catch (err) {
    console.error("[Ad Perf Sync] Budget snapshot error (non-fatal):", err);
  }

  return NextResponse.json({
    ok: true,
    rows_synced: totalSynced,
    adset_rows_synced: adsetSynced,
    budgets_synced: budgetsSynced,
    date_range: { since: sinceStr, until: untilStr },
    is_backfill: isBackfill,
  });
}
