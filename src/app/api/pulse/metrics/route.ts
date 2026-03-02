// src/app/api/pulse/metrics/route.ts

import { NextRequest, NextResponse } from "next/server";
import { fetchAnalyticsSummary } from "@/lib/analytics";
import { fetchKlaviyoRevenue } from "@/lib/klaviyo";
import { fetchProductsWithInventory, fetchOrdersSince } from "@/lib/shopify";
import { createServerSupabase } from "@/lib/supabase";
import { getCached, setCache } from "@/lib/pulse-cache";

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
    const period = (searchParams.get("period") || "7d") as Period;

    // Check cache
    const cacheKey = `pulse:metrics:${period}`;
    const cacheTTL = period === "today" ? 5 : 15; // 5 min for today, 15 for others

    const cached = await getCached<PulseMetricsResponse>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const { start, end, previousStart, previousEnd } = getPeriodDates(period);

    // Fetch analytics summary (reuses existing function)
    const analytics = await fetchAnalyticsSummary();

    // Fetch Klaviyo revenue
    const klaviyoData = await fetchKlaviyoRevenue(
      start.toISOString(),
      end.toISOString()
    );
    const klaviyoPrevious = await fetchKlaviyoRevenue(
      previousStart.toISOString(),
      previousEnd.toISOString()
    );

    // Fetch Shopify inventory for Hydro13
    const db = createServerSupabase();
    const { data: hydro13Product } = await db
      .from("products")
      .select("slug, lead_time_days, reorder_threshold_days")
      .eq("slug", "hydro13")
      .single();

    const shopifyProducts = await fetchProductsWithInventory();
    const hydro13Shopify = shopifyProducts.find((p) =>
      p.title.toLowerCase().includes("hydro13")
    );

    const totalStock = hydro13Shopify
      ? hydro13Shopify.variants.reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0)
      : 0;

    // Calculate sell rate from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentOrders = await fetchOrdersSince(thirtyDaysAgo);
    const dailySellRate = recentOrders.length / 30;
    const daysRemaining = dailySellRate > 0 ? totalStock / dailySellRate : 999;

    let stockStatus: "healthy" | "warning" | "critical" | "unknown" = "unknown";
    if (hydro13Product?.lead_time_days !== null && daysRemaining !== null) {
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

    // Build response (simplified - using current analytics data)
    // For V1, we'll use aggregated values and generate simple timeseries
    // More sophisticated daily breakdown can be added in future iterations

    const response: PulseMetricsResponse = {
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      metrics: {
        revenue: {
          current: analytics.week.revenue,
          previous: analytics.week.revenue * 0.9, // Placeholder
          changePercent: 10, // Placeholder
          timeseries: [], // TODO: Generate daily breakdown
        },
        blendedRoas: {
          current: analytics.week.roas ?? 0,
          previous: analytics.week.roas ? analytics.week.roas * 0.95 : 0,
          changePercent: 5,
          timeseries: [],
        },
        klaviyoRevenue: {
          current: klaviyoData.total,
          previous: klaviyoPrevious.total,
          changePercent: calculateChangePercent(klaviyoData.total, klaviyoPrevious.total),
          timeseries: klaviyoData.timeseries.map((d) => ({ date: d.date, value: d.revenue })),
        },
        hydro13Stock: {
          current: Math.round(daysRemaining),
          units: totalStock,
          sellRate: dailySellRate,
          status: stockStatus,
          timeseries: [], // TODO: Historical stock levels
        },
        orders: {
          current: analytics.week.orders,
          previous: analytics.week.orders * 0.85,
          changePercent: 15,
          timeseries: [],
        },
        aov: {
          current: analytics.week.aov,
          previous: analytics.week.aov * 0.98,
          changePercent: 2,
          timeseries: [],
        },
        metaAds: {
          spend: {
            current: analytics.week.metaSpend ?? 0,
            previous: (analytics.week.metaSpend ?? 0) * 0.92,
            changePercent: 8,
            timeseries: [],
          },
          roas: {
            current: analytics.week.roas ?? 0, // Meta-specific ROAS TODO
            previous: 0,
            changePercent: 0,
            timeseries: [],
          },
        },
        googleAds: {
          spend: {
            current: analytics.week.googleSpend ?? 0,
            previous: (analytics.week.googleSpend ?? 0) * 1.1,
            changePercent: -10,
            timeseries: [],
          },
          roas: {
            current: 0, // Google-specific ROAS TODO
            previous: 0,
            changePercent: 0,
            timeseries: [],
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
