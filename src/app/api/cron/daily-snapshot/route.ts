import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getAccountInsights, getCampaignInsights } from "@/lib/meta";
import { fetchOrdersSince, isShopifyConfigured, convertToUSD, getRatesToUSD } from "@/lib/shopify";
import { fetchAllGA4Metrics } from "@/lib/ga4";
import { isGoogleAdsConfigured, getGoogleAdsAccountInsights, getGoogleAdsCampaignInsights } from "@/lib/google-ads";
import { LANGUAGES } from "@/types";

export const maxDuration = 60;

function isMetaConfigured(): boolean {
  return !!(process.env.META_SYSTEM_USER_TOKEN && process.env.META_AD_ACCOUNT_ID);
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
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Get yesterday's date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);
  const sinceISO = new Date(dateStr).toISOString();
  const untilISO = new Date(dateStr + "T23:59:59Z").toISOString();

  // Get settings for GA4 property IDs
  const { data: settingsRow } = await db
    .from("app_settings")
    .select("settings")
    .limit(1)
    .single();
  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const ga4PropertyIds = (settings.ga4_property_ids ?? {}) as Record<string, string>;
  const hasGA4 = Object.keys(ga4PropertyIds).length > 0;

  // Warm exchange rates
  await getRatesToUSD();

  // Fetch all data sources in parallel
  const [metaResult, googleAdsResult, shopifyResult, ga4Result] = await Promise.allSettled([
    isMetaConfigured() ? getCampaignInsights(dateStr, dateStr) : Promise.resolve([]),
    isGoogleAdsConfigured() ? getGoogleAdsCampaignInsights(dateStr, dateStr) : Promise.resolve([]),
    isShopifyConfigured() ? fetchOrdersSince(sinceISO) : Promise.resolve([]),
    hasGA4 ? fetchAllGA4Metrics(ga4PropertyIds, 1) : Promise.resolve(new Map()),
  ]);

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

  // Process Meta campaigns
  if (metaResult.status === "fulfilled") {
    for (const row of metaResult.value) {
      const market = detectMarket(row.campaign_name || "");
      ensureMarket(market);
      markets[market].meta_spend += parseFloat(row.spend) || 0;
      markets[market].meta_impressions += parseInt(row.impressions) || 0;
      markets[market].meta_clicks += parseInt(row.clicks) || 0;
    }
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
