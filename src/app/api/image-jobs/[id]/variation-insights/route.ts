import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { getAdInsightsForIds } from "@/lib/meta";

export const maxDuration = 60;

// GET /api/image-jobs/[id]/variation-insights — on-demand variation performance from Meta
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Get all pushed meta_ads for this concept
  const { data: campaigns } = await db
    .from("meta_campaigns")
    .select("id, language, meta_ads(id, meta_ad_id, variation_index, ad_copy, headline)")
    .eq("image_job_id", jobId)
    .in("status", ["pushed"]);

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ variations: [] });
  }

  // Collect all meta_ad_ids we need insights for
  const adMap = new Map<string, { variation_index: number; ad_copy: string; headline: string }>();
  for (const campaign of campaigns) {
    for (const ad of (campaign.meta_ads ?? []) as Array<{
      meta_ad_id: string | null;
      variation_index: number | null;
      ad_copy: string | null;
      headline: string | null;
    }>) {
      if (ad.meta_ad_id) {
        adMap.set(ad.meta_ad_id, {
          variation_index: ad.variation_index ?? 0,
          ad_copy: ad.ad_copy ?? "",
          headline: ad.headline ?? "",
        });
      }
    }
  }

  if (adMap.size === 0) {
    return NextResponse.json({ variations: [] });
  }

  // Fetch insights from Meta for these specific ads (last 30 days)
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);

  let insights;
  try {
    insights = await getAdInsightsForIds([...adMap.keys()], since, until);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch Meta insights: ${err instanceof Error ? err.message : "Unknown"}` },
      { status: 502 }
    );
  }

  // Aggregate by variation_index
  const variationAgg = new Map<number, {
    variation_index: number;
    ad_copy: string;
    headline: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    ad_count: number;
  }>();

  // Initialize with ad counts
  for (const [, info] of adMap) {
    const vi = info.variation_index;
    if (!variationAgg.has(vi)) {
      variationAgg.set(vi, {
        variation_index: vi,
        ad_copy: info.ad_copy,
        headline: info.headline,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        ad_count: 0,
      });
    }
    variationAgg.get(vi)!.ad_count++;
  }

  // Sum insights
  for (const row of insights) {
    const adInfo = adMap.get(row.ad_id);
    if (!adInfo) continue;
    const vi = adInfo.variation_index;
    const agg = variationAgg.get(vi);
    if (!agg) continue;

    agg.spend += parseFloat(row.spend) || 0;
    agg.impressions += parseInt(row.impressions) || 0;
    agg.clicks += parseInt(row.clicks) || 0;

    if (row.actions) {
      for (const action of row.actions) {
        if (action.action_type === "purchase" || action.action_type === "omni_purchase") {
          agg.conversions += parseInt(action.value) || 0;
        }
      }
    }
    if (row.action_values) {
      for (const av of row.action_values) {
        if (av.action_type === "purchase" || av.action_type === "omni_purchase") {
          agg.revenue += parseFloat(av.value) || 0;
        }
      }
    }
  }

  // Compute derived metrics
  const variations = [...variationAgg.values()]
    .map((v) => ({
      ...v,
      ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
      cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
      cpa: v.conversions > 0 ? v.spend / v.conversions : 0,
      roas: v.spend > 0 ? v.revenue / v.spend : null,
    }))
    .sort((a, b) => a.variation_index - b.variation_index);

  return NextResponse.json({ variations });
}
