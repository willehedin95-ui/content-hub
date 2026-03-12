/**
 * Strategy Engine — Campaign-level and ad-set-level media buying guidance.
 *
 * Produces prioritized recommendations for the Morning Brief:
 * - Budget direction (hold / increase / kill deadweight)
 * - Account structure health (too spread, zombies, imbalanced)
 * - Concept need (when to brainstorm, when to wait)
 * - Anti-panic guard (prevent emotional budget cuts)
 */

// ---------------------------------------------------------------------------
// Constants (all tunable)
// ---------------------------------------------------------------------------

const BUDGET_COOLDOWN_DAYS = 3; // Wait N days after any budget change
const PROFITABLE_ROAS_MULTIPLIER = 1.3; // 30% above BE = clearly profitable
const MARGINAL_ROAS_MULTIPLIER = 0.8; // 20% below BE = marginal zone

const MIN_BUDGET_PER_ADSET = 100; // SEK/day floor per ad set
const CRITICAL_BUDGET_PER_ADSET = 80; // Below this is wasteful
const ZOMBIE_SPEND_THRESHOLD = 50; // SEK total over 7 days = zombie
const SPEND_DOMINANCE_THRESHOLD = 0.6; // 60% of campaign spend = one dominating

const MIN_WINNING_ADSETS = 2; // Below = concept starvation
const MIN_ACTIVE_ADSETS = 3; // Below = urgently need concepts
const CONCEPT_COOLDOWN_DAYS = 7; // Wait 7 days after push before judging
const MAX_AVG_AGE_DAYS = 21; // After 3 weeks, concepts may fatigue
const FATIGUE_RATIO_THRESHOLD = 0.5; // 50% of ad sets fatiguing

const MIN_PURCHASES_TO_JUDGE = 5; // Need at least 5 purchases to make budget decisions

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StrategyAction =
  | "hold_budget"
  | "increase_budget"
  | "kill_deadweight"
  | "add_concepts"
  | "pause_and_wait"
  | "structure_warning";

export type StrategyUrgency = "critical" | "recommended" | "fyi";

export interface StrategyRecommendation {
  id: string;
  action: StrategyAction;
  urgency: StrategyUrgency;
  title: string;
  reasoning: string;
  context: string;
  what_to_do: string;
  what_happens_if_ignored: string;
  anti_panic?: string;
  campaign_id?: string;
  action_data?: Record<string, unknown>;
  button_label?: string;
}

export interface CampaignMultiWindowKpi {
  campaign_id: string;
  campaign_name: string;
  market: string;
  format: "statics" | "video";
  daily_budget_sek: number;
  active_adsets: number;
  w7: WindowKpi;
  w14: WindowKpi;
  w30: WindowKpi;
  be_roas: number;
  target_cpa: number;
}

export interface WindowKpi {
  spend: number;
  revenue: number;
  roas: number;
  cpa: number | null;
  purchases: number;
}

export interface AdSetBreakdown {
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  market: string | null;
  spend_7d: number;
  roas_7d: number;
  cpa_7d: number | null;
  purchases_7d: number;
  days_running: number | null;
  spend_share_pct: number;
  status: "winning" | "testing" | "underperforming" | "zombie";
}

export interface StrategyGuide {
  headline: string;
  headline_tone: "positive" | "cautious" | "warning";
  multi_window_kpis: CampaignMultiWindowKpi[];
  adset_breakdown: AdSetBreakdown[];
  recommendations: StrategyRecommendation[];
}

// ---------------------------------------------------------------------------
// Input types (what the morning brief API will provide)
// ---------------------------------------------------------------------------

export interface AdSetDayRow {
  date: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  spend: number;
  purchases: number;
  purchase_value: number;
  roas: number;
  cpa: number;
  impressions: number;
  clicks: number;
  ctr: number;
  frequency: number;
}

export interface CampaignInfo {
  campaign_id: string;
  campaign_name: string;
  daily_budget_sek: number;
  market: string;
  format: "statics" | "video";
  be_roas: number;
  target_cpa: number;
}

