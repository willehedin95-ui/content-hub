import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import {
  getAdInsightsDaily,
  AdInsightDailyRow,
  getAdSetInsightsDaily,
  AdSetInsightDailyRow,
  listCampaigns,
  getCampaignBudget,
  runWithMetaConfig,
} from "@/lib/meta";
import { startCronRun, completeCronRun, failCronRun } from "@/lib/cron-tracker";
import { sendTelegramNotification, escapeHtml } from "@/lib/telegram";
import type { WorkspaceMetaConfig } from "@/types";

export const maxDuration = 120;

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

interface AccountConfig {
  label: string;
  adAccountId: string;
  metaConfig: WorkspaceMetaConfig | null; // null = use env vars
}

interface AccountSyncResult {
  label: string;
  adsSynced: number;
  adsetsSynced: number;
  budgetsSynced: number;
  errors: string[];
}

/**
 * Collect unique ad account configs to sync.
 * Includes env var defaults + any workspace meta_configs with distinct ad_account_id.
 */
async function collectAccountConfigs(
  db: ReturnType<typeof createServerSupabase>
): Promise<AccountConfig[]> {
  const configs: AccountConfig[] = [];
  const seenAccountIds = new Set<string>();

  // 1. Default env var account (if configured)
  const envToken = process.env.META_SYSTEM_USER_TOKEN?.trim();
  const envAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
  if (envToken && envAccountId) {
    seenAccountIds.add(envAccountId);
    configs.push({ label: `env(${envAccountId})`, adAccountId: envAccountId, metaConfig: null });
  }

  // 2. Workspace-specific accounts
  const { data: workspaces, error: wsErr } = await db
    .from("workspaces")
    .select("slug, meta_config");
  if (wsErr) {
    console.error("[Ad Perf Sync] workspaces query failed:", wsErr.message);
  }

  for (const ws of workspaces ?? []) {
    const mc = ws.meta_config as WorkspaceMetaConfig | null;
    if (!mc?.ad_account_id) continue;
    if (seenAccountIds.has(mc.ad_account_id)) continue;

    // M4 (2026-07-07): workspaces without their own system_user_token fall back
    // to the shared env token — same semantics as getToken(). hydro13/doginwork
    // only set ad_account_id (+ use_shared_token) and were silently skipped,
    // which froze their performance data. Skip only when NO token exists at all.
    const useSharedToken = (mc as Record<string, unknown>).use_shared_token === true;
    if (!mc.system_user_token && !envToken) {
      console.error(
        `[Ad Perf Sync] ws:${ws.slug}(${mc.ad_account_id}) has no system_user_token and no env fallback — skipping`
      );
      continue;
    }

    seenAccountIds.add(mc.ad_account_id);
    configs.push({
      label: `ws:${ws.slug}(${mc.ad_account_id})`,
      adAccountId: mc.ad_account_id,
      // use_shared_token = explicitly use the shared env token for this account
      metaConfig: useSharedToken ? { ...mc, system_user_token: undefined } : mc,
    });
  }

  return configs;
}

/**
 * Sync ad-level, ad-set level, and budget data for a single Meta ad account.
 */
