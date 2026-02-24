import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { fetchAllGA4Metrics } from "@/lib/ga4";
import { fetchClarityInsights } from "@/lib/clarity";
import { getOrdersByPage } from "@/lib/shopify";

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
  const clarityToken = settings.clarity_api_token as string | undefined;

  const errors: Record<string, string> = {};

  // Fetch all sources in parallel
  const [ga4Result, clarityResult, shopifyResult] = await Promise.allSettled([
    Object.keys(ga4PropertyIds).length > 0
      ? fetchAllGA4Metrics(ga4PropertyIds, days)
      : Promise.resolve(new Map()),
    clarityToken
      ? fetchClarityInsights(clarityToken, Math.min(days, 3))
      : Promise.resolve([]),
    getOrdersByPage(new Date(Date.now() - days * 86400000).toISOString()),
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

  return NextResponse.json({ ga4, clarity, shopify, errors, days });
}
