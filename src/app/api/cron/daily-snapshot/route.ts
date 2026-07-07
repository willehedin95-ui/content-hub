import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getCampaignInsights, runWithMetaConfig, MetaInsightsRow } from "@/lib/meta";
import { fetchOrdersSince, isShopifyConfigured, convertToUSD, getRatesToUSD } from "@/lib/shopify";
import { fetchAllGA4Metrics } from "@/lib/ga4";
import { isGoogleAdsConfigured, getGoogleAdsCampaignInsights } from "@/lib/google-ads";
import type { WorkspaceMetaConfig } from "@/types";

export const maxDuration = 60;

interface MetaAccount {
  label: string;
  metaConfig: WorkspaceMetaConfig | null; // null = env vars
}

/**
 * P2 (2026-07-07): the snapshot used to read ONLY the env ad account, so total
 * revenue was divided by partial spend → fabricated ROAS. Collect every unique
 * ad account (env + workspace meta_configs, with the M4 env-token fallback and
 * use_shared_token semantics) and sum spend across them.
 */
async function collectMetaAccounts(
  db: ReturnType<typeof createServerSupabase>
): Promise<MetaAccount[]> {
  const accounts: MetaAccount[] = [];
  const seen = new Set<string>();

  const envToken = process.env.META_SYSTEM_USER_TOKEN?.trim();
  const envAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
  if (envToken && envAccountId) {
    seen.add(envAccountId);
    accounts.push({ label: `env(${envAccountId})`, metaConfig: null });
  }

  const { data: workspaces, error } = await db.from("workspaces").select("slug, meta_config");
  if (error) {
    console.error("[daily-snapshot] workspaces query failed:", error.message);
  }
  for (const ws of workspaces ?? []) {
    const mc = ws.meta_config as WorkspaceMetaConfig | null;
    if (!mc?.ad_account_id || seen.has(mc.ad_account_id)) continue;
    if (!mc.system_user_token && !envToken) {
      console.error(`[daily-snapshot] ws:${ws.slug}(${mc.ad_account_id}) has no token available — skipping`);
      continue;
    }
    const useSharedToken = (mc as Record<string, unknown>).use_shared_token === true;
    seen.add(mc.ad_account_id);
    accounts.push({
      label: `ws:${ws.slug}(${mc.ad_account_id})`,
      metaConfig: useSharedToken ? { ...mc, system_user_token: undefined } : mc,
    });
  }

  return accounts;
}

/** Fetch campaign insights across all accounts. Collects per-account errors —
 * a failed account must fail the snapshot loudly, never silently zero out. */