async function syncOneAccount(
  db: ReturnType<typeof createServerSupabase>,
  config: AccountConfig,
  sinceStr: string,
  untilStr: string
): Promise<AccountSyncResult> {
  const result: AccountSyncResult = {
    label: config.label,
    adsSynced: 0,
    adsetsSynced: 0,
    budgetsSynced: 0,
    errors: [],
  };

  // Caller wraps this whole function in runWithMetaConfig(config.metaConfig, …)
  // so all Meta reads below hit the right account even under concurrency.
  const BATCH_SIZE = 500;

  // --- Ad-level sync ---
  try {
    const rows = await getAdInsightsDaily(sinceStr, untilStr);
    if (rows.length > 0) {
      const dbRows = rows.map((row: AdInsightDailyRow) => {
        const spend = parseFloat(row.spend) || 0;
        const purchases = extractPurchases(row.actions);
        const purchaseValue = extractPurchaseValue(row.action_values);
        return {
          date: row.date_start,
          meta_ad_id: row.ad_id,
          // P2 (2026-07-07): tag every row with its source ad account so
          // downstream aggregates (morning brief, dashboard) never mix accounts.
          ad_account_id: config.adAccountId,
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

      for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
        const batch = dbRows.slice(i, i + BATCH_SIZE);
        const { error } = await db
          .from("meta_ad_performance")
          .upsert(batch, { onConflict: "date,meta_ad_id" });
        if (error) {
          result.errors.push(`Ad upsert: ${error.message}`);
        } else {
          result.adsSynced += batch.length;
        }
      }
    }
  } catch (err) {
    result.errors.push(`Ad fetch: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- Ad-set level sync ---
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
          result.errors.push(`Adset upsert: ${error.message}`);
        } else {
          result.adsetsSynced += batch.length;
        }
      }
    }
  } catch (err) {
    result.errors.push(`Adset fetch: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- Campaign budget snapshots ---
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
        result.errors.push(`Budget upsert: ${error.message}`);
      } else {
        result.budgetsSynced = budgetRows.length;
      }
    }
  } catch (err) {
    result.errors.push(`Budget fetch: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

export async function GET(req: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Collect all unique ad accounts to sync
  const accounts = await collectAccountConfigs(db);
  if (accounts.length === 0) {
    return NextResponse.json({ error: "No Meta accounts configured" }, { status: 400 });
  }

  const cronRunId = await startCronRun("ad-performance-sync");

  // Determine date range: backfill 30 days if table is empty, else last 3 days
  const { count } = await db
    .from("meta_ad_performance")
    .select("id", { count: "exact", head: true });

  const { count: adsetCount } = await db
    .from("meta_adset_performance")
    .select("adset_id", { count: "exact", head: true });

  const isBackfill = (count ?? 0) === 0;
  const adsetNeedsBackfill = (adsetCount ?? 0) < 200;
  const daysBack = isBackfill || adsetNeedsBackfill ? 30 : 3;

  const until = new Date();
  until.setDate(until.getDate() - 1); // yesterday (today's data is incomplete)
  const since = new Date(until);
  since.setDate(since.getDate() - daysBack + 1);

  const sinceStr = formatDate(since);
  const untilStr = formatDate(until);

  console.log(
    `[Ad Perf Sync] ${isBackfill ? "BACKFILL" : "Normal"} sync: ${sinceStr} → ${untilStr} | ${accounts.length} account(s): ${accounts.map((a) => a.label).join(", ")}`
  );

  // Sync each ad account sequentially
  const accountResults: AccountSyncResult[] = [];
  let totalAds = 0;
  let totalAdsets = 0;
  let totalBudgets = 0;

  for (const account of accounts) {
    try {
      const result = await runWithMetaConfig(account.metaConfig, () =>
        syncOneAccount(db, account, sinceStr, untilStr)
      );
      accountResults.push(result);
      totalAds += result.adsSynced;
      totalAdsets += result.adsetsSynced;
      totalBudgets += result.budgetsSynced;
      console.log(
        `[Ad Perf Sync] ${result.label}: ${result.adsSynced} ads, ${result.adsetsSynced} adsets, ${result.budgetsSynced} budgets${result.errors.length ? ` (${result.errors.length} errors)` : ""}`
      );
    } catch (err) {
      console.error(`[Ad Perf Sync] Account ${account.label} failed:`, err);
      accountResults.push({
        label: account.label,
        adsSynced: 0,
        adsetsSynced: 0,
        budgetsSynced: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  // --- Concept metrics (derive from synced meta_ad_performance — account-agnostic) ---
  let conceptMetricsSynced = 0;
  try {
    conceptMetricsSynced = await syncConceptMetricsFromDB(db, sinceStr, untilStr);
    if (conceptMetricsSynced > 0) {
      console.log(`[Ad Perf Sync] Concept metrics: ${conceptMetricsSynced} rows synced`);
    }
  } catch (err) {
    console.error("[Ad Perf Sync] Concept metrics sync error (non-fatal):", err);
  }

  // M3 (2026-07-07): this cron could never fail before — a dead token produced
  // "completed: 0 ads" forever. Any account error now fails the cron run and
  // pings Telegram so token/permission breakage is visible the same day.
  const allErrors = accountResults.flatMap((r) =>
    r.errors.map((e) => `${r.label}: ${e}`)
  );
  const allAccountsFailed =
    accountResults.length > 0 &&
    accountResults.every(
      (r) => r.errors.length > 0 && r.adsSynced + r.adsetsSynced + r.budgetsSynced === 0
    );

  if (allErrors.length > 0) {
    const errorSummary = `${allErrors.length} error(s) across ${accounts.length} account(s): ${allErrors.join(" | ").slice(0, 900)}`;
    await failCronRun(cronRunId, errorSummary);

    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      await sendTelegramNotification(
        chatId,
        `🔴 <b>ad-performance-sync ${allAccountsFailed ? "FAILED" : "completed with errors"}</b>\n\n${allErrors.slice(0, 5).map((e) => `• ${escapeHtml(e.slice(0, 200))}`).join("\n")}${allErrors.length > 5 ? `\n… and ${allErrors.length - 5} more` : ""}`,
        { critical: true }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        all_accounts_failed: allAccountsFailed,
        accounts: accountResults,
        errors: allErrors,
        totals: {
          ads_synced: totalAds,
          adset_rows_synced: totalAdsets,
          budgets_synced: totalBudgets,
          concept_metrics_synced: conceptMetricsSynced,
        },
        date_range: { since: sinceStr, until: untilStr },
        is_backfill: isBackfill,
      },
      { status: allAccountsFailed ? 500 : 200 }
    );
  }

  await completeCronRun(
    cronRunId,
    `${accounts.length} accounts: ${totalAds} ads, ${totalAdsets} adsets, ${totalBudgets} budgets, ${conceptMetricsSynced} concept metrics`
  );

  return NextResponse.json({
    ok: true,
    accounts: accountResults,
    totals: {
      ads_synced: totalAds,
      adset_rows_synced: totalAdsets,
      budgets_synced: totalBudgets,
      concept_metrics_synced: conceptMetricsSynced,
    },
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
