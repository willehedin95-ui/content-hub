import { NextResponse } from "next/server";
import { fetchStock, isShelflessConfigured, StockData } from "@/lib/shelfless";
import {
  fetchOrdersFullSince,
  isShopifyConfigured,
  ShopifyOrderFull,
} from "@/lib/shopify";
import { createServerSupabase } from "@/lib/supabase";
import { getCached, setCache } from "@/lib/pulse-cache";

const COLLAGEN_SKU = "COLLAGEN-MARINE-12500";
const CACHE_KEY = "stock:collagen";
const CACHE_TTL = 15; // minutes
const SAFETY_BUFFER_DAYS = 30;

interface SellRates {
  daily7d: number;
  daily30d: number;
  daily90d: number;
  dailyTimeseries: Array<{ date: string; units: number }>;
}

export interface StockResponse {
  stock: StockData;
  sellRates: SellRates;
  daysRemaining: number | null;
  reorderByDate: string | null;
  suggestedOrderQty: number | null;
  status: "healthy" | "warning" | "critical" | "unknown";
  leadTimeDays: number;
  reorderThresholdDays: number;
  updatedAt: string;
}

function countUnitsSold(
  orders: ShopifyOrderFull[],
  sinceDaysAgo: number
): number {
  const cutoff = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000);
  let total = 0;
  for (const order of orders) {
    const orderDate = new Date(order.created_at);
    if (orderDate < cutoff) continue;
    for (const li of order.line_items) {
      if (li.sku === COLLAGEN_SKU) {
        total += li.quantity;
      }
    }
  }
  return total;
}

function buildDailyTimeseries(
  orders: ShopifyOrderFull[]
): Array<{ date: string; units: number }> {
  const counts: Record<string, number> = {};
  // Initialize last 30 days with 0
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    counts[d.toISOString().slice(0, 10)] = 0;
  }
  for (const order of orders) {
    const date = order.created_at.slice(0, 10);
    if (!(date in counts)) continue;
    for (const li of order.line_items) {
      if (li.sku === COLLAGEN_SKU) {
        counts[date] = (counts[date] || 0) + li.quantity;
      }
    }
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, units]) => ({ date, units }));
}

export async function GET() {
  try {
    const cached = await getCached<StockResponse>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    if (!isShelflessConfigured() || !isShopifyConfigured()) {
      return NextResponse.json(
        { error: "Stock integrations not configured" },
        { status: 503 }
      );
    }

    const db = createServerSupabase();

    // Fetch stock, product config, and 90 days of orders in parallel
    const ninetyDaysAgo = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000
    ).toISOString();
    const [stock, productResult, orders] = await Promise.all([
      fetchStock(),
      db
        .from("products")
        .select("lead_time_days, reorder_threshold_days")
        .eq("slug", "hydro13")
        .single(),
      fetchOrdersFullSince(ninetyDaysAgo),
    ]);

    const leadTimeDays = productResult.data?.lead_time_days ?? 30;
    const reorderThresholdDays =
      productResult.data?.reorder_threshold_days ?? 14;

    // Calculate sell rates per SKU from line items
    const units7d = countUnitsSold(orders, 7);
    const units30d = countUnitsSold(orders, 30);
    const units90d = countUnitsSold(orders, 90);

    const daily7d = units7d / 7;
    const daily30d = units30d / 30;
    const daily90d = units90d / 90;

    // Use 30-day average as primary rate for forecasting
    const primaryRate = daily30d;

    // Days remaining
    const daysRemaining =
      primaryRate > 0 ? stock.disposable / primaryRate : null;

    // Reorder by date: today + (daysRemaining - leadTimeDays)
    let reorderByDate: string | null = null;
    if (daysRemaining !== null) {
      const daysUntilReorder = daysRemaining - leadTimeDays;
      const reorderDate = new Date(
        Date.now() + daysUntilReorder * 24 * 60 * 60 * 1000
      );
      reorderByDate = reorderDate.toISOString().slice(0, 10);
    }

    // Suggested order quantity: enough to cover lead time + safety buffer
    let suggestedOrderQty: number | null = null;
    if (primaryRate > 0) {
      const needed = primaryRate * (leadTimeDays + SAFETY_BUFFER_DAYS);
      suggestedOrderQty = Math.max(0, Math.ceil(needed - stock.disposable));
    }

    // Status
    let status: StockResponse["status"] = "unknown";
    if (daysRemaining !== null) {
      if (daysRemaining < leadTimeDays) {
        status = "critical";
      } else if (daysRemaining < leadTimeDays + reorderThresholdDays) {
        status = "warning";
      } else {
        status = "healthy";
      }
    }

    const dailyTimeseries = buildDailyTimeseries(orders);

    const result: StockResponse = {
      stock,
      sellRates: { daily7d, daily30d, daily90d, dailyTimeseries },
      daysRemaining,
      reorderByDate,
      suggestedOrderQty,
      status,
      leadTimeDays,
      reorderThresholdDays,
      updatedAt: new Date().toISOString(),
    };

    await setCache(CACHE_KEY, result, CACHE_TTL);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch stock data",
      },
      { status: 500 }
    );
  }
}
