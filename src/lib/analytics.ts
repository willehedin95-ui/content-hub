import { getAccountInsights, getAdInsights, getCampaignInsights, MetaInsightsRow } from "./meta";
import { fetchOrdersSince, ShopifyOrder, isShopifyConfigured, convertToUSD, getRatesToUSD } from "./shopify";
import { isGoogleAdsConfigured, getGoogleAdsAccountInsights, getGoogleAdsCampaignInsights, GoogleAdsCampaignRow } from "./google-ads";
import { createServerSupabase } from "./supabase";

// ---- Types ----

export interface AnalyticsSummary {
  meta: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
  } | null;
  googleAds: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
    cpm: number;
  } | null;
  shopify: {
    orders: number;
    revenue: number;
    avgOrderValue: number;
    currency: string;
  } | null;
  roas: number | null;
  totalAdSpend: number;
  dateRange: { since: string; until: string };
  errors?: { meta?: string; shopify?: string; googleAds?: string };
}

export interface CampaignPerformance {
  name: string;
  internalId: string;
  source: "meta" | "google";
  product: string | null;
  language: string;
  metaCampaignId: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions?: number;
  orders: number;
  revenue: number;
  roas: number;
}

export interface AIInsights {
  summary: string;
  top_performers: Array<{ name: string; reason: string }>;
  underperformers: Array<{ name: string; issue: string; recommendation: string }>;
  budget_recommendations: Array<{ action: string; campaign: string; reason: string }>;
  trends: string[];
  action_items: string[];
}

// ---- Helpers ----

function getDateRange(days: number): { since: string; until: string; sinceISO: string } {
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  return {
    since: since.toISOString().slice(0, 10),
    until: now.toISOString().slice(0, 10),
    sinceISO: since.toISOString(),
  };
}

function isMetaConfigured(): boolean {
  return !!(process.env.META_SYSTEM_USER_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

function parseInsightsRow(rows: MetaInsightsRow[]): {
  spend: number; impressions: number; clicks: number; ctr: number; cpc: number; cpm: number;
} {
  let spend = 0, impressions = 0, clicks = 0;
  for (const r of rows) {
    spend += parseFloat(r.spend) || 0;
    impressions += parseInt(r.impressions) || 0;
    clicks += parseInt(r.clicks) || 0;
  }
  return {
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
  };
}

function attributeOrderToUrl(order: ShopifyOrder, landingUrls: Set<string>): boolean {
  const site = order.landing_site;
  if (!site) return false;
  try {
    const url = new URL(site, "https://placeholder.com");
    // Check UTM source=meta or facebook (legacy)
    const src = url.searchParams.get("utm_source");
    if (src === "meta" || src === "facebook") return true;
    // Check if the landing page path matches any known landing URL
    const path = url.pathname.replace(/\/$/, "");
    for (const lu of landingUrls) {
      try {
        const luUrl = new URL(lu);
        if (luUrl.pathname.replace(/\/$/, "") === path) return true;
      } catch { /* skip invalid URLs */ }
    }
  } catch { /* skip */ }
  return false;
}

// ---- Data Fetching ----

export async function fetchAnalyticsSummary(days: number): Promise<AnalyticsSummary> {
  const { since, until, sinceISO } = getDateRange(days);
  const errors: { meta?: string; shopify?: string; googleAds?: string } = {};

  // Fetch Meta + Google Ads + Shopify + exchange rates in parallel
  const [metaResult, googleAdsResult, shopifyResult] = await Promise.allSettled([
    isMetaConfigured() ? getAccountInsights(since, until) : Promise.reject(new Error("Not configured")),
    isGoogleAdsConfigured() ? getGoogleAdsAccountInsights(since, until) : Promise.reject(new Error("Not configured")),
    isShopifyConfigured() ? fetchOrdersSince(sinceISO) : Promise.reject(new Error("Not configured")),
    getRatesToUSD(), // Warm rate cache for convertToUSD calls below
  ]);

  let meta: AnalyticsSummary["meta"] = null;
  if (metaResult.status === "fulfilled" && metaResult.value.length > 0) {
    meta = parseInsightsRow(metaResult.value);
  } else if (metaResult.status === "rejected" && metaResult.reason?.message !== "Not configured") {
    errors.meta = metaResult.reason?.message || "Failed to fetch Meta data";
  }

  let googleAds: AnalyticsSummary["googleAds"] = null;
  if (googleAdsResult.status === "fulfilled") {
    googleAds = googleAdsResult.value;
  } else if (googleAdsResult.status === "rejected" && googleAdsResult.reason?.message !== "Not configured") {
    errors.googleAds = googleAdsResult.reason?.message || "Failed to fetch Google Ads data";
  }

  let shopify: AnalyticsSummary["shopify"] = null;
  if (shopifyResult.status === "fulfilled") {
    const orders = shopifyResult.value;
    const revenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price), 0);
    shopify = {
      orders: orders.length,
      revenue,
      avgOrderValue: orders.length > 0 ? revenue / orders.length : 0,
      currency: orders[0]?.currency || "SEK",
    };
  } else if (shopifyResult.status === "rejected" && shopifyResult.reason?.message !== "Not configured") {
    errors.shopify = shopifyResult.reason?.message || "Failed to fetch Shopify data";
  }

  // Combined ad spend (Meta + Google Ads) for ROAS
  const totalAdSpend = (meta?.spend ?? 0) + (googleAds?.spend ?? 0);
  const roas = shopify && totalAdSpend > 0
    ? convertToUSD(shopify.revenue, shopify.currency) / totalAdSpend
    : null;

  return {
    meta,
    googleAds,
    shopify,
    roas,
    totalAdSpend,
    dateRange: { since, until },
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  };
}

