import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export const maxDuration = 30;

interface AdRow {
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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Get the latest date with data
  const { data: latestRow } = await db
    .from("meta_ad_performance")
    .select("date")
    .order("date", { ascending: false })
    .limit(1)
    .single();

  if (!latestRow) {
    return NextResponse.json({ error: "No performance data yet. Run ad-performance-sync first." }, { status: 404 });
  }

  const latestDate = latestRow.date;

  // Pull last 14 days for trend comparison (7-day current vs 7-day previous)
  const fourteenDaysAgo = new Date(latestDate);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
  const sinceDate = fourteenDaysAgo.toISOString().slice(0, 10);

  const { data: allRows, error } = await db
    .from("meta_ad_performance")
    .select("*")
    .gte("date", sinceDate)
    .lte("date", latestDate)
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (allRows ?? []) as AdRow[];

  // Split into current 7 days and previous 7 days
  const sevenDaysAgo = new Date(latestDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const currentRows = rows.filter((r) => r.date >= sevenDaysAgoStr);
  const previousRows = rows.filter((r) => r.date < sevenDaysAgoStr);
  const latestRows = rows.filter((r) => r.date === latestDate);

  // ── Q1: Spend Pacing ──
  const spendByCampaign = new Map<string, { name: string; spend: number; ads: number }>();
  for (const r of latestRows) {
    const key = r.campaign_id ?? "unknown";
    const existing = spendByCampaign.get(key) ?? { name: r.campaign_name ?? "Unknown", spend: 0, ads: 0 };
    existing.spend += Number(r.spend);
    existing.ads += 1;
    spendByCampaign.set(key, existing);
  }

  const spendPacing = {
    date: latestDate,
    total_spend: round(sum(latestRows, "spend")),
    total_purchases: sum(latestRows, "purchases"),
    total_revenue: round(sum(latestRows, "purchase_value")),
    blended_roas: safeDiv(sum(latestRows, "purchase_value"), sum(latestRows, "spend")),
    campaigns: Array.from(spendByCampaign.entries()).map(([id, data]) => ({
      campaign_id: id,
      campaign_name: data.name,
      spend: round(data.spend),
      active_ads: data.ads,
    })).sort((a, b) => b.spend - a.spend),
  };

  // ── Q2: What's Running ──
  const whatsRunning = {
    date: latestDate,
    active_campaigns: spendByCampaign.size,
    total_active_ads: latestRows.length,
    campaigns: Array.from(spendByCampaign.entries()).map(([id, data]) => ({
      campaign_id: id,
      campaign_name: data.name,
      active_ads: data.ads,
    })),
  };

  // ── Q3: Performance Trends (7-day current vs 7-day previous) ──
  const campaignIds = new Set(currentRows.map((r) => r.campaign_id));
  const performanceTrends = Array.from(campaignIds).map((cid) => {
    const curr = currentRows.filter((r) => r.campaign_id === cid);
    const prev = previousRows.filter((r) => r.campaign_id === cid);
    const name = curr[0]?.campaign_name ?? "Unknown";

    const currSpend = sum(curr, "spend");
    const currRevenue = sum(curr, "purchase_value");
    const currPurchases = sum(curr, "purchases");
    const prevSpend = sum(prev, "spend");
    const prevRevenue = sum(prev, "purchase_value");
    const prevPurchases = sum(prev, "purchases");

    return {
      campaign_id: cid,
      campaign_name: name,
      current_7d: {
        spend: round(currSpend),
        revenue: round(currRevenue),
        purchases: currPurchases,
        roas: safeDiv(currRevenue, currSpend),
        cpa: safeDiv(currSpend, currPurchases),
        avg_ctr: round(avg(curr, "ctr"), 2),
        avg_cpc: round(avg(curr, "cpc"), 2),
        avg_frequency: round(avg(curr, "frequency"), 2),
      },
      previous_7d: {
        spend: round(prevSpend),
        revenue: round(prevRevenue),
        purchases: prevPurchases,
        roas: safeDiv(prevRevenue, prevSpend),
        cpa: safeDiv(prevSpend, prevPurchases),
        avg_ctr: round(avg(prev, "ctr"), 2),
        avg_cpc: round(avg(prev, "cpc"), 2),
        avg_frequency: round(avg(prev, "frequency"), 2),
      },
      trend: {
        roas: trendDirection(safeDiv(currRevenue, currSpend), safeDiv(prevRevenue, prevSpend)),
        cpa: trendDirection(safeDiv(currSpend, currPurchases), safeDiv(prevSpend, prevPurchases), true),
        spend: trendDirection(currSpend, prevSpend),
      },
    };
  }).sort((a, b) => b.current_7d.spend - a.current_7d.spend);

  // ── Q4: Winners & Losers (by ROAS, latest date, min spend threshold) ──
  const minSpendForRanking = 5; // ignore ads with < $5 spend
  const rankableAds = latestRows
    .filter((r) => Number(r.spend) >= minSpendForRanking)
    .map((r) => ({
      ad_id: r.meta_ad_id,
      ad_name: r.ad_name,
      adset_name: r.adset_name,
      campaign_name: r.campaign_name,
      spend: round(Number(r.spend)),
      purchases: Number(r.purchases),
      roas: Number(r.roas),
      cpa: Number(r.cpa),
      ctr: round(Number(r.ctr), 2),
      frequency: round(Number(r.frequency), 2),
    }));

  const sortedByRoas = [...rankableAds].sort((a, b) => b.roas - a.roas);
  const winners = sortedByRoas.slice(0, 5);
  const losers = sortedByRoas.slice(-5).reverse();

  // ── Q5: Fatigue Signals ──
  // Get per-ad daily data for the last 7 days to detect trends
  const adIds = new Set(currentRows.map((r) => r.meta_ad_id));
  const fatigueSignals: {
    critical: Array<{ ad_id: string; ad_name: string | null; campaign_name: string | null; signal: string; detail: string }>;
    warning: Array<{ ad_id: string; ad_name: string | null; campaign_name: string | null; signal: string; detail: string }>;
    monitor: Array<{ ad_id: string; ad_name: string | null; campaign_name: string | null; signal: string; detail: string }>;
  } = { critical: [], warning: [], monitor: [] };

  for (const adId of adIds) {
    const adDays = currentRows
      .filter((r) => r.meta_ad_id === adId)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (adDays.length < 3) continue;

    const adName = adDays[adDays.length - 1].ad_name;
    const campaignName = adDays[adDays.length - 1].campaign_name;
    const ctrs = adDays.map((r) => Number(r.ctr));
    const cpcs = adDays.map((r) => Number(r.cpc));
    const impressions = adDays.map((r) => Number(r.impressions));
    const latestFreq = Number(adDays[adDays.length - 1].frequency);

    // Critical: CTR dropping 3+ consecutive days, >20% from peak
    const peakCtr = Math.max(...ctrs);
    const lastCtr = ctrs[ctrs.length - 1];
    const ctrDropping = isConsecutivelyDropping(ctrs, 3);
    const ctrDeclinePct = peakCtr > 0 ? ((peakCtr - lastCtr) / peakCtr) * 100 : 0;

    if (ctrDropping && ctrDeclinePct > 20) {
      fatigueSignals.critical.push({
        ad_id: adId,
        ad_name: adName,
        campaign_name: campaignName,
        signal: "CTR declining 3+ days",
        detail: `CTR dropped ${round(ctrDeclinePct, 1)}% from peak (${round(peakCtr, 2)}% → ${round(lastCtr, 2)}%)`,
      });
    }

    // Warning: Frequency > 3.5
    if (latestFreq > 3.5) {
      fatigueSignals.warning.push({
        ad_id: adId,
        ad_name: adName,
        campaign_name: campaignName,
        signal: "High frequency",
        detail: `Frequency ${round(latestFreq, 2)} (threshold: 3.5)`,
      });
    }

    // Warning: CPC rising 3+ consecutive days, >15% from baseline
    const cpcRising = isConsecutivelyRising(cpcs, 3);
    const baselineCpc = cpcs[0];
    const lastCpc = cpcs[cpcs.length - 1];
    const cpcIncreasePct = baselineCpc > 0 ? ((lastCpc - baselineCpc) / baselineCpc) * 100 : 0;

    if (cpcRising && cpcIncreasePct > 15) {
      fatigueSignals.warning.push({
        ad_id: adId,
        ad_name: adName,
        campaign_name: campaignName,
        signal: "CPC rising 3+ days",
        detail: `CPC up ${round(cpcIncreasePct, 1)}% from baseline ($${round(baselineCpc, 2)} → $${round(lastCpc, 2)})`,
      });
    }

    // Monitor: Impressions declining 3+ consecutive days
    const impDropping = isConsecutivelyDropping(impressions, 3);
    if (impDropping) {
      fatigueSignals.monitor.push({
        ad_id: adId,
        ad_name: adName,
        campaign_name: campaignName,
        signal: "Impressions declining",
        detail: `${impressions[impressions.length - 3]} → ${impressions[impressions.length - 1]} over 3 days`,
      });
    }
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    data_date: latestDate,
    questions: {
      spend_pacing: spendPacing,
      whats_running: whatsRunning,
      performance_trends: performanceTrends,
      winners_losers: { winners, losers },
      fatigue_signals: fatigueSignals,
    },
  });
}