export interface BudgetSnapshot {
  date: string;
  campaign_id: string;
  daily_budget: number;
}

export interface StrategyInput {
  adset_days: AdSetDayRow[];
  campaigns: CampaignInfo[];
  budget_snapshots: BudgetSnapshot[];
  today: string; // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function computeStrategyGuide(input: StrategyInput): StrategyGuide {
  const { adset_days, campaigns, budget_snapshots, today } = input;

  const recommendations: StrategyRecommendation[] = [];

  // Build multi-window KPIs per campaign
  // Filter out ghost campaigns (0 budget, 0 ad sets, 0 spend) — often old/inactive campaign IDs
  const multiWindowKpis = campaigns
    .map((c) => buildCampaignKpi(c, adset_days, today))
    .filter((kpi) => kpi.daily_budget_sek > 0 || kpi.active_adsets > 0 || kpi.w30.spend > 0);

  // Build ad set breakdown
  const adsetBreakdown = buildAdSetBreakdown(adset_days, campaigns, today);

  // --- Rule 1: Budget Direction per campaign ---
  for (const kpi of multiWindowKpis) {
    const budgetRec = analyzeBudgetDirection(kpi, budget_snapshots, today);
    if (budgetRec) recommendations.push(budgetRec);
  }

  // --- Rule 2: Account Structure ---
  const structureRecs = analyzeAccountStructure(
    multiWindowKpis,
    adsetBreakdown
  );
  recommendations.push(...structureRecs);

  // --- Rule 3: Concept Need ---
  const conceptRecs = analyzeConceptNeed(multiWindowKpis, adsetBreakdown);
  recommendations.push(...conceptRecs);