export async function fetchCampaignPerformance(days: number): Promise<CampaignPerformance[]> {
  const { since, until, sinceISO } = getDateRange(days);
  const db = createServerSupabase();

  // Fetch all data sources + exchange rates in parallel
  const [metaResult, googleAdsResult, shopifyResult, dbResult] = await Promise.allSettled([
    isMetaConfigured() ? getCampaignInsights(since, until) : Promise.resolve([]),
    isGoogleAdsConfigured() ? getGoogleAdsCampaignInsights(since, until) : Promise.resolve([] as GoogleAdsCampaignRow[]),
    isShopifyConfigured() ? fetchOrdersSince(sinceISO) : Promise.resolve([]),
    db.from("meta_campaigns")
      .select("id, name, product, language, meta_campaign_id, meta_ads(landing_page_url)")
      .in("status", ["pushed", "pushing"]),
    getRatesToUSD(), // Warm rate cache
  ]);

  const metaRows = metaResult.status === "fulfilled" ? metaResult.value : [];
  const googleAdsRows = googleAdsResult.status === "fulfilled" ? googleAdsResult.value : [];
  const orders = shopifyResult.status === "fulfilled" ? shopifyResult.value : [];
  const campaigns = dbResult.status === "fulfilled" ? (dbResult.value.data ?? []) : [];

  // Build Meta insights map: meta_campaign_id → aggregated metrics
  const metaMap = new Map<string, MetaInsightsRow[]>();
  for (const row of metaRows) {
    if (!row.campaign_id) continue;
    const existing = metaMap.get(row.campaign_id) || [];
    existing.push(row);
    metaMap.set(row.campaign_id, existing);
  }

  // Build results — deduplicate orders so each is only attributed once
  const results: CampaignPerformance[] = [];
  const attributedOrderIds = new Set<string>();

  // Meta campaigns from DB
  for (const campaign of campaigns) {
    const ads = (campaign.meta_ads ?? []) as Array<{ landing_page_url: string | null }>;
    const landingUrls = new Set(ads.map(a => a.landing_page_url).filter(Boolean) as string[]);

    // Meta metrics
    const insightRows = campaign.meta_campaign_id ? metaMap.get(campaign.meta_campaign_id) || [] : [];
    const metrics = parseInsightsRow(insightRows);

    // Shopify attribution (deduplicated — first-match wins)
    let campaignOrders = 0;
    let campaignRevenue = 0;
    let campaignRevenueUSD = 0;
    for (const order of orders) {
      if (attributedOrderIds.has(order.id)) continue;
      if (attributeOrderToUrl(order, landingUrls)) {
        attributedOrderIds.add(order.id);
        campaignOrders++;
        const price = parseFloat(order.total_price);
        campaignRevenue += price;
        campaignRevenueUSD += convertToUSD(price, order.currency);
      }
    }

    results.push({
      name: campaign.name,
      internalId: campaign.id,
      source: "meta",
      product: campaign.product,
      language: campaign.language,
      metaCampaignId: campaign.meta_campaign_id,
      ...metrics,
      orders: campaignOrders,
      revenue: campaignRevenue,
      roas: metrics.spend > 0 ? campaignRevenueUSD / metrics.spend : 0,
    });
  }

  // Google Ads campaigns
  for (const gaCampaign of googleAdsRows) {
    results.push({
      name: gaCampaign.campaignName,
      internalId: `gads_${gaCampaign.campaignId}`,
      source: "google",
      product: null,
      language: "",
      metaCampaignId: null,
      spend: gaCampaign.spend,
      impressions: gaCampaign.impressions,
      clicks: gaCampaign.clicks,
      ctr: gaCampaign.ctr,
      cpc: gaCampaign.cpc,
      conversions: gaCampaign.conversions,
      orders: 0,
      revenue: 0,
      roas: 0,
    });
  }

  // Sort by spend descending
  results.sort((a, b) => b.spend - a.spend);

  return results;
}

// ---- Page-level Meta metrics ----

export interface MetaPageMetrics {
  spend: number;
  clicks: number;
  impressions: number;
}

export async function getMetaMetricsByPage(
  days: number
): Promise<Map<string, MetaPageMetrics>> {
  if (!isMetaConfigured()) return new Map();

  const { since, until } = getDateRange(days);
  const db = createServerSupabase();

  const [adInsights, dbResult] = await Promise.all([
    getAdInsights(since, until),
    db.from("meta_ads")
      .select("meta_ad_id, landing_page_url")
      .not("meta_ad_id", "is", null)
      .not("landing_page_url", "is", null),
  ]);

  // Build lookup: meta_ad_id → landing_page_url
  const adToUrl = new Map<string, string>();
  for (const row of dbResult.data ?? []) {
    if (row.meta_ad_id && row.landing_page_url) {
      adToUrl.set(row.meta_ad_id, row.landing_page_url);
    }
  }

  // Aggregate spend/clicks/impressions per page slug
  const map = new Map<string, MetaPageMetrics>();
  for (const insight of adInsights) {
    const url = adToUrl.get(insight.ad_id);
    if (!url) continue;

    let slug: string;
    try {
      slug = new URL(url).pathname.replace(/^\/|\/$/g, "");
    } catch {
      continue;
    }
    if (!slug) continue;

    const existing = map.get(slug) ?? { spend: 0, clicks: 0, impressions: 0 };
    existing.spend += parseFloat(insight.spend) || 0;
    existing.clicks += parseInt(insight.clicks) || 0;
    existing.impressions += parseInt(insight.impressions) || 0;
    map.set(slug, existing);
  }

  return map;
}