async function fetchMetaInsightsAllAccounts(
  db: ReturnType<typeof createServerSupabase>,
  dateStr: string
): Promise<{ rows: MetaInsightsRow[]; errors: string[]; accountCount: number }> {
  const accounts = await collectMetaAccounts(db);
  const rows: MetaInsightsRow[] = [];
  const errors: string[] = [];

  for (const account of accounts) {
    try {
      const data = await runWithMetaConfig(account.metaConfig, () =>
        getCampaignInsights(dateStr, dateStr)
      );
      rows.push(...data);
    } catch (err) {
      errors.push(`${account.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { rows, errors, accountCount: accounts.length };
}

// Detect market from campaign name (SE/DK/NO patterns)
function detectMarket(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes(" SE ") || upper.includes("SWEDEN") || upper.includes("SVERIGE")) return "SE";
  if (upper.includes(" DK ") || upper.includes("DENMARK") || upper.includes("DANMARK")) return "DK";
  if (upper.includes(" NO ") || upper.includes("NORWAY") || upper.includes("NORGE")) return "NO";
  // Default to SE (main market)
  return "SE";
}

// Map currency to market
function currencyToMarket(currency: string): string {
  if (currency === "SEK") return "SE";
  if (currency === "DKK") return "DK";
  if (currency === "NOK") return "NO";
  return "SE";
}

export async function GET(req: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Get yesterday's date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);
  const sinceISO = new Date(dateStr).toISOString();
  const untilISO = new Date(dateStr + "T23:59:59Z").toISOString();

  // Get GA4 property IDs from workspace settings (query DB directly — no cookies in cron)
  let ga4PropertyIds: Record<string, string> = {};
  try {
    const { data: workspaces } = await db.from("workspaces").select("settings");
    for (const ws of workspaces ?? []) {
      const wsSettings = (ws.settings ?? {}) as Record<string, unknown>;
      if (wsSettings.ga4_property_ids && typeof wsSettings.ga4_property_ids === "object") {
        ga4PropertyIds = { ...ga4PropertyIds, ...(wsSettings.ga4_property_ids as Record<string, string>) };
      }
    }
  } catch {
    // If workspace query fails, proceed without GA4
  }
  const hasGA4 = Object.keys(ga4PropertyIds).length > 0;

  // Warm exchange rates
  await getRatesToUSD();

  // Fetch all data sources in parallel
  const [metaResult, googleAdsResult, shopifyResult, ga4Result] = await Promise.allSettled([
    fetchMetaInsightsAllAccounts(db, dateStr),
    isGoogleAdsConfigured() ? getGoogleAdsCampaignInsights(dateStr, dateStr) : Promise.resolve([]),
    isShopifyConfigured() ? fetchOrdersSince(sinceISO) : Promise.resolve([]),
    hasGA4 ? fetchAllGA4Metrics(ga4PropertyIds, 1) : Promise.resolve(new Map()),
  ]);

  // P2 (2026-07-07): never silently compute a wrong ROAS. If any ad account
  // failed to fetch, abort BEFORE upserting — a missing snapshot row is a
  // visible gap; a partial-spend ROAS is a silent lie.
  if (metaResult.status === "rejected") {
    return NextResponse.json(
      { error: `Meta insights fetch failed: ${String(metaResult.reason)}` },
      { status: 500 }
    );
  }
  if (metaResult.value.errors.length > 0) {
    return NextResponse.json(
      {
        error: `Meta insights incomplete — ${metaResult.value.errors.length} of ${metaResult.value.accountCount} account(s) failed. Refusing to write a partial snapshot.`,
        details: metaResult.value.errors,
      },
      { status: 500 }
    );
  }

  // Initialize per-market accumulators
  const markets: Record<string, {
    meta_spend: number; meta_impressions: number; meta_clicks: number;
    google_ads_spend: number; google_ads_impressions: number; google_ads_clicks: number; google_ads_conversions: number;
    shopify_orders: number; shopify_revenue: number; shopify_currency: string;
    ga4_sessions: number; ga4_pageviews: number; ga4_users: number;
  }> = {};

  function ensureMarket(m: string) {
    if (!markets[m]) {
      markets[m] = {
        meta_spend: 0, meta_impressions: 0, meta_clicks: 0,
        google_ads_spend: 0, google_ads_impressions: 0, google_ads_clicks: 0, google_ads_conversions: 0,
        shopify_orders: 0, shopify_revenue: 0, shopify_currency: "SEK",
        ga4_sessions: 0, ga4_pageviews: 0, ga4_users: 0,
      };
    }
  }

  // Process Meta campaigns (all ad accounts, summed per market).
  // L4 (2026-07-07): NOTE — this summation assumes every ad account bills in
  // the SAME currency (all current accounts are SEK). If an account with a
  // different billing currency is ever added, spend must be FX-converted per
  // account before summing, or these totals (and ROAS) become silently wrong.
  for (const row of metaResult.value.rows) {
    const market = detectMarket(row.campaign_name || "");
    ensureMarket(market);
    markets[market].meta_spend += parseFloat(row.spend) || 0;
    markets[market].meta_impressions += parseInt(row.impressions) || 0;
    markets[market].meta_clicks += parseInt(row.clicks) || 0;
  }

  // Process Google Ads campaigns
  if (googleAdsResult.status === "fulfilled") {
    for (const row of googleAdsResult.value) {
      const market = detectMarket(row.campaignName);
      ensureMarket(market);
      markets[market].google_ads_spend += row.spend;
      markets[market].google_ads_impressions += row.impressions;
      markets[market].google_ads_clicks += row.clicks;
      markets[market].google_ads_conversions += row.conversions;
    }
  }

  // Process Shopify orders
  if (shopifyResult.status === "fulfilled") {
    // Filter to yesterday's orders only
    const yesterdayOrders = shopifyResult.value.filter((o) => {
      const d = o.created_at.slice(0, 10);
      return d === dateStr;
    });

    for (const order of yesterdayOrders) {
      const market = currencyToMarket(order.currency);
      ensureMarket(market);
      markets[market].shopify_orders += 1;
      markets[market].shopify_revenue += parseFloat(order.total_price) || 0;
      markets[market].shopify_currency = order.currency;
    }
  }

  // Process GA4 metrics
  if (ga4Result.status === "fulfilled") {
    // Map language codes to market codes
    const langToMarket: Record<string, string> = { sv: "SE", da: "DK", no: "NO" };
    for (const [key, metrics] of ga4Result.value) {
      const lang = key.split(":")[0];
      const market = langToMarket[lang] || "SE";
      ensureMarket(market);
      markets[market].ga4_sessions += metrics.sessions;
      markets[market].ga4_pageviews += metrics.screenPageViews;
      markets[market].ga4_users += metrics.totalUsers;
    }
  }

  // Build rows for each market + ALL total
  const rows = [];

  // Per-market rows
  for (const [market, data] of Object.entries(markets)) {
    const totalSpend = data.meta_spend + data.google_ads_spend;
    const revenueUSD = convertToUSD(data.shopify_revenue, data.shopify_currency);
    const roas = totalSpend > 0 ? revenueUSD / totalSpend : null;

    rows.push({
      date: dateStr,
      market,
      ...data,
      total_ad_spend: totalSpend,
      roas,
    });
  }

  // ALL total row
  if (Object.keys(markets).length > 0) {
    const totals = Object.values(markets).reduce(
      (acc, m) => {
        acc.meta_spend += m.meta_spend;
        acc.meta_impressions += m.meta_impressions;
        acc.meta_clicks += m.meta_clicks;
        acc.google_ads_spend += m.google_ads_spend;
        acc.google_ads_impressions += m.google_ads_impressions;
        acc.google_ads_clicks += m.google_ads_clicks;
        acc.google_ads_conversions += m.google_ads_conversions;
        acc.shopify_orders += m.shopify_orders;
        acc.shopify_revenue_usd += convertToUSD(m.shopify_revenue, m.shopify_currency);
        acc.ga4_sessions += m.ga4_sessions;
        acc.ga4_pageviews += m.ga4_pageviews;
        acc.ga4_users += m.ga4_users;
        return acc;
      },
      {
        meta_spend: 0, meta_impressions: 0, meta_clicks: 0,
        google_ads_spend: 0, google_ads_impressions: 0, google_ads_clicks: 0, google_ads_conversions: 0,
        shopify_orders: 0, shopify_revenue_usd: 0,
        ga4_sessions: 0, ga4_pageviews: 0, ga4_users: 0,
      }
    );

    const totalSpend = totals.meta_spend + totals.google_ads_spend;

    rows.push({
      date: dateStr,
      market: "ALL",
      meta_spend: totals.meta_spend,
      meta_impressions: totals.meta_impressions,
      meta_clicks: totals.meta_clicks,
      google_ads_spend: totals.google_ads_spend,
      google_ads_impressions: totals.google_ads_impressions,
      google_ads_clicks: totals.google_ads_clicks,
      google_ads_conversions: totals.google_ads_conversions,
      shopify_orders: totals.shopify_orders,
      shopify_revenue: totals.shopify_revenue_usd,
      shopify_currency: "USD",
      ga4_sessions: totals.ga4_sessions,
      ga4_pageviews: totals.ga4_pageviews,
      ga4_users: totals.ga4_users,
      total_ad_spend: totalSpend,
      roas: totalSpend > 0 ? totals.shopify_revenue_usd / totalSpend : null,
    });
  }

  // Upsert rows
  if (rows.length > 0) {
    const { error } = await db
      .from("daily_snapshots")
      .upsert(rows, { onConflict: "date,market" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    date: dateStr,
    markets: Object.keys(markets),
    rows: rows.length,
  });
}