  // Sort: critical first, then recommended, then fyi
  const urgencyOrder = { critical: 0, recommended: 1, fyi: 2 };
  recommendations.sort(
    (a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
  );

  // Compute headline
  const { headline, headline_tone } = computeHeadline(multiWindowKpis);

  return {
    headline,
    headline_tone,
    multi_window_kpis: multiWindowKpis,
    adset_breakdown: adsetBreakdown,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Build multi-window KPIs for a campaign
// ---------------------------------------------------------------------------

function buildCampaignKpi(
  campaign: CampaignInfo,
  adsetDays: AdSetDayRow[],
  today: string
): CampaignMultiWindowKpi {
  const campaignRows = adsetDays.filter(
    (r) => r.campaign_id === campaign.campaign_id
  );

  const todayDate = new Date(today);

  const w7 = aggregateWindow(campaignRows, todayDate, 7);
  const w14 = aggregateWindow(campaignRows, todayDate, 14);
  const w30 = aggregateWindow(campaignRows, todayDate, 30);

  // Count unique active ad sets (ad sets with any spend in last 7 days)
  const activeAdsets = new Set(
    campaignRows
      .filter((r) => {
        const d = new Date(r.date);
        const daysAgo = Math.floor(
          (todayDate.getTime() - d.getTime()) / 86400000
        );
        return daysAgo <= 7 && r.spend > 0;
      })
      .map((r) => r.adset_id)
  ).size;

  return {
    campaign_id: campaign.campaign_id,
    campaign_name: campaign.campaign_name,
    market: campaign.market,
    format: campaign.format,
    daily_budget_sek: campaign.daily_budget_sek,
    active_adsets: activeAdsets,
    w7,
    w14,
    w30,
    be_roas: campaign.be_roas,
    target_cpa: campaign.target_cpa,
  };
}

function aggregateWindow(
  rows: AdSetDayRow[],
  todayDate: Date,
  days: number
): WindowKpi {
  const filtered = rows.filter((r) => {
    const d = new Date(r.date);
    const daysAgo = Math.floor(
      (todayDate.getTime() - d.getTime()) / 86400000
    );
    return daysAgo >= 1 && daysAgo <= days;
  });

  const spend = filtered.reduce((sum, r) => sum + r.spend, 0);
  const revenue = filtered.reduce((sum, r) => sum + r.purchase_value, 0);
  const purchases = filtered.reduce((sum, r) => sum + r.purchases, 0);

  return {
    spend,
    revenue,
    roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
    cpa: purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : null,
    purchases,
  };
}

// ---------------------------------------------------------------------------
// Build ad set breakdown
// ---------------------------------------------------------------------------

function buildAdSetBreakdown(
  adsetDays: AdSetDayRow[],
  campaigns: CampaignInfo[],
  today: string
): AdSetBreakdown[] {
  const todayDate = new Date(today);

  // Group by ad set, get 7d aggregates
  const adsetMap = new Map<
    string,
    {
      adset_id: string;
      adset_name: string;
      campaign_id: string;
      campaign_name: string;
      spend_7d: number;
      revenue_7d: number;
      purchases_7d: number;
      first_date: string;
      last_date: string;
    }
  >();

  for (const row of adsetDays) {
    const d = new Date(row.date);
    const daysAgo = Math.floor(
      (todayDate.getTime() - d.getTime()) / 86400000
    );
    if (daysAgo < 1 || daysAgo > 7) continue;

    const existing = adsetMap.get(row.adset_id);
    if (existing) {
      existing.spend_7d += row.spend;
      existing.revenue_7d += row.purchase_value;
      existing.purchases_7d += row.purchases;
      if (row.date < existing.first_date) existing.first_date = row.date;
      if (row.date > existing.last_date) existing.last_date = row.date;
    } else {
      adsetMap.set(row.adset_id, {
        adset_id: row.adset_id,
        adset_name: row.adset_name,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        spend_7d: row.spend,
        revenue_7d: row.purchase_value,
        purchases_7d: row.purchases,
        first_date: row.date,
        last_date: row.date,
      });
    }
  }

  // Get total campaign spend for share calculation
  const campaignSpend = new Map<string, number>();
  for (const a of adsetMap.values()) {
    campaignSpend.set(
      a.campaign_id,
      (campaignSpend.get(a.campaign_id) || 0) + a.spend_7d
    );
  }

  const campaignMap = new Map(campaigns.map((c) => [c.campaign_id, c]));

  // Also check all 30 days for days_running
  const adsetFirstSeen = new Map<string, string>();
  for (const row of adsetDays) {
    const existing = adsetFirstSeen.get(row.adset_id);
    if (!existing || row.date < existing) {
      adsetFirstSeen.set(row.adset_id, row.date);
    }
  }

  const results: AdSetBreakdown[] = [];

  for (const a of adsetMap.values()) {
    const roas =
      a.spend_7d > 0
        ? Math.round((a.revenue_7d / a.spend_7d) * 100) / 100
        : 0;
    const cpa =
      a.purchases_7d > 0
        ? Math.round((a.spend_7d / a.purchases_7d) * 100) / 100
        : null;
    const totalCampaignSpend = campaignSpend.get(a.campaign_id) || 1;
    const spendShare = Math.round((a.spend_7d / totalCampaignSpend) * 100);

    const campaign = campaignMap.get(a.campaign_id);
    const beRoas = campaign?.be_roas || 1.61;

    const firstSeen = adsetFirstSeen.get(a.adset_id);
    const daysRunning = firstSeen
      ? Math.floor(
          (todayDate.getTime() - new Date(firstSeen).getTime()) / 86400000
        )
      : null;

    // Determine status
    let status: AdSetBreakdown["status"];
    if (a.spend_7d < ZOMBIE_SPEND_THRESHOLD) {
      status = "zombie";
    } else if (daysRunning !== null && daysRunning <= CONCEPT_COOLDOWN_DAYS) {
      status = "testing";
    } else if (roas >= beRoas && a.purchases_7d > 0) {
      status = "winning";
    } else {
      status = "underperforming";
    }

    results.push({
      adset_id: a.adset_id,
      adset_name: a.adset_name,
      campaign_id: a.campaign_id,
      campaign_name: a.campaign_name,
      market: campaign?.market || null,
      spend_7d: Math.round(a.spend_7d),
      roas_7d: roas,
      cpa_7d: cpa,
      purchases_7d: a.purchases_7d,
      days_running: daysRunning,
      spend_share_pct: spendShare,
      status,
    });
  }

  // Sort by spend descending
  results.sort((a, b) => b.spend_7d - a.spend_7d);
  return results;
}

// ---------------------------------------------------------------------------
// Rule 1: Budget Direction
// ---------------------------------------------------------------------------

function analyzeBudgetDirection(
  kpi: CampaignMultiWindowKpi,
  snapshots: BudgetSnapshot[],
  today: string
): StrategyRecommendation | null {
  const { campaign_id, campaign_name, be_roas, w7, w14, w30 } = kpi;

  // Skip campaigns with very low data (< 5 purchases over 30 days)
  if (w30.purchases < MIN_PURCHASES_TO_JUDGE) {
    return {
      id: `budget_${campaign_id}_data`,
      action: "hold_budget",
      urgency: "fyi",
      title: `${campaign_name}: Not enough data yet`,
      reasoning: `Only ${w30.purchases} purchases in 30 days. Need at least ${MIN_PURCHASES_TO_JUDGE} to make confident budget decisions.`,
      context: `30d: ${w30.purchases} purchases, ${Math.round(w30.spend)} SEK spent`,
      what_to_do: "Keep running at current budget and wait for more conversion data.",
      what_happens_if_ignored: "No risk — just continue as-is.",
      button_label: "Got it",
    };
  }

  // Check if budget was recently changed
  const todayDate = new Date(today);
  const campaignSnapshots = snapshots
    .filter((s) => s.campaign_id === campaign_id)
    .sort((a, b) => b.date.localeCompare(a.date));

  let daysSinceLastChange: number | null = null;
  if (campaignSnapshots.length >= 2) {
    for (let i = 0; i < campaignSnapshots.length - 1; i++) {
      if (campaignSnapshots[i].daily_budget !== campaignSnapshots[i + 1].daily_budget) {
        daysSinceLastChange = Math.floor(
          (todayDate.getTime() - new Date(campaignSnapshots[i].date).getTime()) / 86400000
        );
        break;
      }
    }
  }

  // Cooldown period
  if (daysSinceLastChange !== null && daysSinceLastChange < BUDGET_COOLDOWN_DAYS) {
    return {
      id: `budget_${campaign_id}_cooldown`,
      action: "hold_budget",
      urgency: "fyi",
      title: `${campaign_name}: Budget recently changed — settling`,
      reasoning: `Budget was changed ${daysSinceLastChange} day(s) ago. Meta needs ${BUDGET_COOLDOWN_DAYS} days to re-optimize after a budget change.`,
      context: formatKpiContext(kpi),
      what_to_do: `Wait ${BUDGET_COOLDOWN_DAYS - daysSinceLastChange} more day(s) before making any budget changes.`,
      what_happens_if_ignored: "Frequent budget changes reset Meta's learning phase, wasting your spend.",
      button_label: "Got it",
    };
  }

  const profitableThreshold = be_roas * PROFITABLE_ROAS_MULTIPLIER;
  const marginalThreshold = be_roas * MARGINAL_ROAS_MULTIPLIER;

  // All windows strongly profitable → recommend increase
  if (
    w30.roas >= profitableThreshold &&
    w14.roas >= profitableThreshold &&
    w7.roas >= profitableThreshold
  ) {
    return {
      id: `budget_${campaign_id}_increase`,
      action: "increase_budget",
      urgency: "recommended",
      title: `${campaign_name}: Consider increasing budget +20%`,
      reasoning: `ROAS is consistently above breakeven across all time windows. This campaign has room to scale.`,
      context: formatKpiContext(kpi),
      what_to_do: `Increase daily budget from ${kpi.daily_budget_sek} to ${Math.round(kpi.daily_budget_sek * 1.2)} SEK/day.`,
      what_happens_if_ignored: "You're leaving profitable sales on the table.",
      campaign_id,
      action_data: {
        campaign_id,
        new_budget: Math.round(kpi.daily_budget_sek * 1.2 * 100), // Meta uses cents
      },
      button_label: "Increase +20%",
    };
  }

  // 30d profitable but 7d dipped → ANTI-PANIC
  if (w30.roas >= be_roas && w7.roas < be_roas) {
    return {
      id: `budget_${campaign_id}_hold_panic`,
      action: "hold_budget",
      urgency: "fyi",
      title: `${campaign_name}: Bad week, good month — don't panic`,
      reasoning: `7-day ROAS (${w7.roas.toFixed(2)}x) is below breakeven, but 30-day ROAS (${w30.roas.toFixed(2)}x) is still profitable. This is normal volatility at your spend level.`,
      context: formatKpiContext(kpi),
      what_to_do: "Do NOT lower the budget. If anything, kill the weakest ad sets to consolidate spend into winners.",
      what_happens_if_ignored: "No risk from holding. Lowering budget now would hurt your winners during a temporary dip.",
      anti_panic: `Your 30-day ROAS of ${w30.roas.toFixed(2)}x means you made ${Math.round(w30.revenue - w30.spend)} SEK profit this month from this campaign. A bad week doesn't erase that.`,
      button_label: "Got it, holding steady",
    };
  }

  // All windows below breakeven → kill deadweight
  if (w30.roas < be_roas && w14.roas < be_roas && w7.roas < be_roas) {
    return {
      id: `budget_${campaign_id}_kill`,
      action: "kill_deadweight",
      urgency: "critical",
      title: `${campaign_name}: Below breakeven — kill underperformers`,
      reasoning: `ROAS is below breakeven across all time windows. Instead of lowering budget, kill the ad sets dragging the average down.`,
      context: formatKpiContext(kpi),
      what_to_do: "Look at the ad set breakdown below and pause the worst performers. Then reassess in 7 days.",
      what_happens_if_ignored: "You continue losing money every day this campaign runs.",
      button_label: "Show ad sets to kill",
    };
  }

  // 14d and 30d profitable, 7d just dipping → hold
  if (w30.roas >= be_roas && w14.roas >= be_roas) {
    return {
      id: `budget_${campaign_id}_hold`,
      action: "hold_budget",
      urgency: "fyi",
      title: `${campaign_name}: Profitable — hold steady`,
      reasoning: `Campaign is profitable on 14d and 30d windows. Current performance is healthy.`,
      context: formatKpiContext(kpi),
      what_to_do: "No action needed. Keep running.",
      what_happens_if_ignored: "No risk.",
      button_label: "Got it",
    };
  }

  // Marginal zone — declining
  if (w30.roas >= be_roas && w14.roas < be_roas) {
    return {
      id: `budget_${campaign_id}_watch`,
      action: "hold_budget",
      urgency: "recommended",
      title: `${campaign_name}: Watch closely — declining trend`,
      reasoning: `30-day ROAS is still above breakeven (${w30.roas.toFixed(2)}x) but 14-day is slipping (${w14.roas.toFixed(2)}x). This could be a temporary dip or the start of creative fatigue.`,
      context: formatKpiContext(kpi),
      what_to_do: "Check the ad set breakdown for any clear losers to kill. Consider brainstorming new concepts if your winners are aging.",
      what_happens_if_ignored: "If the decline continues, you'll be below breakeven within a week.",
      button_label: "Got it",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Rule 2: Account Structure
// ---------------------------------------------------------------------------

function analyzeAccountStructure(
  kpis: CampaignMultiWindowKpi[],
  adsets: AdSetBreakdown[]
): StrategyRecommendation[] {
  const recs: StrategyRecommendation[] = [];

  for (const kpi of kpis) {
    if (kpi.active_adsets === 0) continue;

    const budgetPerAdset = kpi.daily_budget_sek / kpi.active_adsets;
    const campaignAdsets = adsets.filter(
      (a) => a.campaign_id === kpi.campaign_id
    );

    // Budget too spread
    if (budgetPerAdset < CRITICAL_BUDGET_PER_ADSET) {
      const zombies = campaignAdsets.filter((a) => a.status === "zombie");
      const underperformers = campaignAdsets.filter(
        (a) => a.status === "underperforming"
      );
      const toKill = [...zombies, ...underperformers].slice(0, 3);

      recs.push({
        id: `structure_spread_${kpi.campaign_id}`,
        action: "structure_warning",
        urgency: "critical",
        title: `${kpi.campaign_name}: Budget too thin (${Math.round(budgetPerAdset)} SEK/ad set)`,
        reasoning: `${kpi.active_adsets} ad sets sharing ${kpi.daily_budget_sek} SEK/day = ${Math.round(budgetPerAdset)} SEK per ad set. Meta needs at least ${MIN_BUDGET_PER_ADSET} SEK/ad set to learn which ads work.`,
        context: `${zombies.length} zombie ad sets, ${underperformers.length} underperformers`,
        what_to_do:
          toKill.length > 0
            ? `Kill ${toKill.length} weak ad sets: ${toKill.map((a) => a.adset_name).join(", ")}`
            : `Consider increasing budget or reducing ad sets.`,
        what_happens_if_ignored:
          "Meta spreads budget too thin — none of your ad sets get enough data to optimize, and your CPA stays high.",
        action_data: toKill.length > 0 ? { adset_ids: toKill.map((a) => a.adset_id) } : undefined,
        button_label: toKill.length > 0 ? `Kill ${toKill.length} ad sets` : undefined,
      });
    } else if (budgetPerAdset < MIN_BUDGET_PER_ADSET) {
      recs.push({
        id: `structure_tight_${kpi.campaign_id}`,
        action: "structure_warning",
        urgency: "recommended",
        title: `${kpi.campaign_name}: Budget getting tight (${Math.round(budgetPerAdset)} SEK/ad set)`,
        reasoning: `Getting close to the minimum. Consider killing your weakest ad set to give winners more room.`,
        context: `${kpi.active_adsets} ad sets on ${kpi.daily_budget_sek} SEK/day`,
        what_to_do: "Kill your weakest ad set or increase campaign budget.",
        what_happens_if_ignored:
          "Performance slowly degrades as Meta can't optimize with limited per-ad-set budget.",
      });
    }

    // Zombie ad sets
    const zombies = campaignAdsets.filter((a) => a.status === "zombie");
    if (zombies.length > 0 && !recs.some((r) => r.id === `structure_spread_${kpi.campaign_id}`)) {
      recs.push({
        id: `structure_zombies_${kpi.campaign_id}`,
        action: "kill_deadweight",
        urgency: "recommended",
        title: `${kpi.campaign_name}: ${zombies.length} zombie ad set(s)`,
        reasoning: `These ad sets are active but Meta is barely spending on them (< ${ZOMBIE_SPEND_THRESHOLD} SEK in 7 days). Meta has decided they're not worth spending on — remove them.`,
        context: zombies.map((z) => `${z.adset_name}: ${z.spend_7d} SEK`).join(", "),
        what_to_do: `Kill: ${zombies.map((z) => z.adset_name).join(", ")}`,
        what_happens_if_ignored:
          "They add noise to your campaign without contributing. Cleaning them up helps Meta focus.",
        action_data: { adset_ids: zombies.map((z) => z.adset_id) },
        button_label: `Kill ${zombies.length} zombies`,
      });
    }

    // Spend dominance (one ad set eating > 60% of budget)
    const dominant = campaignAdsets.find(
      (a) => a.spend_share_pct > SPEND_DOMINANCE_THRESHOLD * 100
    );
    if (dominant && campaignAdsets.length > 2) {
      const starved = campaignAdsets.filter(
        (a) => a.adset_id !== dominant.adset_id && a.spend_share_pct < 10
      );
      if (starved.length > 0) {
        recs.push({
          id: `structure_dominance_${kpi.campaign_id}`,
          action: "structure_warning",
          urgency: "fyi",
          title: `${kpi.campaign_name}: One ad set dominates (${dominant.spend_share_pct}% of spend)`,
          reasoning: `"${dominant.adset_name}" is getting most of the budget. ${starved.length} ad set(s) are getting < 10% each and can't gather enough data.`,
          context: `Dominant: ${dominant.adset_name} (${dominant.spend_share_pct}%), Starved: ${starved.map((s) => s.adset_name).join(", ")}`,
          what_to_do:
            "If the starved ad sets have been running 7+ days with no conversions, kill them. The dominant one is your winner.",
          what_happens_if_ignored:
            "Low risk — Meta is naturally picking the winner. But starved ad sets waste a small amount of budget.",
        });
      }
    }
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Rule 3: Concept Need
// ---------------------------------------------------------------------------

function analyzeConceptNeed(
  kpis: CampaignMultiWindowKpi[],
  adsets: AdSetBreakdown[]
): StrategyRecommendation[] {
  const recs: StrategyRecommendation[] = [];

  // Only analyze statics campaigns (video is separate)
  const staticKpis = kpis.filter((k) => k.format === "statics");

  for (const kpi of staticKpis) {
    const campaignAdsets = adsets.filter(
      (a) => a.campaign_id === kpi.campaign_id
    );

    const winningCount = campaignAdsets.filter(
      (a) => a.status === "winning"
    ).length;
    const testingCount = campaignAdsets.filter(
      (a) => a.status === "testing"
    ).length;
    const totalActive = campaignAdsets.filter(
      (a) => a.status !== "zombie"
    ).length;

    // Calculate average age
    const ages = campaignAdsets
      .filter((a) => a.days_running !== null && a.status !== "zombie")
      .map((a) => a.days_running!);
    const avgAge =
      ages.length > 0 ? ages.reduce((sum, a) => sum + a, 0) / ages.length : 0;

    // Concept starvation
    if (winningCount < MIN_WINNING_ADSETS && totalActive < MIN_ACTIVE_ADSETS) {
      recs.push({
        id: `concepts_starved_${kpi.campaign_id}`,
        action: "add_concepts",
        urgency: "critical",
        title: `${kpi.campaign_name}: Urgently needs fresh concepts`,
        reasoning: `Only ${winningCount} winning ad set(s) and ${totalActive} total active. This campaign is running on fumes. You need diverse new concepts (different angles, formats) to find new winners.`,
        context: `Winners: ${winningCount}, Active: ${totalActive}, Testing: ${testingCount}`,
        what_to_do: `Brainstorm 3-5 new concepts for ${kpi.market}. Focus on different formats and angles (per Andromeda: diversity > variations).`,
        what_happens_if_ignored:
          "The campaign will slowly die as existing ad sets fatigue. Eventually ROAS drops below breakeven.",
        button_label: "Go to Brainstorm",
        action_data: { market: kpi.market, product: "happysleep" },
      });
    }

    // Recently pushed — cooldown
    if (testingCount >= 2) {
      recs.push({
        id: `concepts_cooldown_${kpi.campaign_id}`,
        action: "pause_and_wait",
        urgency: "fyi",
        title: `${kpi.campaign_name}: ${testingCount} concepts still testing — wait`,
        reasoning: `You recently pushed ${testingCount} new concept(s). Meta needs 7+ days to evaluate them. Don't push more until these have results.`,
        context: `Testing: ${campaignAdsets.filter((a) => a.status === "testing").map((a) => a.adset_name).join(", ")}`,
        what_to_do: "Wait. Check back in a few days to see if these new concepts find traction.",
        what_happens_if_ignored:
          "Pushing more too soon means Meta's learning phase keeps getting interrupted and nothing gets a fair test.",
      });
    }

    // Creative fatigue (old concepts, no recent pushes)
    if (
      avgAge > MAX_AVG_AGE_DAYS &&
      testingCount === 0 &&
      totalActive >= MIN_ACTIVE_ADSETS
    ) {
      recs.push({
        id: `concepts_fatigue_${kpi.campaign_id}`,
        action: "add_concepts",
        urgency: "recommended",
        title: `${kpi.campaign_name}: Creative fatigue risk (avg age: ${Math.round(avgAge)} days)`,
        reasoning: `Your active concepts average ${Math.round(avgAge)} days old. After ~3 weeks, ad fatigue typically sets in — frequency rises, CTR drops, CPA increases.`,
        context: `Avg age: ${Math.round(avgAge)}d, Winning: ${winningCount}, No recent tests`,
        what_to_do: `Brainstorm 2-3 new concepts with different formats/angles for ${kpi.market}. Your current winners will keep running while you test new ones.`,
        what_happens_if_ignored:
          "ROAS will gradually decline as audiences get tired of seeing the same ads.",
        button_label: "Go to Brainstorm",
        action_data: { market: kpi.market, product: "happysleep" },
      });
    }
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Headline computation
// ---------------------------------------------------------------------------

function computeHeadline(kpis: CampaignMultiWindowKpi[]): {
  headline: string;
  headline_tone: "positive" | "cautious" | "warning";
} {
  // Overall 30d numbers
  const totalSpend30 = kpis.reduce((sum, k) => sum + k.w30.spend, 0);
  const totalRevenue30 = kpis.reduce((sum, k) => sum + k.w30.revenue, 0);
  const overall30dRoas =
    totalSpend30 > 0
      ? Math.round((totalRevenue30 / totalSpend30) * 100) / 100
      : 0;

  // Weighted average BE-ROAS (by spend)
  const weightedBeRoas =
    totalSpend30 > 0
      ? kpis.reduce((sum, k) => sum + k.be_roas * k.w30.spend, 0) /
        totalSpend30
      : 1.7;

  const profit30 = Math.round(totalRevenue30 - totalSpend30);

  if (overall30dRoas >= weightedBeRoas * PROFITABLE_ROAS_MULTIPLIER) {
    return {
      headline: `You're profitable (30d ROAS ${overall30dRoas}x). ${profit30 > 0 ? `+${profit30} SEK profit this month.` : ""} Focus on scaling winners and testing new concepts.`,
      headline_tone: "positive",
    };
  }

  if (overall30dRoas >= weightedBeRoas) {
    return {
      headline: `You're above breakeven (30d ROAS ${overall30dRoas}x, BE ~${weightedBeRoas.toFixed(1)}x). Profitable but watch the trend — kill underperformers to improve.`,
      headline_tone: "cautious",
    };
  }

  if (overall30dRoas >= weightedBeRoas * MARGINAL_ROAS_MULTIPLIER) {
    return {
      headline: `Close to breakeven (30d ROAS ${overall30dRoas}x, BE ~${weightedBeRoas.toFixed(1)}x). Kill underperformers before adding anything new.`,
      headline_tone: "cautious",
    };
  }

  return {
    headline: `Account below breakeven (30d ROAS ${overall30dRoas}x, BE ~${weightedBeRoas.toFixed(1)}x). Pause low performers immediately.`,
    headline_tone: "warning",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatKpiContext(kpi: CampaignMultiWindowKpi): string {
  return `7d: ${kpi.w7.roas.toFixed(2)}x (${kpi.w7.purchases}p), 14d: ${kpi.w14.roas.toFixed(2)}x (${kpi.w14.purchases}p), 30d: ${kpi.w30.roas.toFixed(2)}x (${kpi.w30.purchases}p) | BE: ${kpi.be_roas}x`;
}
