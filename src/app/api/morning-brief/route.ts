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
    critical: Array<{ ad_id: string; ad_name: string | null; adset_id: string | null; campaign_name: string | null; signal: string; detail: string }>;
    warning: Array<{ ad_id: string; ad_name: string | null; adset_id: string | null; campaign_name: string | null; signal: string; detail: string }>;
    monitor: Array<{ ad_id: string; ad_name: string | null; adset_id: string | null; campaign_name: string | null; signal: string; detail: string }>;
  } = { critical: [], warning: [], monitor: [] };

  for (const adId of adIds) {
    const adDays = currentRows
      .filter((r) => r.meta_ad_id === adId)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (adDays.length < 3) continue;

    const adName = adDays[adDays.length - 1].ad_name;
    const fatigueAdsetId = adDays[adDays.length - 1].adset_id;
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
        adset_id: fatigueAdsetId,
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
        adset_id: fatigueAdsetId,
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
        adset_id: fatigueAdsetId,
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
        adset_id: fatigueAdsetId,
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
    adset_id: string | null;
    adset_name: string | null;
    campaign_id: string | null;
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
        adset_id: adDays[adDays.length - 1].adset_id,
        adset_name: adsetName,
        campaign_id: campId,
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
    adset_id: string | null;
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
    const lpAdsetId = adDays[adDays.length - 1].adset_id;
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
        adset_id: lpAdsetId,
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
        adset_id: lpAdsetId,
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

  // ── Ad Set Enrichment: concept context ──
  // Collect all adset_ids referenced across signals
  const enrichmentAdsetIds = new Set<string>();
  for (const b of bleeders) if (b.adset_id) enrichmentAdsetIds.add(b.adset_id);
  for (const f of fatigueSignals.critical) if (f.adset_id) enrichmentAdsetIds.add(f.adset_id);
  for (const lp of lpFatigueSignals) if (lp.adset_id) enrichmentAdsetIds.add(lp.adset_id);
  for (const w of enrichedWinners) if (w.adset_id) enrichmentAdsetIds.add(w.adset_id);

  interface AdsetEnrichment {
    image_job_id: string | null;
    concept_name: string | null;
    concept_number: number | null;
    cash_dna: Record<string, unknown> | null;
    pushed_at: string | null;
    days_running: number | null;
    market: string | null;
  }
  const adsetEnrichment = new Map<string, AdsetEnrichment>();

  if (enrichmentAdsetIds.size > 0) {
    const allEnrichIds = [...enrichmentAdsetIds];
    const { data: adsetConcepts } = await db
      .from("meta_campaigns")
      .select("meta_adset_id, image_job_id, created_at, countries")
      .in("meta_adset_id", allEnrichIds);

    const conceptIds = new Set<string>();
    const adsetToConceptMap = new Map<string, string>();
    const adsetToPushedAt = new Map<string, string>();
    const adsetToMarket = new Map<string, string>();

    for (const row of adsetConcepts ?? []) {
      if (row.image_job_id) {
        adsetToConceptMap.set(row.meta_adset_id, row.image_job_id);
        conceptIds.add(row.image_job_id);
      }
      if (row.created_at) {
        adsetToPushedAt.set(row.meta_adset_id, row.created_at);
      }
      const countries = row.countries as string[] | null;
      if (countries?.[0]) {
        adsetToMarket.set(row.meta_adset_id, countries[0]);
      }
    }

    // Fetch concept details
    const conceptDetails = new Map<string, { name: string | null; concept_number: number | null; cash_dna: Record<string, unknown> | null }>();
    if (conceptIds.size > 0) {
      const { data: concepts } = await db
        .from("image_jobs")
        .select("id, name, concept_number, cash_dna")
        .in("id", [...conceptIds]);
      for (const c of concepts ?? []) {
        conceptDetails.set(c.id, { name: c.name, concept_number: c.concept_number, cash_dna: c.cash_dna });
      }
    }

    for (const adsetId of allEnrichIds) {
      const conceptId = adsetToConceptMap.get(adsetId) ?? null;
      const concept = conceptId ? conceptDetails.get(conceptId) ?? null : null;
      const pushedAt = adsetToPushedAt.get(adsetId) ?? null;
      const daysRunning = pushedAt ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / (1000 * 60 * 60 * 24)) : null;

      adsetEnrichment.set(adsetId, {
        image_job_id: conceptId,
        concept_name: concept?.name ?? null,
        concept_number: concept?.concept_number ?? null,
        cash_dna: concept?.cash_dna ?? null,
        pushed_at: pushedAt,
        days_running: daysRunning,
        market: adsetToMarket.get(adsetId) ?? null,
      });
    }
  }

  // Compute per-adset stats from current data
  const adsetAdCounts = new Map<string, Set<string>>();
  for (const r of latestRows) {
    if (!r.adset_id) continue;
    if (!adsetAdCounts.has(r.adset_id)) adsetAdCounts.set(r.adset_id, new Set());
    adsetAdCounts.get(r.adset_id)!.add(r.meta_ad_id);
  }

  const adsetStatsMap = new Map<string, { total_ads: number; spend_7d: number; revenue_7d: number; roas_7d: number; purchases_7d: number }>();
  for (const r of currentRows) {
    if (!r.adset_id) continue;
    const existing = adsetStatsMap.get(r.adset_id) ?? { total_ads: 0, spend_7d: 0, revenue_7d: 0, roas_7d: 0, purchases_7d: 0 };
    existing.spend_7d += Number(r.spend);
    existing.revenue_7d += Number(r.purchase_value);
    existing.purchases_7d += Number(r.purchases);
    adsetStatsMap.set(r.adset_id, existing);
  }
  for (const [adsetId, stats] of adsetStatsMap) {
    stats.total_ads = adsetAdCounts.get(adsetId)?.size ?? 0;
    stats.roas_7d = stats.spend_7d > 0 ? round(stats.revenue_7d / stats.spend_7d) : 0;
  }

  // ── Synthesize Action Cards ──
  interface ActionCard {
    id: string;
    type: "pause" | "scale" | "refresh" | "budget" | "landing_page" | "save_copy";
    category: string;
    title: string;
    why: string;
    guidance: string;
    expected_impact: string;
    action_data: Record<string, unknown>;
    priority: number;
    button_label?: string;
    ad_name?: string | null;
    adset_id?: string | null;
    adset_name?: string | null;
    campaign_name?: string | null;
    image_url?: string | null;
    image_job_id?: string | null;
    concept_name?: string | null;
    days_running?: number | null;
    adset_roas?: number | null;
  }

  const actionCards: ActionCard[] = [];

  // Helper: look up info from current data
  const adIdToInfo = new Map<string, { adset_id: string | null; adset_name: string | null; campaign_name: string | null }>();
  for (const r of currentRows) {
    adIdToInfo.set(r.meta_ad_id, { adset_id: r.adset_id, adset_name: r.adset_name, campaign_name: r.campaign_name });
  }

  // ── Bleeders → pause cards (priority 1) — grouped by ad set ──
  const bleedersByAdset = new Map<string, typeof bleeders>();
  for (const b of bleeders) {
    const key = b.adset_id ?? `solo_${b.ad_id}`;
    if (!bleedersByAdset.has(key)) bleedersByAdset.set(key, []);
    bleedersByAdset.get(key)!.push(b);
  }

  for (const [groupKey, adsetBleeders] of bleedersByAdset) {
    const isGrouped = !groupKey.startsWith("solo_");
    const adsetId = isGrouped ? groupKey : null;
    const stats = adsetId ? adsetStatsMap.get(adsetId) : null;
    const enrichment = adsetId ? adsetEnrichment.get(adsetId) : null;
    const totalAdsInAdset = stats?.total_ads ?? adsetBleeders.length;
    const allBleeding = adsetBleeders.length >= totalAdsInAdset;
    const totalSpend = adsetBleeders.reduce((s, b) => s + b.total_spend, 0);
    const avgDaysBleeding = Math.round(adsetBleeders.reduce((s, b) => s + b.days_bleeding, 0) / adsetBleeders.length);
    const adsetLabel = enrichment?.concept_name || adsetBleeders[0].adset_name || adsetBleeders[0].ad_name || "unnamed";
    const daysRunning = enrichment?.days_running;
    const adsetRoas = stats?.roas_7d ?? 0;

    if (allBleeding && totalAdsInAdset > 1) {
      // ALL ads in ad set bleeding → recommend pausing the entire ad set
      actionCards.push({
        id: `pause_adset_${groupKey}`,
        type: "pause",
        category: "Budget",
        title: `Kill ad set "${adsetLabel}" — all ${totalAdsInAdset} ads are losing money`,
        why: `Every ad in this ad set has been bleeding for ${avgDaysBleeding}+ days. Total waste: ${round(totalSpend)} kr.${daysRunning ? ` Running for ${daysRunning} days.` : ""}${adsetRoas > 0 ? ` Overall ROAS: ${adsetRoas}x.` : ""}`,
        guidance: `When ALL ads in an ad set are underperforming, the concept itself isn't working — not just individual ads. Pausing the entire ad set frees up a "testing slot" so Meta's algorithm can allocate that budget to your better-performing ad sets. Think of it this way: you have a limited number of ad sets (slots), and each one should earn its place.`,
        expected_impact: `Save ~${round(totalSpend / avgDaysBleeding)} kr/day, free up a testing slot`,
        button_label: "Pause entire ad set",
        action_data: {
          action: "pause_adset",
          adset_id: adsetId,
          adset_name: adsetLabel,
          campaign_name: adsetBleeders[0].campaign_name,
          reason: `All ${totalAdsInAdset} ads bleeding ${avgDaysBleeding}+ days, ${round(totalSpend)} kr wasted`,
        },
        priority: 1,
        ad_name: null,
        adset_id: adsetId,
        adset_name: adsetBleeders[0].adset_name,
        campaign_name: adsetBleeders[0].campaign_name,
        image_job_id: enrichment?.image_job_id ?? null,
        concept_name: enrichment?.concept_name ?? null,
        days_running: daysRunning ?? null,
        adset_roas: adsetRoas,
      });
    } else if (totalAdsInAdset > 1 && adsetBleeders.length > 0) {
      // SOME ads bleeding → pause specific ads, keep winners
      const okAds = totalAdsInAdset - adsetBleeders.length;
      actionCards.push({
        id: `pause_ads_${groupKey}`,
        type: "pause",
        category: "Budget",
        title: `Remove ${adsetBleeders.length} bad ad${adsetBleeders.length > 1 ? "s" : ""} from "${adsetLabel}"`,
        why: `${adsetBleeders.length} of ${totalAdsInAdset} ads are bleeding (${avgDaysBleeding}+ days, ${round(totalSpend)} kr wasted). ${okAds} ad${okAds > 1 ? "s" : ""} still performing OK.${daysRunning ? ` Ad set running for ${daysRunning} days.` : ""}`,
        guidance: `Not all ads in this ad set are bad — ${okAds} ${okAds > 1 ? "are" : "is"} still performing. By pausing only the bleeders, Meta's algorithm will redistribute budget to the winning ads within this same ad set. The ad set stays active (keeps its slot), but stops wasting money on the bad ads.`,
        expected_impact: `Save ~${round(totalSpend / avgDaysBleeding)} kr/day`,
        button_label: `Pause ${adsetBleeders.length} ad${adsetBleeders.length > 1 ? "s" : ""}`,
        action_data: {
          action: "pause_bleeders",
          bleeders: adsetBleeders.map((b) => ({
            ad_id: b.ad_id,
            ad_name: b.ad_name,
            campaign_name: b.campaign_name,
            days_bleeding: b.days_bleeding,
            total_spend: b.total_spend,
            avg_ctr: b.avg_ctr,
            avg_cpa: b.avg_cpa,
          })),
        },
        priority: 1,
        ad_name: null,
        adset_id: adsetId,
        adset_name: adsetBleeders[0].adset_name,
        campaign_name: adsetBleeders[0].campaign_name,
        image_job_id: enrichment?.image_job_id ?? null,
        concept_name: enrichment?.concept_name ?? null,
        days_running: daysRunning ?? null,
        adset_roas: adsetRoas,
      });
    } else {
      // Single ad or unknown ad set → individual ad pause
      const b = adsetBleeders[0];
      const adLabel = b.ad_name || b.adset_name || "unnamed ad";
      actionCards.push({
        id: `pause_${b.ad_id}`,
        type: "pause",
        category: "Budget",
        title: `Pause "${adLabel}" — it's losing money`,
        why: `Spent ${b.total_spend} kr over ${b.days_bleeding} days with only ${b.avg_ctr}% CTR and ${b.purchases} purchases.`,
        guidance: `This ad has been underperforming for ${b.days_bleeding} consecutive days. Pausing it lets Meta redirect the budget to your better ads.`,
        expected_impact: `Save ~${round(b.total_spend / b.days_bleeding)} kr/day`,
        action_data: { action: "pause_ad", ad_id: b.ad_id, ad_name: b.ad_name, reason: "bleeder" },
        priority: 1,
        ad_name: b.ad_name,
        adset_id: adsetId,
        adset_name: b.adset_name,
        campaign_name: b.campaign_name,
      });
    }
  }

  // ── Consistent winners → scale cards (priority 2) ──
  for (const w of enrichedWinners) {
    const enrichment = w.adset_id ? adsetEnrichment.get(w.adset_id) : null;
    const adLabel = enrichment?.concept_name || w.ad_name || w.adset_name || "unnamed ad";
    actionCards.push({
      id: `scale_${w.ad_id}`,
      type: "scale",
      category: "Budget",
      title: `Give more budget to "${adLabel}"`,
      why: `Consistent winner for ${w.consistent_days} days — ${w.avg_roas}x ROAS, ${w.avg_cpa} kr CPA, ${w.avg_ctr}% CTR.${enrichment?.days_running ? ` Running for ${enrichment.days_running} days.` : ""}`,
      guidance: `This ad has been profitable for ${w.consistent_days} days straight. Increasing its budget by 20% should get you more sales at a similar cost. Meta's algorithm will gradually spend more on this proven winner.`,
      expected_impact: "~20% more purchases at similar CPA",
      action_data: { action: "scale_winner", ad_id: w.ad_id, adset_id: w.adset_id, campaign_id: w.campaign_id },
      priority: 2,
      ad_name: w.ad_name,
      adset_id: w.adset_id,
      adset_name: w.adset_name,
      campaign_name: w.campaign_name,
      image_job_id: enrichment?.image_job_id ?? w.image_job_id,
      concept_name: enrichment?.concept_name ?? null,
      days_running: enrichment?.days_running ?? null,
    });
  }

  // ── Winners → save winning copy to bank (priority 4) ──
  const winnerAdIds = enrichedWinners.map(w => w.ad_id);
  const { data: winnerMetaAds } = winnerAdIds.length > 0
    ? await db
        .from("meta_ads")
        .select("id, ad_copy, headline, campaign_id, meta_campaigns!inner(product, language, image_job_id, image_jobs(name))")
        .in("meta_ad_id", winnerAdIds)
        .eq("status", "pushed")
        .not("ad_copy", "is", null)
    : { data: [] };

  const copyTexts = (winnerMetaAds ?? []).map(a => (a.ad_copy ?? "").trim()).filter(Boolean);
  const { data: existingBank } = copyTexts.length > 0
    ? await db.from("copy_bank").select("primary_text").in("primary_text", copyTexts)
    : { data: [] };
  const bankedTexts = new Set((existingBank ?? []).map(b => b.primary_text));

  for (const wa of (winnerMetaAds ?? [])) {
    const copy = (wa.ad_copy ?? "").trim();
    if (!copy || bankedTexts.has(copy)) continue;

    const mc = wa.meta_campaigns as unknown as { product: string; language: string; image_job_id: string | null; image_jobs: { name: string } | null } | null;
    if (!mc) continue;

    const conceptName = mc.image_jobs?.name ?? "unknown";
    const preview = copy.length > 80 ? copy.slice(0, 80) + "..." : copy;

    actionCards.push({
      id: `save_copy_${wa.id}`,
      type: "save_copy",
      category: "Copy",
      title: `Save winning ${mc.language.toUpperCase()} copy to bank`,
      why: `This copy is performing well. Save it so you can reuse it on future concepts without re-translating.`,
      guidance: `"${preview}"`,
      expected_impact: "Reuse proven copy on new concepts",
      button_label: "Save to Copy Bank",
      action_data: {
        action: "save_copy",
        meta_ad_id: wa.id,
        primary_text: copy,
        headline: wa.headline ?? null,
        product: mc.product,
        language: mc.language,
        source_concept_name: conceptName,
      },
      priority: 4,
      ad_name: null,
      adset_id: null,
      adset_name: null,
      campaign_name: null,
      image_job_id: mc.image_job_id,
      concept_name: conceptName,
      days_running: null,
      adset_roas: null,
    });
  }

  // ── Critical fatigue → iterate (profitable) or kill (unprofitable) ──
  for (const f of fatigueSignals.critical) {
    const enrichment = f.adset_id ? adsetEnrichment.get(f.adset_id) : null;
    const stats = f.adset_id ? adsetStatsMap.get(f.adset_id) : null;
    const conceptName = enrichment?.concept_name;
    const daysRunning = enrichment?.days_running;
    const adsetRoas = stats?.roas_7d ?? 0;
    const isProfitable = adsetRoas > 1;
    const cashDna = enrichment?.cash_dna;
    const angle = (cashDna as Record<string, unknown> | null)?.angle as string | undefined;
    const adLabel = conceptName || f.ad_name || "unnamed";

    const market = enrichment?.market ?? null;

    if (isProfitable) {
      // Profitable but fatiguing → iterate on the concept
      actionCards.push({
        id: `refresh_${f.ad_id}`,
        type: "refresh",
        category: "Creative",
        title: `"${adLabel}" is fatiguing${market ? ` in ${market}` : ""} — still profitable at ${adsetRoas}x, iterate!`,
        why: `${f.detail}. Running for ${daysRunning ?? "?"}d with ${adsetRoas}x ROAS — this concept works but needs fresh creatives.`,
        guidance: `Your audience has seen this ad enough times that click rates are dropping, but the concept IS profitable. Create new variations with fresh visuals but the same winning angle.${angle ? ` Current angle: "${angle}".` : ""} Click below to open the iteration tool and generate a Segment Swap, Mechanism Swap, or C.A.S.H. Swap.`,
        expected_impact: "Keep a profitable concept alive with fresh creatives",
        button_label: market ? `Iterate for ${market}` : "Iterate on this concept",
        action_data: { ad_id: f.ad_id, image_job_id: enrichment?.image_job_id ?? null, market },
        priority: 3,
        ad_name: f.ad_name,
        adset_id: f.adset_id,
        adset_name: adIdToInfo.get(f.ad_id)?.adset_name ?? null,
        campaign_name: f.campaign_name,
        image_job_id: enrichment?.image_job_id ?? null,
        concept_name: conceptName ?? null,
        days_running: daysRunning ?? null,
        adset_roas: adsetRoas,
      });
    } else {
      // Unprofitable AND fatiguing → kill it
      actionCards.push({
        id: `kill_fatigue_${f.ad_id}`,
        type: "pause",
        category: "Budget",
        title: `Kill "${adLabel}" — fatiguing and not profitable`,
        why: `${f.detail}. ${daysRunning ? `Running for ${daysRunning} days` : ""}${adsetRoas > 0 ? ` with only ${adsetRoas}x ROAS` : " with 0 sales"}. Not worth iterating on.`,
        guidance: `This concept is both fatiguing (CTR dropping) and unprofitable. There's no reason to keep spending on it or create new variations. Pause the ad to stop wasting budget and free up spend for your winners.`,
        expected_impact: "Stop wasting budget on an unprofitable, fatiguing concept",
        button_label: "Pause this ad",
        action_data: { action: "pause_ad", ad_id: f.ad_id, ad_name: f.ad_name, reason: "fatigue_unprofitable" },
        priority: 1,
        ad_name: f.ad_name,
        adset_id: f.adset_id,
        adset_name: adIdToInfo.get(f.ad_id)?.adset_name ?? null,
        campaign_name: f.campaign_name,
        image_job_id: enrichment?.image_job_id ?? null,
        concept_name: conceptName ?? null,
        days_running: daysRunning ?? null,
        adset_roas: adsetRoas,
      });
    }
  }

  // ── LP vs creative fatigue → landing_page cards (priority 3) ──
  for (const lp of lpFatigueSignals) {
    if (lp.diagnosis === "landing_page") {
      const enrichment = lp.adset_id ? adsetEnrichment.get(lp.adset_id) : null;
      const adLabel = enrichment?.concept_name || lp.ad_name || "unnamed ad";
      actionCards.push({
        id: `lp_${lp.ad_id}`,
        type: "landing_page",
        category: "Creative",
        title: `Landing page hurting "${adLabel}" — people click but don't buy`,
        why: `${lp.detail}. The ad gets clicks (CTR is fine) but conversions are dropping.`,
        guidance: `The ad itself is working — people click on it. But after clicking, they're not buying. This usually means the landing page doesn't match the ad promise, loads slowly, or the offer isn't compelling. Try swapping to a different landing page or updating the current one.`,
        expected_impact: "Lower CPA by improving post-click experience",
        action_data: { ad_id: lp.ad_id },
        priority: 3,
        ad_name: lp.ad_name,
        adset_id: lp.adset_id,
        adset_name: lp.adset_name,
        campaign_name: lp.campaign_name,
        image_job_id: enrichment?.image_job_id ?? null,
        concept_name: enrichment?.concept_name ?? null,
      });
    }
  }

  // Budget rebalance — single card if any campaign has >5% difference (priority 4)
  const significantShifts = efficiencyWithRecommendation.filter(
    (c) => Math.abs(c.recommended_budget_share - c.current_budget_share) > 5
  );
  if (significantShifts.length > 0) {
    const increaseNames = significantShifts
      .filter((c) => c.recommendation === "increase")
      .map((c) => c.campaign_name);
    const decreaseNames = significantShifts
      .filter((c) => c.recommendation === "decrease")
      .map((c) => c.campaign_name);
    actionCards.push({
      id: "budget_rebalance",
      type: "budget",
      category: "Budget",
      title: "Move budget to your best campaigns",
      why: `${increaseNames.length > 0 ? `Give more to: ${increaseNames.join(", ")}` : ""}${increaseNames.length > 0 && decreaseNames.length > 0 ? ". " : ""}${decreaseNames.length > 0 ? `Reduce: ${decreaseNames.join(", ")}` : ""}`,
      guidance: `Some campaigns are more efficient at turning ad spend into sales. By shifting budget from underperforming campaigns to your best ones, you get more sales for the same total spend. This doesn't change your total budget — just redistributes it smarter.`,
      expected_impact: "Better ROAS at same total spend",
      action_data: { action: "apply_budget_shifts", shifts: efficiencyWithRecommendation },
      priority: 4,
    });
  }

  // Sort by priority ascending
  actionCards.sort((a, b) => a.priority - b.priority);

  // Enrich action cards with ad images from meta_ads table
  const actionAdIds = actionCards
    .map((c) => {
      // For grouped cards, get first bleeder's ad_id; for single cards, use ad_id directly
      const bleedersArr = c.action_data.bleeders as Array<{ ad_id: string }> | undefined;
      return (c.action_data.ad_id as string) || bleedersArr?.[0]?.ad_id || null;
    })
    .filter((id): id is string => !!id);
  if (actionAdIds.length > 0) {
    const { data: adImages } = await db
      .from("meta_ads")
      .select("meta_ad_id, image_url")
      .in("meta_ad_id", actionAdIds);
    const imageMap = new Map(
      (adImages ?? []).map((a: { meta_ad_id: string; image_url: string | null }) => [a.meta_ad_id, a.image_url])
    );
    for (const card of actionCards) {
      if (card.image_url) continue; // already has image
      const adId = card.action_data.ad_id as string;
      const bleedersArr = card.action_data.bleeders as Array<{ ad_id: string }> | undefined;
      const lookupId = adId || bleedersArr?.[0]?.ad_id;
      if (lookupId && imageMap.has(lookupId)) {
        card.image_url = imageMap.get(lookupId) ?? null;
      }
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
    signals: {
      bleeders,
      consistent_winners: enrichedWinners,
      lp_vs_creative_fatigue: lpFatigueSignals,
      efficiency_scoring: efficiencyWithRecommendation,
    },
    action_cards: actionCards,
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
