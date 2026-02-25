import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { fetchAllGA4Metrics, fetchTrafficSourcesByPage } from "@/lib/ga4";
import { fetchClarityInsights } from "@/lib/clarity";
import { getOrdersByPage, getRatesToUSD } from "@/lib/shopify";
import { getMetaMetricsByPage } from "@/lib/analytics";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "7", 10);

  const db = createServerSupabase();
  const { data: settingsRow } = await db
    .from("app_settings")
    .select("settings")
    .limit(1)
    .single();
  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;

  const ga4PropertyIds = (settings.ga4_property_ids ?? {}) as Record<string, string>;
  const legacyPropertyId = settings.ga4_legacy_property_id as string | undefined;
  const clarityToken = settings.clarity_api_token as string | undefined;

  const errors: Record<string, string> = {};

  const hasGA4 = Object.keys(ga4PropertyIds).length > 0;
  const legacyIds = legacyPropertyId ? [legacyPropertyId] : undefined;

  // Fetch all sources in parallel
  const [ga4Result, clarityResult, shopifyResult, metaResult, trafficResult] = await Promise.allSettled([
    hasGA4
      ? fetchAllGA4Metrics(ga4PropertyIds, days, legacyIds)
      : Promise.resolve(new Map()),
    clarityToken
      ? fetchClarityInsights(clarityToken, Math.min(days, 3))
      : Promise.resolve([]),
    getOrdersByPage(new Date(Date.now() - days * 86400000).toISOString()),
    getMetaMetricsByPage(days),
    hasGA4
      ? fetchTrafficSourcesByPage(ga4PropertyIds, days, legacyIds)
      : Promise.resolve(new Map()),
  ]);

  // Process GA4
  const ga4: Record<string, { screenPageViews: number; sessions: number; totalUsers: number; bounceRate: number; averageSessionDuration: number; engagementRate: number; conversions: number }> = {};
  if (ga4Result.status === "fulfilled") {
    for (const [key, metrics] of ga4Result.value) {
      ga4[key] = metrics;
    }
  } else {
    errors.ga4 = ga4Result.reason?.message ?? "GA4 fetch failed";
  }

  // Process Clarity
  let clarity: Array<{ url: string; totalSessionCount: number; scrollDepth: number; activeTime: number; deadClickCount: number; rageClickCount: number; quickbackClickCount: number; excessiveScrollCount: number }> = [];
  if (clarityResult.status === "fulfilled") {
    clarity = clarityResult.value;
  } else {
    errors.clarity = clarityResult.reason?.message ?? "Clarity fetch failed";
  }

  // Process Shopify
  const shopify: Record<string, { orders: number; revenue: number; currency: string }> = {};
  if (shopifyResult.status === "fulfilled") {
    for (const [slug, data] of shopifyResult.value) {
      shopify[slug] = data;
    }
  } else {
    errors.shopify = shopifyResult.reason?.message ?? "Shopify fetch failed";
  }

  // Process Meta
  const meta: Record<string, { spend: number; clicks: number; impressions: number }> = {};
  if (metaResult.status === "fulfilled") {
    for (const [slug, data] of metaResult.value) {
      meta[slug] = data;
    }
  } else if (metaResult.reason?.message !== "Not configured") {
    errors.meta = metaResult.reason?.message ?? "Meta fetch failed";
  }

  // Process traffic sources
  const trafficSources: Record<string, { paid: number; organic: number; direct: number; other: number }> = {};
  if (trafficResult.status === "fulfilled") {
    for (const [key, sources] of trafficResult.value) {
      trafficSources[key] = sources;
    }
  }

  // Include live exchange rates for client-side ROAS calculation
  const rates = await getRatesToUSD();

  return NextResponse.json({ ga4, clarity, shopify, meta, trafficSources, errors, days, rates });
}
