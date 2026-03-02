// src/app/api/pulse/metrics/route.ts

import { NextRequest, NextResponse } from "next/server";
import { fetchAnalyticsSummary } from "@/lib/analytics";
import { fetchKlaviyoRevenue } from "@/lib/klaviyo";
import { fetchOrdersSince, fetchOrdersFullSince } from "@/lib/shopify";
import { createServerSupabase } from "@/lib/supabase";
import { getCached, setCache } from "@/lib/pulse-cache";
import { fetchHydro13Stock } from "@/lib/shelfless";

export interface TimeseriesPoint {
  date: string;
  value: number;
}

export interface MetricData {
  current: number;
  previous: number;
  changePercent: number;
  timeseries: TimeseriesPoint[];
}

export interface StockMetricData {
  current: number; // days remaining
  units: number;
  sellRate: number;
  status: "healthy" | "warning" | "critical" | "unknown";
  timeseries: TimeseriesPoint[];
}

export interface AdMetricData {
  spend: MetricData;
  roas: MetricData;
}

export interface PulseMetricsResponse {
  period: string;
  startDate: string;
  endDate: string;
  metrics: {
    revenue: MetricData;
    blendedRoas: MetricData;
    klaviyoRevenue: MetricData;
    hydro13Stock: StockMetricData;
    orders: MetricData;
    aov: MetricData;
    metaAds: AdMetricData;
    googleAds: AdMetricData;
  };
}

type Period = "today" | "yesterday" | "7d" | "14d" | "30d" | "90d";

const VALID_PERIODS = new Set<string>(["today", "yesterday", "7d", "14d", "30d", "90d"]);

function isPeriod(value: string): value is Period {
  return VALID_PERIODS.has(value);
}

function periodToDays(period: Period): number {
  switch (period) {
    case "today":
    case "yesterday":
      return 1;
    case "7d":
      return 7;
    case "14d":
      return 14;
    case "30d":
      return 30;
    case "90d":
      return 90;
  }
}

function getPeriodDates(period: Period): { start: Date; end: Date; previousStart: Date; previousEnd: Date } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start: Date;
  let end: Date;
  let days: number;

  switch (period) {
    case "today":
      start = todayStart;
      end = now;
      days = 1;
      break;
    case "yesterday":
      start = new Date(todayStart);
      start.setDate(start.getDate() - 1);
      end = todayStart;
      days = 1;
      break;
    case "7d":
      days = 7;
      start = new Date(todayStart);
      start.setDate(start.getDate() - days);
      end = now;
      break;
    case "14d":
      days = 14;
      start = new Date(todayStart);
      start.setDate(start.getDate() - days);
      end = now;
      break;
    case "30d":
      days = 30;
      start = new Date(todayStart);
      start.setDate(start.getDate() - days);
      end = now;
      break;
    case "90d":
      days = 90;
      start = new Date(todayStart);
      start.setDate(start.getDate() - days);
      end = now;
      break;
  }

  // Calculate previous period for comparison
  const previousEnd = new Date(start);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - days);

  return { start, end, previousStart, previousEnd };
}

function calculateChangePercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const periodParam = searchParams.get("period") || "7d";

    // Validate period
    if (!isPeriod(periodParam)) {
      return NextResponse.json(
        { error: "Invalid period. Must be one of: today, yesterday, 7d, 14d, 30d, 90d" },
        { status: 400 }
      );
    }

    const period = periodParam;

    // Check cache
    const cacheKey = `pulse:metrics:${period}`;
    const cacheTTL = period === "today" ? 5 : 15; // 5 min for today, 15 for others

    const cached = await getCached<PulseMetricsResponse>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const { start, end, previousStart, previousEnd } = getPeriodDates(period);
    const days = periodToDays(period);

    // Fetch all data in parallel
    const [
      currentAnalytics,
      previousShopifyOrders,
      klaviyoData,
      klaviyoPrevious,
      hydro13ProductResult,
      hydro13StockResult,
      recentOrdersForStock,
    ] = await Promise.allSettled([
      fetchAnalyticsSummary(days),
      fetchOrdersSince(previousStart.toISOString()), // Fetch previous period Shopify orders
      fetchKlaviyoRevenue(start.toISOString(), end.toISOString()),
      fetchKlaviyoRevenue(previousStart.toISOString(), previousEnd.toISOString()),
      createServerSupabase()
        .from("products")
        .select("slug, lead_time_days, reorder_threshold_days")
        .eq("slug", "hydro13")
        .single(),
      fetchHydro13Stock(), // Shelfless API
      fetchOrdersFullSince(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    // Extract current analytics
    const analytics = currentAnalytics.status === "fulfilled"
      ? currentAnalytics.value
      : { meta: null, googleAds: null, shopify: null, roas: null, totalAdSpend: 0, dateRange: { since: "", until: "" } };

    // Calculate previous period Shopify metrics from orders
    const prevOrders = previousShopifyOrders.status === "fulfilled" ? previousShopifyOrders.value : [];
    const prevOrdersFiltered = prevOrders.filter(order => {
      // Filter orders that fall within the previous period date range
      const orderDate = new Date(order.created_at);
      return orderDate >= previousStart && orderDate < previousEnd;
    });
    const prevRevenue = prevOrdersFiltered.reduce((sum, o) => sum + parseFloat(o.total_price), 0);
    const prevOrderCount = prevOrdersFiltered.length;
    const prevAov = prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0;

    // Note: V1 limitation - we don't have historical ad spend data for the previous period
    // Meta/Google Ad APIs don't provide easy historical comparison, so we use 0 for now
    // TODO V2: Add proper ad spend tracking or fetch from ad platform historical data
    const prevMetaSpend = 0;
    const prevGoogleSpend = 0;
    const prevBlendedRoas = 0;

    // Extract Klaviyo data
    const klaviyo = klaviyoData.status === "fulfilled" ? klaviyoData.value : { total: 0, timeseries: [] };
    const klaviyoPrev = klaviyoPrevious.status === "fulfilled" ? klaviyoPrevious.value : { total: 0, timeseries: [] };

    // Extract Hydro13 product data
    const hydro13Product = hydro13ProductResult.status === "fulfilled"
      ? hydro13ProductResult.value.data
      : null;

    // Extract Hydro13 stock from Shelfless
    const totalStock = hydro13StockResult.status === "fulfilled"
      ? hydro13StockResult.value
      : 0;

    // Calculate sell rate from last 30 days - only count Hydro13 orders
    const recentOrders = recentOrdersForStock.status === "fulfilled" ? recentOrdersForStock.value : [];
    const hydro13Orders = recentOrders.filter(order =>
      order.line_items.some(item => item.sku?.toLowerCase().includes("hydro13"))
    );
    const dailySellRate = hydro13Orders.length / 30;
    const daysRemaining = dailySellRate > 0 ? totalStock / dailySellRate : 999;

    let stockStatus: "healthy" | "warning" | "critical" | "unknown" = "unknown";
    if (hydro13Product && hydro13Product.lead_time_days !== null && daysRemaining !== null) {
      const leadTime = hydro13Product.lead_time_days ?? 14;
      const threshold = hydro13Product.reorder_threshold_days ?? 7;
      if (daysRemaining < leadTime) {
        stockStatus = "critical";
      } else if (daysRemaining < leadTime + threshold) {
        stockStatus = "warning";
      } else {
        stockStatus = "healthy";
      }
    }

    // Extract current period data
    const currentRevenue = analytics.shopify?.revenue ?? 0;
    const currentOrders = analytics.shopify?.orders ?? 0;
    const currentAov = analytics.shopify?.avgOrderValue ?? 0;
    const currentBlendedRoas = analytics.roas ?? 0;
    const currentMetaSpend = analytics.meta?.spend ?? 0;
    const currentGoogleSpend = analytics.googleAds?.spend ?? 0;

    // Previous period data already calculated above from Shopify orders

    // Calculate Meta-specific ROAS (Meta spend vs Shopify revenue)
    const currentMetaRoas = currentMetaSpend > 0
      ? currentRevenue / currentMetaSpend
      : 0;
    const prevMetaRoas = prevMetaSpend > 0
      ? prevRevenue / prevMetaSpend
      : 0;

    // Calculate Google-specific ROAS (Google spend vs Shopify revenue)
    const currentGoogleRoas = currentGoogleSpend > 0
      ? currentRevenue / currentGoogleSpend
      : 0;
    const prevGoogleRoas = prevGoogleSpend > 0
      ? prevRevenue / prevGoogleSpend
      : 0;

    // Build response
    const response: PulseMetricsResponse = {
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      metrics: {
        revenue: {
          current: currentRevenue,
          previous: prevRevenue,
          changePercent: calculateChangePercent(currentRevenue, prevRevenue),
          timeseries: [], // TODO V2: Generate daily breakdown
        },
        blendedRoas: {
          current: currentBlendedRoas,
          previous: prevBlendedRoas,
          changePercent: calculateChangePercent(currentBlendedRoas, prevBlendedRoas),
          timeseries: [], // TODO V2: Add historical ad spend tracking for proper comparison
        },
        klaviyoRevenue: {
          current: klaviyo.total,
          previous: klaviyoPrev.total,
          changePercent: calculateChangePercent(klaviyo.total, klaviyoPrev.total),
          timeseries: klaviyo.timeseries.map((d) => ({ date: d.date, value: d.revenue })),
        },
        hydro13Stock: {
          current: Math.round(daysRemaining),
          units: totalStock,
          sellRate: dailySellRate,
          status: stockStatus,
          timeseries: [], // TODO V2: Historical stock levels
        },
        orders: {
          current: currentOrders,
          previous: prevOrderCount,
          changePercent: calculateChangePercent(currentOrders, prevOrderCount),
          timeseries: [], // TODO V2: Daily order breakdown
        },
        aov: {
          current: currentAov,
          previous: prevAov,
          changePercent: calculateChangePercent(currentAov, prevAov),
          timeseries: [], // TODO V2: Daily AOV breakdown
        },
        metaAds: {
          spend: {
            current: currentMetaSpend,
            previous: prevMetaSpend,
            changePercent: calculateChangePercent(currentMetaSpend, prevMetaSpend),
            timeseries: [], // TODO V2: Daily spend breakdown
          },
          roas: {
            current: currentMetaRoas,
            previous: prevMetaRoas,
            changePercent: calculateChangePercent(currentMetaRoas, prevMetaRoas),
            timeseries: [], // TODO V2: Daily ROAS breakdown
          },
        },
        googleAds: {
          spend: {
            current: currentGoogleSpend,
            previous: prevGoogleSpend,
            changePercent: calculateChangePercent(currentGoogleSpend, prevGoogleSpend),
            timeseries: [], // TODO V2: Daily spend breakdown
          },
          roas: {
            current: currentGoogleRoas,
            previous: prevGoogleRoas,
            changePercent: calculateChangePercent(currentGoogleRoas, prevGoogleRoas),
            timeseries: [], // TODO V2: Daily ROAS breakdown
          },
        },
      },
    };

    // Cache the response
    await setCache(cacheKey, response, cacheTTL);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Pulse metrics API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
