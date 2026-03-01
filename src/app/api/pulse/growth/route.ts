import { NextResponse } from "next/server";
import { fetchAnalyticsSummary } from "@/lib/analytics";
import { getCached, setCache } from "@/lib/pulse-cache";

// ---- Types ----

interface GrowthPeriod {
  revenue: number;
  orders: number;
  aov: number;
  currency: string;
  metaSpend?: number;
  googleSpend?: number;
  totalSpend?: number;
  roas?: number | null;
}

export interface GrowthData {
  today: GrowthPeriod;
  week: GrowthPeriod;
  month: GrowthPeriod;
  errors?: { meta?: string; shopify?: string; googleAds?: string };
}

// ---- Route ----

const CACHE_KEY = "pulse:growth";
const CACHE_TTL = 15; // minutes

export async function GET() {
  try {
    // Check cache first
    const cached = await getCached<GrowthData>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch all three time ranges in parallel
    const [day1, day7, day30] = await Promise.all([
      fetchAnalyticsSummary(1),
      fetchAnalyticsSummary(7),
      fetchAnalyticsSummary(30),
    ]);

    // Merge errors from all three fetches (deduplicated)
    const errors: { meta?: string; shopify?: string; googleAds?: string } = {};
    for (const summary of [day1, day7, day30]) {
      if (summary.errors?.meta && !errors.meta) errors.meta = summary.errors.meta;
      if (summary.errors?.shopify && !errors.shopify) errors.shopify = summary.errors.shopify;
      if (summary.errors?.googleAds && !errors.googleAds) errors.googleAds = summary.errors.googleAds;
    }

    const result: GrowthData = {
      today: {
        revenue: day1.shopify?.revenue ?? 0,
        orders: day1.shopify?.orders ?? 0,
        aov: day1.shopify?.avgOrderValue ?? 0,
        currency: day1.shopify?.currency ?? "SEK",
      },
      week: {
        revenue: day7.shopify?.revenue ?? 0,
        orders: day7.shopify?.orders ?? 0,
        aov: day7.shopify?.avgOrderValue ?? 0,
        currency: day7.shopify?.currency ?? "SEK",
        metaSpend: day7.meta?.spend ?? 0,
        googleSpend: day7.googleAds?.spend ?? 0,
        totalSpend: day7.totalAdSpend,
        roas: day7.roas,
      },
      month: {
        revenue: day30.shopify?.revenue ?? 0,
        orders: day30.shopify?.orders ?? 0,
        aov: day30.shopify?.avgOrderValue ?? 0,
        currency: day30.shopify?.currency ?? "SEK",
        metaSpend: day30.meta?.spend ?? 0,
        googleSpend: day30.googleAds?.spend ?? 0,
        totalSpend: day30.totalAdSpend,
        roas: day30.roas,
      },
      ...(Object.keys(errors).length > 0 ? { errors } : {}),
    };

    // Cache for 15 minutes
    await setCache(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch growth data" },
      { status: 500 }
    );
  }
}