// ── Helpers ──

function sum(rows: AdRow[], field: keyof AdRow): number {
  return rows.reduce((acc, r) => acc + Number(r[field] ?? 0), 0);
}

function avg(rows: AdRow[], field: keyof AdRow): number {
  if (rows.length === 0) return 0;
  return sum(rows, field) / rows.length;
}

function round(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function safeDiv(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return round(numerator / denominator);
}

function trendDirection(current: number, previous: number, lowerIsBetter = false): "up" | "down" | "stable" {
  if (previous === 0) return "stable";
  const changePct = ((current - previous) / previous) * 100;
  if (Math.abs(changePct) < 5) return "stable";
  const isUp = changePct > 0;
  if (lowerIsBetter) return isUp ? "down" : "up"; // for CPA, lower is better
  return isUp ? "up" : "down";
}

/** Check if the last N values in an array are consecutively dropping */
function isConsecutivelyDropping(values: number[], minConsecutive: number): boolean {
  if (values.length < minConsecutive + 1) return false;
  let consecutive = 0;
  for (let i = values.length - 1; i > 0; i--) {
    if (values[i] < values[i - 1]) {
      consecutive++;
      if (consecutive >= minConsecutive) return true;
    } else {
      break;
    }
  }
  return false;
}

/** Check if the last N values in an array are consecutively rising */
function isConsecutivelyRising(values: number[], minConsecutive: number): boolean {
  if (values.length < minConsecutive + 1) return false;
  let consecutive = 0;
  for (let i = values.length - 1; i > 0; i--) {
    if (values[i] > values[i - 1]) {
      consecutive++;
      if (consecutive >= minConsecutive) return true;
    } else {
      break;
    }
  }
  return false;
}
