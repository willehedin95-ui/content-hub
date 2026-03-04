import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export const maxDuration = 30;

// ── Types ──

interface PerfRow {
  date: string;
  meta_ad_id: string;
  ad_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  purchases: number;
  purchase_value: number;
  roas: number;
  cpa: number;
}

interface MetaAdCreative {
  meta_ad_id: string;
  headline: string | null;
  ad_copy: string | null;
  image_url: string | null;
}

// ── GET handler ──

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(90, parseInt(searchParams.get("days") ?? "7") || 7));
  const country = (searchParams.get("country") ?? "all").toUpperCase();

  const db = createServerSupabase();

  // Determine latest date with data
  const { data: latestRow } = await db
    .from("meta_ad_performance")
    .select("date")
    .order("date", { ascending: false })
    .limit(1)
    .single();

  if (!latestRow) {
    return NextResponse.json({
      kpis: null,
      campaigns: [],
      creative_breakdown: { headlines: [], copies: [], images: [] },
    });
  }

  const latestDate = latestRow.date as string;

  // Compute current period: [latestDate - days + 1, latestDate]
  const currentStart = new Date(latestDate);
  currentStart.setDate(currentStart.getDate() - days + 1);
  const currentStartStr = currentStart.toISOString().slice(0, 10);

  // Previous period: [currentStart - days, currentStart - 1]
  const prevEnd = new Date(currentStart);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days + 1);
  const prevStartStr = prevStart.toISOString().slice(0, 10);
  const prevEndStr = prevEnd.toISOString().slice(0, 10);

  // Fetch all rows covering both periods in one query
  const { data: allRows, error } = await db
    .from("meta_ad_performance")
    .select("*")
    .gte("date", prevStartStr)
    .lte("date", latestDate)
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = (allRows ?? []) as PerfRow[];

  // Country filter: match campaign_name prefix (e.g. "SE ", "NO ", "DK ")
  if (country !== "ALL") {
    const prefix = country + " ";
    rows = rows.filter((r) => r.campaign_name?.startsWith(prefix));
  }

  // Split into current and previous periods
  const currentRows = rows.filter((r) => r.date >= currentStartStr && r.date <= latestDate);
  const previousRows = rows.filter((r) => r.date >= prevStartStr && r.date <= prevEndStr);

  // ── KPIs ──
  const currSpend = sum(currentRows, "spend");
  const currRevenue = sum(currentRows, "purchase_value");
  const currPurchases = sum(currentRows, "purchases");
  const currRoas = currSpend > 0 ? round(currRevenue / currSpend) : 0;
  const currCpa = currPurchases > 0 ? round(currSpend / currPurchases) : 0;

  const prevSpend = sum(previousRows, "spend");
  const prevRevenue = sum(previousRows, "purchase_value");
  const prevPurchases = sum(previousRows, "purchases");
  const prevRoas = prevSpend > 0 ? round(prevRevenue / prevSpend) : 0;
  const prevCpa = prevPurchases > 0 ? round(prevSpend / prevPurchases) : 0;

  // Build daily sparklines from current period
  const dailyMap = new Map<string, { spend: number; revenue: number; purchases: number; impressions: number; clicks: number }>();
  for (const r of currentRows) {
    const day = dailyMap.get(r.date) ?? { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 };
    day.spend += Number(r.spend);
    day.revenue += Number(r.purchase_value);
    day.purchases += Number(r.purchases);
    day.impressions += Number(r.impressions);
    day.clicks += Number(r.clicks);
    dailyMap.set(r.date, day);
  }

  const sparklines = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      spend: round(d.spend),
      revenue: round(d.revenue),
      roas: d.spend > 0 ? round(d.revenue / d.spend) : 0,
      cpa: d.purchases > 0 ? round(d.spend / d.purchases) : 0,
      purchases: d.purchases,
    }));

  const kpis = {
    spend: { value: round(currSpend), change: pctChange(currSpend, prevSpend) },
    revenue: { value: round(currRevenue), change: pctChange(currRevenue, prevRevenue) },
    roas: { value: currRoas, change: pctChange(currRoas, prevRoas) },
    cpa: { value: currCpa, change: pctChange(currCpa, prevCpa) },
    purchases: { value: currPurchases, change: pctChange(currPurchases, prevPurchases) },
    sparklines,
  };

  // ── Campaign table ──
  const campaignMap = new Map<
    string,
    {
      campaign_name: string;
      spend: number;
      impressions: number;
      clicks: number;
      purchases: number;
      revenue: number;
      frequency_sum: number;
      frequency_count: number;
      adset_ids: Set<string>;
    }
  >();

  for (const r of currentRows) {
    const cid = r.campaign_id ?? "unknown";
    const existing = campaignMap.get(cid) ?? {
      campaign_name: r.campaign_name ?? "Unknown",
      spend: 0,
      impressions: 0,
      clicks: 0,
      purchases: 0,
      revenue: 0,
      frequency_sum: 0,
      frequency_count: 0,
      adset_ids: new Set<string>(),
    };
    existing.spend += Number(r.spend);
    existing.impressions += Number(r.impressions);
    existing.clicks += Number(r.clicks);
    existing.purchases += Number(r.purchases);
    existing.revenue += Number(r.purchase_value);
    existing.frequency_sum += Number(r.frequency);
    existing.frequency_count += 1;
    if (r.adset_id) existing.adset_ids.add(r.adset_id);
    campaignMap.set(cid, existing);
  }

  const campaigns = Array.from(campaignMap.entries())
    .map(([campaign_id, c]) => ({
      campaign_id,
      campaign_name: c.campaign_name,
      spend: round(c.spend),
      impressions: c.impressions,
      clicks: c.clicks,
      ctr: c.impressions > 0 ? round((c.clicks / c.impressions) * 100, 2) : 0,
      cpc: c.clicks > 0 ? round(c.spend / c.clicks) : 0,
      purchases: c.purchases,
      revenue: round(c.revenue),
      roas: c.spend > 0 ? round(c.revenue / c.spend) : 0,
      cpa: c.purchases > 0 ? round(c.spend / c.purchases) : 0,
      frequency: c.frequency_count > 0 ? round(c.frequency_sum / c.frequency_count, 2) : 0,
      adset_ids: Array.from(c.adset_ids),
    }))
    .sort((a, b) => b.spend - a.spend);

  // ── Creative breakdown ──
  // Collect unique ad IDs from the current period
  const adIds = [...new Set(currentRows.map((r) => r.meta_ad_id))];

  // Fetch creative data from meta_ads table
  let creativeMap = new Map<string, MetaAdCreative>();
  if (adIds.length > 0) {
    // Supabase .in() has a limit; batch in groups of 300
    const BATCH = 300;
    for (let i = 0; i < adIds.length; i += BATCH) {
      const batch = adIds.slice(i, i + BATCH);
      const { data: ads } = await db
        .from("meta_ads")
        .select("meta_ad_id, headline, ad_copy, image_url")
        .in("meta_ad_id", batch);

      if (ads) {
        for (const ad of ads as MetaAdCreative[]) {
          if (ad.meta_ad_id) {
            creativeMap.set(ad.meta_ad_id, ad);
          }
        }
      }
    }
  }

  // Build per-ad performance totals for current period
  const adPerfMap = new Map<
    string,
    { spend: number; revenue: number; purchases: number; impressions: number; clicks: number }
  >();
  for (const r of currentRows) {
    const existing = adPerfMap.get(r.meta_ad_id) ?? {
      spend: 0,
      revenue: 0,
      purchases: 0,
      impressions: 0,
      clicks: 0,
    };
    existing.spend += Number(r.spend);
    existing.revenue += Number(r.purchase_value);
    existing.purchases += Number(r.purchases);
    existing.impressions += Number(r.impressions);
    existing.clicks += Number(r.clicks);
    adPerfMap.set(r.meta_ad_id, existing);
  }

  // Aggregate by headline
  const headlineAgg = new Map<
    string,
    { spend: number; revenue: number; purchases: number; impressions: number; clicks: number }
  >();
  const copyAgg = new Map<
    string,
    { spend: number; revenue: number; purchases: number; impressions: number; clicks: number }
  >();
  const imageAgg = new Map<
    string,
    { spend: number; revenue: number; purchases: number; impressions: number; clicks: number }
  >();

  for (const [adId, perf] of adPerfMap) {
    const creative = creativeMap.get(adId);
    if (!creative) continue;

    if (creative.headline) {
      const existing = headlineAgg.get(creative.headline) ?? { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 };
      existing.spend += perf.spend;
      existing.revenue += perf.revenue;
      existing.purchases += perf.purchases;
      existing.impressions += perf.impressions;
      existing.clicks += perf.clicks;
      headlineAgg.set(creative.headline, existing);
    }

    if (creative.ad_copy) {
      const existing = copyAgg.get(creative.ad_copy) ?? { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 };
      existing.spend += perf.spend;
      existing.revenue += perf.revenue;
      existing.purchases += perf.purchases;
      existing.impressions += perf.impressions;
      existing.clicks += perf.clicks;
      copyAgg.set(creative.ad_copy, existing);
    }

    if (creative.image_url) {
      const existing = imageAgg.get(creative.image_url) ?? { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 };
      existing.spend += perf.spend;
      existing.revenue += perf.revenue;
      existing.purchases += perf.purchases;
      existing.impressions += perf.impressions;
      existing.clicks += perf.clicks;
      imageAgg.set(creative.image_url, existing);
    }
  }

  const formatBreakdown = (
    agg: Map<string, { spend: number; revenue: number; purchases: number; impressions: number; clicks: number }>,
    keyName: string,
  ) =>
    Array.from(agg.entries())
      .map(([key, d]) => ({
        [keyName]: key,
        spend: round(d.spend),
        revenue: round(d.revenue),
        roas: d.spend > 0 ? round(d.revenue / d.spend) : 0,
        purchases: d.purchases,
        ctr: d.impressions > 0 ? round((d.clicks / d.impressions) * 100, 2) : 0,
      }))
      .sort((a, b) => b.roas - a.roas);

  const creative_breakdown = {
    headlines: formatBreakdown(headlineAgg, "headline"),
    copies: formatBreakdown(copyAgg, "copy"),
    images: formatBreakdown(imageAgg, "image_url"),
  };

  return NextResponse.json({ kpis, campaigns, creative_breakdown });
}

// ── Helpers ──

function sum(rows: PerfRow[], field: keyof PerfRow): number {
  return rows.reduce((acc, r) => acc + Number(r[field] ?? 0), 0);
}

function round(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

/** Percentage change: null when previous period has no data */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round(((current - previous) / previous) * 100, 1);
}
