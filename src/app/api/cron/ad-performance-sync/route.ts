import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import {
  getAdInsightsDaily,
  AdInsightDailyRow,
  getAdSetInsightsDaily,
  AdSetInsightDailyRow,
  listCampaigns,
  getCampaignBudget,
} from "@/lib/meta";
import { startCronRun, completeCronRun, failCronRun } from "@/lib/cron-tracker";

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
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMetaConfigured()) {
    return NextResponse.json({ error: "Meta not configured" }, { status: 400 });
  }

  const db = createServerSupabase();
  const cronRunId = await startCronRun("ad-performance-sync");

  // Determine date range: backfill 30 days if table is empty, else last 3 days
  const { count } = await db
    .from("meta_ad_performance")
    .select("id", { count: "exact", head: true });

  // Check adset table separately — it was added later and may need its own backfill
  const { count: adsetCount } = await db
    .from("meta_adset_performance")
    .select("adset_id", { count: "exact", head: true });

  const isBackfill = (count ?? 0) === 0;
  const adsetNeedsBackfill = (adsetCount ?? 0) < 200; // < 200 rows means < ~7 days of data
  const daysBack = isBackfill || adsetNeedsBackfill ? 30 : 3;

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
    await failCronRun(cronRunId, err instanceof Error ? err.message : "Meta API call failed");
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

  // --- Concept metrics (derive from synced meta_ad_performance) ---
  let conceptMetricsSynced = 0;
  try {
    conceptMetricsSynced = await syncConceptMetricsFromDB(db, sinceStr, untilStr);
    if (conceptMetricsSynced > 0) {
      console.log(`[Ad Perf Sync] Concept metrics: ${conceptMetricsSynced} rows synced`);
    }
  } catch (err) {
    console.error("[Ad Perf Sync] Concept metrics sync error (non-fatal):", err);
  }

  await completeCronRun(cronRunId, `${totalSynced} ads, ${adsetSynced} adsets, ${conceptMetricsSynced} concept metrics`);
  return NextResponse.json({
    ok: true,
    rows_synced: totalSynced,
    adset_rows_synced: adsetSynced,
    budgets_synced: budgetsSynced,
    concept_metrics_synced: conceptMetricsSynced,
    date_range: { since: sinceStr, until: untilStr },
    is_backfill: isBackfill,
  });
}

/**
 * Derive concept_metrics from already-synced meta_ad_performance data.
 * Maps: meta_ad_performance.meta_ad_id → meta_ads.campaign_id → meta_campaigns.id →
 *        image_job_markets.meta_campaign_id → concept_metrics.image_job_market_id
 */
async function syncConceptMetricsFromDB(
  db: ReturnType<typeof createServerSupabase>,
  sinceStr: string,
  untilStr: string
): Promise<number> {
  // Build mapping: meta_ad_id → image_job_market_id
  const { data: markets } = await db
    .from("image_job_markets")
    .select("id, meta_campaign_id")
    .not("meta_campaign_id", "is", null);

  if (!markets?.length) return 0;

  const campaignToMarketMap = new Map<string, string>();
  for (const m of markets) {
    if (m.meta_campaign_id) campaignToMarketMap.set(m.meta_campaign_id, m.id);
  }

  // Get all meta_ads that belong to these campaigns
  const campaignIds = [...campaignToMarketMap.keys()];
  const { data: ads } = await db
    .from("meta_ads")
    .select("meta_ad_id, campaign_id")
    .in("campaign_id", campaignIds);

  if (!ads?.length) return 0;

  const adToMarketMap = new Map<string, string>();
  for (const ad of ads) {
    if (ad.meta_ad_id && ad.campaign_id) {
      const marketId = campaignToMarketMap.get(ad.campaign_id);
      if (marketId) adToMarketMap.set(ad.meta_ad_id, marketId);
    }
  }

  if (adToMarketMap.size === 0) return 0;

  // Fetch synced ad performance for the date range
  const metaAdIds = [...adToMarketMap.keys()];
  const allPerf: Array<Record<string, unknown>> = [];

  // Query in batches (Supabase .in() has limits)
  const CHUNK = 200;
  for (let i = 0; i < metaAdIds.length; i += CHUNK) {
    const chunk = metaAdIds.slice(i, i + CHUNK);
    const { data } = await db
      .from("meta_ad_performance")
      .select("date, meta_ad_id, spend, impressions, clicks, purchases, purchase_value, frequency")
      .in("meta_ad_id", chunk)
      .gte("date", sinceStr)
      .lte("date", untilStr);
    if (data) allPerf.push(...data);
  }

  if (allPerf.length === 0) return 0;

  // Aggregate per image_job_market_id per day
  const aggregated = new Map<string, {
    image_job_market_id: string;
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    frequencySum: number;
    frequencyCount: number;
  }>();

  for (const row of allPerf) {
    const marketId = adToMarketMap.get(row.meta_ad_id as string);
    if (!marketId) continue;

    const date = row.date as string;
    const key = `${marketId}:${date}`;
    const existing = aggregated.get(key) ?? {
      image_job_market_id: marketId,
      date,
      spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0,
      frequencySum: 0, frequencyCount: 0,
    };

    existing.spend += Number(row.spend) || 0;
    existing.impressions += Number(row.impressions) || 0;
    existing.clicks += Number(row.clicks) || 0;
    existing.conversions += Number(row.purchases) || 0;
    existing.revenue += Number(row.purchase_value) || 0;

    const freq = Number(row.frequency) || 0;
    if (freq > 0) {
      existing.frequencySum += freq;
      existing.frequencyCount++;
    }

    aggregated.set(key, existing);
  }

  // Upsert into concept_metrics
  let synced = 0;
  const BATCH = 500;
  const rows = [...aggregated.values()].map((agg) => {
    const frequency = agg.frequencyCount > 0 ? agg.frequencySum / agg.frequencyCount : 0;
    return {
      image_job_market_id: agg.image_job_market_id,
      date: agg.date,
      spend: agg.spend,
      impressions: agg.impressions,
      clicks: agg.clicks,
      ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
      cpc: agg.clicks > 0 ? agg.spend / agg.clicks : 0,
      cpm: agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0,
      frequency,
      conversions: agg.conversions,
      cpa: agg.conversions > 0 ? agg.spend / agg.conversions : 0,
      roas: agg.spend > 0 ? agg.revenue / agg.spend : 0,
      revenue: agg.revenue,
      synced_at: new Date().toISOString(),
    };
  });

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db
      .from("concept_metrics")
      .upsert(batch, { onConflict: "image_job_market_id,date" });
    if (error) {
      console.error("[Ad Perf Sync] Concept metrics upsert error:", error);
    } else {
      synced += batch.length;
    }
  }

  return synced;
}
