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
  // Auth: accept CRON_SECRET bearer token (cron callers) or valid Supabase session (browser)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (authHeader) {
    // Cron/API caller — verify bearer token
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // Browser caller — verify session (route is middleware-exempted)
    const { createServerClient } = await import("@supabase/ssr");
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll() {
            // no-op — read-only check
          },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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

  // ── Q6: Bleeder Detection ──
  // Ads spending heavily with bad results for 2+ consecutive days
  const bleeders: Array<{
    ad_id: string;
    ad_name: string | null;
    adset_name: string | null;
    campaign_name: string | null;
    days_bleeding: number;
    total_spend: number;
    purchases: number;
    avg_cpa: number;
    campaign_avg_cpa: number;
    avg_ctr: number;
  }> = [];

  // Compute campaign-level average CPA for baseline
  const campaignCpa = new Map<string, number>();
  for (const cid of campaignIds) {
    const campRows = currentRows.filter((r) => r.campaign_id === cid);
    const campSpend = sum(campRows, "spend");
    const campPurchases = sum(campRows, "purchases");
    campaignCpa.set(cid ?? "unknown", campPurchases > 0 ? campSpend / campPurchases : 0);
  }

  for (const adId of adIds) {
    const adDays = currentRows
      .filter((r) => r.meta_ad_id === adId)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (adDays.length < 2) continue;

    const adName = adDays[adDays.length - 1].ad_name;
    const adsetName = adDays[adDays.length - 1].adset_name;
    const campaignName = adDays[adDays.length - 1].campaign_name;
    const campId = adDays[adDays.length - 1].campaign_id ?? "unknown";
    const baseCpa = campaignCpa.get(campId) ?? 0;

    if (baseCpa === 0) continue; // can't assess without campaign baseline

    // Count consecutive bleeding days from the end
    let bleedingDays = 0;
    for (let i = adDays.length - 1; i >= 0; i--) {
      const day = adDays[i];
      const daySpend = Number(day.spend);
      const dayPurchases = Number(day.purchases);
      const dayCtr = Number(day.ctr);
      const dayCpa = dayPurchases > 0 ? daySpend / dayPurchases : Infinity;

      // Bleeding: spending with either no purchases or CPA > 2.5x campaign avg, AND CTR < 1%
      if (daySpend > 5 && (dayCpa > baseCpa * 2.5 || dayPurchases === 0) && dayCtr < 1) {
        bleedingDays++;
      } else {
        break;
      }
    }

    if (bleedingDays >= 2) {
      const recentDays = adDays.slice(-bleedingDays);
      const totalSpend = recentDays.reduce((s, r) => s + Number(r.spend), 0);
      const totalPurchases = recentDays.reduce((s, r) => s + Number(r.purchases), 0);
      bleeders.push({
        ad_id: adId,
        ad_name: adName,
        adset_name: adsetName,
        campaign_name: campaignName,
        days_bleeding: bleedingDays,
        total_spend: round(totalSpend),
        purchases: totalPurchases,
        avg_cpa: totalPurchases > 0 ? round(totalSpend / totalPurchases) : 0,
        campaign_avg_cpa: round(baseCpa),
        avg_ctr: round(avg(recentDays, "ctr"), 2),
      });
    }
  }

  bleeders.sort((a, b) => b.total_spend - a.total_spend);

  // ── Q7: Winner Detection ──
  // Ads performing consistently well over 5+ days
  const winnerAds: Array<{
    ad_id: string;
    adset_id: string | null;
    campaign_id: string;
    ad_name: string | null;
    adset_name: string | null;
    campaign_name: string | null;
    consistent_days: number;
    total_spend: number;
    total_purchases: number;
    avg_roas: number;
    avg_cpa: number;
    avg_ctr: number;
  }> = [];

  for (const adId of adIds) {
    const adDays = currentRows
      .filter((r) => r.meta_ad_id === adId)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (adDays.length < 5) continue;

    const adName = adDays[adDays.length - 1].ad_name;
    const adsetId = adDays[adDays.length - 1].adset_id;
    const adsetName = adDays[adDays.length - 1].adset_name;
    const campaignName = adDays[adDays.length - 1].campaign_name;
    const campId = adDays[adDays.length - 1].campaign_id ?? "unknown";
    const baseCpa = campaignCpa.get(campId) ?? 0;

    // Count consecutive winning days from the end
    let winningDays = 0;
    for (let i = adDays.length - 1; i >= 0; i--) {
      const day = adDays[i];
      const daySpend = Number(day.spend);
      const dayPurchases = Number(day.purchases);
      const dayCtr = Number(day.ctr);
      const dayRoas = Number(day.roas);

      // Winning: has purchases, ROAS > 1, CTR > 1%, and CPA at or below campaign average
      const dayCpa = dayPurchases > 0 ? daySpend / dayPurchases : Infinity;
      if (dayPurchases > 0 && dayRoas > 1 && dayCtr > 1 && (baseCpa === 0 || dayCpa <= baseCpa)) {
        winningDays++;
      } else {
        break;
      }
    }

    if (winningDays >= 5) {
      const recentDays = adDays.slice(-winningDays);
      const totalSpend = recentDays.reduce((s, r) => s + Number(r.spend), 0);
      const totalPurchases = recentDays.reduce((s, r) => s + Number(r.purchases), 0);
      const totalRevenue = recentDays.reduce((s, r) => s + Number(r.purchase_value), 0);
      winnerAds.push({
        ad_id: adId,
        adset_id: adsetId,
        campaign_id: campId,
        ad_name: adName,
        adset_name: adsetName,
        campaign_name: campaignName,
        consistent_days: winningDays,
        total_spend: round(totalSpend),
        total_purchases: totalPurchases,
        avg_roas: totalSpend > 0 ? round(totalRevenue / totalSpend) : 0,
        avg_cpa: totalPurchases > 0 ? round(totalSpend / totalPurchases) : 0,
        avg_ctr: round(avg(recentDays, "ctr"), 2),
      });
    }
  }

  winnerAds.sort((a, b) => b.avg_roas - a.avg_roas);

  // Enrich winners with image_job_id for iteration links
  const winnerAdsetIds = winnerAds.map((w) => w.adset_id).filter(Boolean) as string[];
  const adsetToImageJob = new Map<string, string>();
  if (winnerAdsetIds.length > 0) {
    const { data: campaigns } = await db
      .from("meta_campaigns")
      .select("meta_adset_id, image_job_id")
      .in("meta_adset_id", winnerAdsetIds);
    for (const c of campaigns ?? []) {
      if (c.meta_adset_id && c.image_job_id) {
        adsetToImageJob.set(c.meta_adset_id, c.image_job_id);
      }
    }
  }
  const enrichedWinners = winnerAds.map((w) => ({
    ...w,
    image_job_id: (w.adset_id && adsetToImageJob.get(w.adset_id)) || null,
  }));

  // ── Q8: LP vs Creative Fatigue ──
  // If CTR is stable/rising but CPA is rising → landing page problem, not creative
  const lpFatigueSignals: Array<{
    ad_id: string;
    ad_name: string | null;
    adset_name: string | null;
    campaign_name: string | null;
    diagnosis: "landing_page" | "creative";
    detail: string;
  }> = [];

  for (const adId of adIds) {
    const adDays = currentRows
      .filter((r) => r.meta_ad_id === adId)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (adDays.length < 4) continue;

    const adName = adDays[adDays.length - 1].ad_name;
    const adsetName = adDays[adDays.length - 1].adset_name;
    const campaignName = adDays[adDays.length - 1].campaign_name;

    // Only analyze ads with purchases (can't compute CPA without them)
    const daysWithPurchases = adDays.filter((r) => Number(r.purchases) > 0);
    if (daysWithPurchases.length < 3) continue;

    const ctrs = adDays.map((r) => Number(r.ctr));
    const cpas = adDays.map((r) => {
      const spend = Number(r.spend);
      const purchases = Number(r.purchases);
      return purchases > 0 ? spend / purchases : null;
    }).filter((v): v is number => v !== null);

    if (cpas.length < 3) continue;

    const ctrDropping = isConsecutivelyDropping(ctrs, 3);
    const cpaRising = isConsecutivelyRising(cpas, 3);

    const firstCtr = ctrs[0];
    const lastCtr = ctrs[ctrs.length - 1];
    const ctrChangePct = firstCtr > 0 ? ((lastCtr - firstCtr) / firstCtr) * 100 : 0;

    const firstCpa = cpas[0];
    const lastCpa = cpas[cpas.length - 1];
    const cpaChangePct = firstCpa > 0 ? ((lastCpa - firstCpa) / firstCpa) * 100 : 0;

    // LP fatigue: CTR stable or rising (not dropping >10%) but CPA rising >20%
    if (!ctrDropping && Math.abs(ctrChangePct) < 15 && cpaRising && cpaChangePct > 20) {
      lpFatigueSignals.push({
        ad_id: adId,
        ad_name: adName,
        adset_name: adsetName,
        campaign_name: campaignName,
        diagnosis: "landing_page",
        detail: `CTR stable (${round(firstCtr, 2)}% → ${round(lastCtr, 2)}%) but CPA rising ${round(cpaChangePct, 0)}% ($${round(firstCpa, 0)} → $${round(lastCpa, 0)})`,
      });
    }

    // Creative fatigue: CTR dropping AND CPA rising
    if (ctrDropping && cpaRising && ctrChangePct < -15 && cpaChangePct > 15) {
      lpFatigueSignals.push({
        ad_id: adId,
        ad_name: adName,
        adset_name: adsetName,
        campaign_name: campaignName,
        diagnosis: "creative",
        detail: `CTR dropping ${round(Math.abs(ctrChangePct), 0)}% (${round(firstCtr, 2)}% → ${round(lastCtr, 2)}%) and CPA rising ${round(cpaChangePct, 0)}% ($${round(firstCpa, 0)} → $${round(lastCpa, 0)})`,
      });
    }
  }

  // ── Q9: Efficiency Scoring ──
  // Per-campaign CTR/CPC efficiency ratio + budget shift recommendations
  const efficiencyScores = Array.from(campaignIds).map((cid) => {
    const campRows = currentRows.filter((r) => r.campaign_id === cid);
    const name = campRows[0]?.campaign_name ?? "Unknown";
    const campSpend = sum(campRows, "spend");
    const campRevenue = sum(campRows, "purchase_value");
    const campPurchases = sum(campRows, "purchases");
    const avgCtr = avg(campRows, "ctr");
    const avgCpc = avg(campRows, "cpc");
    const roas = campSpend > 0 ? campRevenue / campSpend : 0;

    // Efficiency = CTR / CPC — higher means more clicks per dollar
    const efficiency = avgCpc > 0 ? avgCtr / avgCpc : 0;

    return {
      campaign_id: cid,
      campaign_name: name,
      spend_7d: round(campSpend),
      roas_7d: round(roas),
      avg_ctr: round(avgCtr, 2),
      avg_cpc: round(avgCpc, 2),
      purchases_7d: campPurchases,
      efficiency_score: round(efficiency, 3),
    };
  }).sort((a, b) => b.efficiency_score - a.efficiency_score);

  // Compute budget recommendation tiers
  const totalEfficiency = efficiencyScores.reduce((s, c) => s + c.efficiency_score, 0);
  const efficiencyWithRecommendation = efficiencyScores.map((c, i) => {
    const share = totalEfficiency > 0 ? c.efficiency_score / totalEfficiency : 1 / efficiencyScores.length;
    // Cap recommendations at 30% max shift from current
    const currentShare = c.spend_7d / Math.max(efficiencyScores.reduce((s, x) => s + x.spend_7d, 0), 1);
    const rawRecommended = share;
    const cappedRecommended = Math.min(rawRecommended, currentShare + 0.30);
    const finalRecommended = Math.max(cappedRecommended, currentShare - 0.30);

    return {
      ...c,
      current_budget_share: round(currentShare * 100, 1),
      recommended_budget_share: round(finalRecommended * 100, 1),
      recommendation: finalRecommended > currentShare + 0.02 ? "increase" as const :
                       finalRecommended < currentShare - 0.02 ? "decrease" as const :
                       "maintain" as const,
    };
  });

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
    signals: {
      bleeders,
      consistent_winners: enrichedWinners,
      lp_vs_creative_fatigue: lpFatigueSignals,
      efficiency_scoring: efficiencyWithRecommendation,
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
