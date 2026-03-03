import Anthropic from "@anthropic-ai/sdk";
import { getAdInsightsDaily, getCampaignBudget, updateAdSet } from "./meta";
import { createServerSupabase } from "./supabase";
import type {
  PipelineStage,
  PipelineSignal,
  PipelineAlert,
  PipelineConcept,
  PipelineSummary,
  PipelineData,
  PipelineSetting,
  ConceptMetrics,
  ConceptLifecycle,
  CashDna,
  CampaignBudget,
} from "@/types";

// ── Constants ────────────────────────────────────────────────

const TESTING_DAYS = 7;
const SCALE_CONSECUTIVE_DAYS = 5;
const SCALE_MIN_CONVERSIONS = 3;
const FATIGUE_FREQUENCY = 2.5;
const CTR_DROP_PCT = 0.20;
const KILL_CPA_MULTIPLIER = 2;
const PUBLISH_MORE_THRESHOLD = 5;
const AVG_AGE_THRESHOLD = 14;
const NO_SPEND_DAYS = 3;

// ── Helpers ──────────────────────────────────────────────────

function getDateRange(days: number): { since: string; until: string } {
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  return {
    since: since.toISOString().slice(0, 10),
    until: now.toISOString().slice(0, 10),
  };
}

function daysBetween(a: string | Date, b: string | Date): number {
  const d1 = typeof a === "string" ? new Date(a) : a;
  const d2 = typeof b === "string" ? new Date(b) : b;
  return Math.floor(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Signal computation ───────────────────────────────────────

function computeSignals(opts: {
  stage: PipelineStage;
  daysSincePush: number;
  totalSpend: number;
  totalConversions: number;
  cpa: number;
  targetCpa: number | null;
  frequency: number;
  dailyMetrics: ConceptMetrics[];
}): PipelineSignal[] {
  const { stage, daysSincePush, totalSpend, totalConversions, cpa, targetCpa, frequency, dailyMetrics } = opts;
  const signals: PipelineSignal[] = [];

  // review_ready: testing stage + 7+ days
  if (stage === "testing" && daysSincePush >= TESTING_DAYS) {
    signals.push({
      type: "review_ready",
      reason: `Has been testing for ${daysSincePush} days (threshold: ${TESTING_DAYS})`,
    });
  }

  // kill: spent >= 2x target with 0 conversions
  if (targetCpa !== null && totalSpend >= KILL_CPA_MULTIPLIER * targetCpa && totalConversions === 0) {
    signals.push({
      type: "kill",
      reason: `Spent ${totalSpend.toFixed(2)} (>= 2x target CPA ${targetCpa.toFixed(2)}) with 0 conversions`,
    });
  }

  // kill: CPA > 2x target after 7+ days
  if (
    targetCpa !== null &&
    daysSincePush >= TESTING_DAYS &&
    totalConversions > 0 &&
    cpa > KILL_CPA_MULTIPLIER * targetCpa
  ) {
    signals.push({
      type: "kill",
      reason: `CPA ${cpa.toFixed(2)} > 2x target ${targetCpa.toFixed(2)} after ${daysSincePush} days`,
    });
  }

  // scale: CPA below target for 5+ consecutive days with 3+ conversions
  if (targetCpa !== null && dailyMetrics.length >= SCALE_CONSECUTIVE_DAYS) {
    const sorted = [...dailyMetrics].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    let consecutiveBelowTarget = 0;
    let totalConvsInStreak = 0;
    for (const day of sorted) {
      if (day.conversions > 0 && day.cpa > 0 && day.cpa <= targetCpa) {
        consecutiveBelowTarget++;
        totalConvsInStreak += day.conversions;
      } else {
        break;
      }
    }
    if (consecutiveBelowTarget >= SCALE_CONSECUTIVE_DAYS && totalConvsInStreak >= SCALE_MIN_CONVERSIONS) {
      signals.push({
        type: "scale",
        reason: `CPA below target for ${consecutiveBelowTarget} consecutive days with ${totalConvsInStreak} conversions`,
      });
    }
  }

  // fatigue: frequency > 2.5
  if (frequency > FATIGUE_FREQUENCY) {
    signals.push({
      type: "fatigue",
      reason: `Frequency ${frequency.toFixed(2)} exceeds threshold of ${FATIGUE_FREQUENCY}`,
    });
  }

  // fatigue: CTR dropped 20%+ from peak (compare last 3 days avg to peak)
  if (dailyMetrics.length >= 4) {
    const sorted = [...dailyMetrics].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const peakCtr = Math.max(...sorted.map((d) => d.ctr));
    if (peakCtr > 0) {
      const last3 = sorted.slice(-3);
      const avgRecentCtr = last3.reduce((sum, d) => sum + d.ctr, 0) / last3.length;
      const dropPct = (peakCtr - avgRecentCtr) / peakCtr;
      if (dropPct >= CTR_DROP_PCT) {
        signals.push({
          type: "fatigue",
          reason: `CTR dropped ${(dropPct * 100).toFixed(0)}% from peak (${peakCtr.toFixed(2)}% → ${avgRecentCtr.toFixed(2)}%)`,
        });
      }
    }
  }

  // no_spend: 3+ recent days with $0 spend
  if (dailyMetrics.length >= NO_SPEND_DAYS) {
    const sorted = [...dailyMetrics].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const recentZeroSpend = sorted.slice(0, NO_SPEND_DAYS);
    if (recentZeroSpend.every((d) => d.spend === 0)) {
      signals.push({
        type: "no_spend",
        reason: `No spend for ${NO_SPEND_DAYS}+ consecutive days`,
      });
    }
  }

  return signals;
}

// ── Stage transition detection ───────────────────────────────

export interface StageTransition {
  conceptId: string;
  conceptNumber: number | null;
  name: string;
  from: string;
  to: string;
  signal: string;
}

export async function detectStageTransitions(): Promise<StageTransition[]> {
  const transitions: StageTransition[] = [];
  const db = createServerSupabase();
  const now = new Date().toISOString();

  // Get all pushed image_job_markets
  const { data: marketData } = await db
    .from("image_job_markets")
    .select("id, image_job_id, market, meta_campaign_id, created_at")
    .not("meta_campaign_id", "is", null)
    .order("created_at", { ascending: true });

  if (!marketData || marketData.length === 0) return transitions;

  // Get associated meta_campaigns to check status
  const campaignIds = marketData
    .map((m) => m.meta_campaign_id)
    .filter(Boolean) as string[];
  const { data: campaigns } = await db
    .from("meta_campaigns")
    .select("id, status, product")
    .in("id", campaignIds)
    .in("status", ["pushed", "pushing"]);

  const campaignMap = new Map(
    (campaigns ?? []).map((c) => [c.id, c])
  );

  // Filter to only active markets
  const activeMarkets = marketData.filter((m) =>
    m.meta_campaign_id && campaignMap.has(m.meta_campaign_id)
  );

  if (activeMarkets.length === 0) return transitions;

  const marketIds = activeMarkets.map((m) => m.id);

  // Get current lifecycle stage (where exited_at IS NULL)
  const { data: lifecycleData } = await db
    .from("concept_lifecycle")
    .select("*")
    .in("image_job_market_id", marketIds)
    .is("exited_at", null);

  const currentStageMap = new Map<string, ConceptLifecycle>();
  for (const row of (lifecycleData ?? []) as ConceptLifecycle[]) {
    currentStageMap.set(row.image_job_market_id, row);
  }

  // Get pipeline_settings for target CPA lookup
  const { data: settingsData } = await db
    .from("pipeline_settings")
    .select("*");

  const settingsMap = new Map<string, PipelineSetting>();
  for (const s of (settingsData ?? []) as PipelineSetting[]) {
    settingsMap.set(`${s.product}:${s.country}`, s);
  }

  // Get concept info from image_jobs
  const imageJobIds = [...new Set(activeMarkets.map((m) => m.image_job_id))];
  const { data: jobData } = await db
    .from("image_jobs")
    .select("id, product, name, concept_number")
    .in("id", imageJobIds);

  const jobInfoMap = new Map<string, { product: string | null; name: string; conceptNumber: number | null }>();
  for (const j of jobData ?? []) {
    jobInfoMap.set(j.id, {
      product: j.product ?? null,
      name: j.name ?? "Unknown",
      conceptNumber: j.concept_number ?? null,
    });
  }

  // Get aggregated metrics from concept_metrics
  const { data: metricsData } = await db
    .from("concept_metrics")
    .select("*")
    .in("image_job_market_id", marketIds);

  // Group metrics by image_job_market_id
  const metricsMap = new Map<string, ConceptMetrics[]>();
  for (const m of (metricsData ?? []) as ConceptMetrics[]) {
    const existing = metricsMap.get(m.image_job_market_id) ?? [];
    existing.push(m);
    metricsMap.set(m.image_job_market_id, existing);
  }

  // Determine transitions for each market
  for (const market of activeMarkets) {
    const marketId = market.id;
    const currentLifecycle = currentStageMap.get(marketId);
    const currentStage = currentLifecycle?.stage ?? null;

    // If already killed, skip
    if (currentStage === "killed") continue;

    const jobInfo = jobInfoMap.get(market.image_job_id);
    if (!jobInfo) continue;

    const campaign = market.meta_campaign_id ? campaignMap.get(market.meta_campaign_id) : null;
    const product = jobInfo.product ?? campaign?.product ?? null;

    const dailyMetrics = metricsMap.get(marketId) ?? [];
    const daysSincePush = daysBetween(market.created_at, now);
    const totalSpend = dailyMetrics.reduce((s, m) => s + m.spend, 0);
    const totalConversions = dailyMetrics.reduce((s, m) => s + m.conversions, 0);
    const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

    // Look up target CPA for this market
    let targetCpa: number | null = null;
    if (product) {
      const key = `${product}:${market.market}`;
      const setting = settingsMap.get(key);
      if (setting) {
        targetCpa = setting.target_cpa;
      }
    }

    // Determine what stage it SHOULD be in
    let newStage: PipelineStage;
    let signal: string | null = null;

    if (targetCpa !== null && totalSpend >= KILL_CPA_MULTIPLIER * targetCpa && totalConversions === 0) {
      newStage = "killed";
      signal = "no_conversions_high_spend";
    } else if (
      targetCpa !== null &&
      daysSincePush >= TESTING_DAYS &&
      totalConversions > 0 &&
      cpa > KILL_CPA_MULTIPLIER * targetCpa
    ) {
      newStage = "killed";
      signal = "cpa_too_high";
    } else if (targetCpa !== null && daysSincePush >= TESTING_DAYS) {
      // Check for scale: CPA below target for 5 consecutive days with 3+ conversions
      const sorted = [...dailyMetrics].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      let consecutiveBelowTarget = 0;
      let totalConvsInStreak = 0;
      for (const day of sorted) {
        if (day.conversions > 0 && day.cpa > 0 && day.cpa <= targetCpa) {
          consecutiveBelowTarget++;
          totalConvsInStreak += day.conversions;
        } else {
          break;
        }
      }
      if (consecutiveBelowTarget >= SCALE_CONSECUTIVE_DAYS && totalConvsInStreak >= SCALE_MIN_CONVERSIONS) {
        newStage = "active";
        signal = "cpa_below_target_sustained";
      } else {
        newStage = "review";
        signal = "testing_period_complete";
      }
    } else if (daysSincePush >= TESTING_DAYS) {
      newStage = "review";
      signal = "testing_period_complete";
    } else {
      newStage = "testing";
      signal = null;
    }

    // Create/update lifecycle records when stage changes
    if (newStage !== currentStage) {
      // Close current lifecycle record
      if (currentLifecycle) {
        await db
          .from("concept_lifecycle")
          .update({ exited_at: now })
          .eq("id", currentLifecycle.id);
      }

      // Create new lifecycle record — for the initial "testing" stage,
      // use the actual push date so daysInStage is accurate
      const enteredAt =
        !currentLifecycle && newStage === "testing" ? market.created_at : now;

      // Generate AI hypothesis for auto-killed concepts
      let hypothesis: string | null = null;
      if (newStage === "killed") {
        try {
          const totalSpend = dailyMetrics.reduce((s, m) => s + m.spend, 0);
          const totalImpressions = dailyMetrics.reduce((s, m) => s + m.impressions, 0);
          const totalClicks = dailyMetrics.reduce((s, m) => s + m.clicks, 0);
          const totalRevenue = dailyMetrics.reduce((s, m) => s + (m.revenue || 0), 0);
          const totalConvs = dailyMetrics.reduce((s, m) => s + m.conversions, 0);

          const settingKey = product ? `${product}:${market.market}` : null;
          const setting = settingKey ? settingsMap.get(settingKey) : null;

          hypothesis = await generateKillHypothesis({
            name: jobInfo.name,
            conceptNumber: jobInfo.conceptNumber,
            product,
            market: market.market,
            daysTested: daysSincePush,
            totalSpend,
            impressions: totalImpressions,
            clicks: totalClicks,
            ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
            conversions: totalConvs,
            cpa,
            roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
            revenue: totalRevenue,
            targetCpa,
            targetRoas: setting?.target_roas ?? null,
            currency: setting?.currency ?? "SEK",
            killSignal: signal ?? "auto",
          });
        } catch (err) {
          console.error("[AutoKill] Hypothesis generation failed:", err);
        }
      }

      await db.from("concept_lifecycle").insert({
        image_job_market_id: marketId,
        stage: newStage,
        entered_at: enteredAt,
        signal,
        hypothesis,
      });

      // Pause Meta ad set when auto-killed (only for this specific market)
      if (newStage === "killed" && market.meta_campaign_id) {
        const campaign = campaignMap.get(market.meta_campaign_id);
        if (campaign) {
          const { data: campaignDetail } = await db
            .from("meta_campaigns")
            .select("meta_adset_id")
            .eq("id", market.meta_campaign_id)
            .single();

          if (campaignDetail?.meta_adset_id) {
            try {
              await updateAdSet(campaignDetail.meta_adset_id, { status: "PAUSED" });
            } catch (err) {
              console.error(`[Kill] Failed to pause ad set ${campaignDetail.meta_adset_id}:`, err);
            }
          }
        }
      }

      // Record transition for notifications
      transitions.push({
        conceptId: market.image_job_id,
        conceptNumber: jobInfo.conceptNumber,
        name: jobInfo.name,
        from: currentStage ?? "none",
        to: newStage,
        signal: signal ?? "auto",
      });
    }
  }

  return transitions;
}

// ── Ensure killed ad sets are paused ─────────────────────────

async function ensureKilledAdSetsPaused(): Promise<string[]> {
  const db = createServerSupabase();
  const paused: string[] = [];

  // Get all killed lifecycle records (current stage = killed)
  const { data: killedRows } = await db
    .from("concept_lifecycle")
    .select("image_job_market_id")
    .eq("stage", "killed")
    .is("exited_at", null);

  if (!killedRows || killedRows.length === 0) return paused;

  const marketIds = killedRows.map((r) => r.image_job_market_id);

  // Get their meta_campaign_ids
  const { data: markets } = await db
    .from("image_job_markets")
    .select("id, meta_campaign_id")
    .in("id", marketIds)
    .not("meta_campaign_id", "is", null);

  if (!markets || markets.length === 0) return paused;

  const campaignIds = markets.map((m) => m.meta_campaign_id).filter(Boolean) as string[];

  // Get ad set IDs for these campaigns
  const { data: campaigns } = await db
    .from("meta_campaigns")
    .select("id, meta_adset_id")
    .in("id", campaignIds)
    .not("meta_adset_id", "is", null);

  if (!campaigns || campaigns.length === 0) return paused;

  // Pause each ad set (updateAdSet is idempotent — pausing an already paused set is fine)
  for (const campaign of campaigns) {
    if (campaign.meta_adset_id) {
      try {
        await updateAdSet(campaign.meta_adset_id, { status: "PAUSED" });
        paused.push(campaign.meta_adset_id);
      } catch (err) {
        console.error(`[EnsureKilled] Failed to pause ad set ${campaign.meta_adset_id}:`, err);
      }
    }
  }

  return paused;
}

// ── Sync pipeline metrics ────────────────────────────────────

export async function syncPipelineMetrics(): Promise<{ synced: number; errors: string[]; transitions: StageTransition[] }> {
  const db = createServerSupabase();
  const errors: string[] = [];

  // Auto-repair: link orphaned meta_campaigns that have image_job_id but no image_job_markets
  try {
    const { data: allCampaigns } = await db
      .from("meta_campaigns")
      .select("id, image_job_id, countries")
      .not("image_job_id", "is", null);

    const { data: allMarkets } = await db
      .from("image_job_markets")
      .select("meta_campaign_id");

    if (allCampaigns && allMarkets) {
      const linkedCampaignIds = new Set(allMarkets.map((m) => m.meta_campaign_id).filter(Boolean));
      const orphaned = allCampaigns.filter((c) => !linkedCampaignIds.has(c.id));

      if (orphaned.length > 0) {
        const rows = orphaned
          .filter((c) => c.image_job_id && c.countries?.[0])
          .map((c) => ({
            image_job_id: c.image_job_id,
            market: c.countries[0],
            meta_campaign_id: c.id,
          }));

        if (rows.length > 0) {
          await db.from("image_job_markets").upsert(rows, { onConflict: "image_job_id,market,meta_campaign_id", ignoreDuplicates: true });
          console.log(`[Pipeline] Auto-linked ${rows.length} orphaned meta_campaigns`);
        }
      }
    }
  } catch (err) {
    console.error("[Pipeline] Auto-repair failed:", err);
  }

  // Fetch all image_job_markets with pushed Meta campaigns
  const { data: markets } = await db
    .from("image_job_markets")
    .select("id, meta_campaign_id")
    .not("meta_campaign_id", "is", null);

  if (!markets || markets.length === 0) {
    return { synced: 0, errors: [], transitions: [] };
  }

  const campaignIds = markets.map((m) => m.meta_campaign_id).filter(Boolean) as string[];

  // Get campaigns and their ads
  const { data: campaigns } = await db
    .from("meta_campaigns")
    .select("id, meta_ads(meta_ad_id)")
    .in("id", campaignIds)
    .in("status", ["pushed", "pushing"]);

  if (!campaigns || campaigns.length === 0) {
    return { synced: 0, errors: [], transitions: [] };
  }

  // Build map: meta_ad_id → image_job_market_id
  const adToMarketMap = new Map<string, string>();
  const campaignToMarketMap = new Map<string, string>();

  for (const market of markets) {
    if (market.meta_campaign_id) {
      campaignToMarketMap.set(market.meta_campaign_id, market.id);
    }
  }

  for (const campaign of campaigns) {
    const marketId = campaignToMarketMap.get(campaign.id);
    if (!marketId) continue;

    const ads = (campaign.meta_ads ?? []) as Array<{ meta_ad_id: string | null }>;
    for (const ad of ads) {
      if (ad.meta_ad_id) {
        adToMarketMap.set(ad.meta_ad_id, marketId);
      }
    }
  }

  if (adToMarketMap.size === 0) {
    return { synced: 0, errors: [], transitions: [] };
  }

  // Get ad insights for the last 60 days (daily breakdown)
  const { since, until } = getDateRange(60);
  let insights;
  try {
    insights = await getAdInsightsDaily(since, until);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { synced: 0, errors: [`Failed to fetch Meta insights: ${msg}`], transitions: [] };
  }

  // Aggregate metrics per market per day
  // Key: `${image_job_market_id}:${date}`
  const aggregated = new Map<
    string,
    {
      image_job_market_id: string;
      date: string;
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      revenue: number;
      frequencySum: number;
      frequencyCount: number;
    }
  >();

  for (const row of insights) {
    const marketId = adToMarketMap.get(row.ad_id);
    if (!marketId) continue;

    const date = row.date_start; // Meta returns YYYY-MM-DD
    const key = `${marketId}:${date}`;

    const existing = aggregated.get(key) ?? {
      image_job_market_id: marketId,
      date,
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      frequencySum: 0,
      frequencyCount: 0,
    };

    existing.spend += parseFloat(row.spend) || 0;
    existing.impressions += parseInt(row.impressions) || 0;
    existing.clicks += parseInt(row.clicks) || 0;

    // Extract purchase conversions from the actions array
    if (row.actions) {
      for (const action of row.actions) {
        if (action.action_type === "purchase") {
          existing.conversions += parseInt(action.value) || 0;
        }
      }
    }

    // Extract purchase revenue from the action_values array
    if (row.action_values) {
      for (const av of row.action_values) {
        if (av.action_type === "purchase") {
          existing.revenue += parseFloat(av.value) || 0;
        }
      }
    }

    // Frequency averaging
    const freq = parseFloat(row.frequency ?? "0");
    if (freq > 0) {
      existing.frequencySum += freq;
      existing.frequencyCount++;
    }

    aggregated.set(key, existing);
  }

  // Upsert into concept_metrics
  let syncedCount = 0;
  for (const agg of aggregated.values()) {
    const frequency = agg.frequencyCount > 0 ? agg.frequencySum / agg.frequencyCount : 0;
    const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
    const cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
    const cpm = agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0;
    const cpa = agg.conversions > 0 ? agg.spend / agg.conversions : 0;
    const roas = agg.spend > 0 ? agg.revenue / agg.spend : null;

    const { error } = await db.from("concept_metrics").upsert(
      {
        image_job_market_id: agg.image_job_market_id,
        date: agg.date,
        spend: agg.spend,
        impressions: agg.impressions,
        clicks: agg.clicks,
        ctr,
        cpc,
        cpm,
        frequency,
        conversions: agg.conversions,
        cpa,
        roas,
        revenue: agg.revenue,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "image_job_market_id,date" }
    );

    if (error) {
      errors.push(`Failed to upsert metrics for ${agg.image_job_market_id} on ${agg.date}: ${error.message}`);
    } else {
      syncedCount++;
    }
  }

  // Detect stage transitions after metrics are synced
  let transitions: StageTransition[] = [];
  try {
    transitions = await detectStageTransitions();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Stage transition detection failed: ${msg}`);
  }

  // Ensure all killed concepts have their ad sets paused (catches any missed pauses)
  try {
    await ensureKilledAdSetsPaused();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Ensure killed ad sets paused failed: ${msg}`);
  }

  return { synced: syncedCount, errors, transitions };
}

// ── Get pipeline data ────────────────────────────────────────

export async function getPipelineData(): Promise<PipelineData> {
  const db = createServerSupabase();
  const { since } = getDateRange(30);

  // Fetch everything in parallel
  const [jobsResult, marketsResult, lifecycleResult, metricsResult, settingsResult] =
    await Promise.all([
      db
        .from("image_jobs")
        .select("id, name, product, concept_number, status, cash_dna, created_at, source_images(thumbnail_url, original_url)")
        .in("status", ["completed", "reviewing", "ready"]),
      db
        .from("image_job_markets")
        .select("id, image_job_id, market, created_at")
        .not("meta_campaign_id", "is", null),
      db.from("concept_lifecycle").select("*").is("exited_at", null),
      db
        .from("concept_metrics")
        .select("*")
        .gte("date", since),
      db.from("pipeline_settings").select("*"),
    ]);

  const jobs = jobsResult.data ?? [];
  const markets = marketsResult.data ?? [];
  const lifecycleRows = (lifecycleResult.data ?? []) as ConceptLifecycle[];
  const metricsRows = (metricsResult.data ?? []) as ConceptMetrics[];
  const settingsRows = (settingsResult.data ?? []) as PipelineSetting[];

  // Build lookup maps
  const stageMap = new Map<string, ConceptLifecycle>();
  for (const lc of lifecycleRows) {
    stageMap.set(lc.image_job_market_id, lc);
  }

  const metricsMap = new Map<string, ConceptMetrics[]>();
  for (const m of metricsRows) {
    const existing = metricsMap.get(m.image_job_market_id) ?? [];
    existing.push(m);
    metricsMap.set(m.image_job_market_id, existing);
  }

  const settingsLookup = new Map<string, PipelineSetting>();
  for (const s of settingsRows) {
    settingsLookup.set(`${s.product}:${s.country}`, s);
  }

  // Build job info map
  const jobInfoMap = new Map<string, {
    name: string;
    product: string | null;
    conceptNumber: number | null;
    status: string;
    cashDna: unknown;
    createdAt: string;
    thumbnailUrl: string | null;
  }>();
  for (const job of jobs) {
    const sourceImages = (job.source_images ?? []) as Array<{ thumbnail_url: string | null; original_url: string | null }>;
    const thumbnailUrl = sourceImages[0]?.thumbnail_url ?? sourceImages[0]?.original_url ?? null;

    jobInfoMap.set(job.id, {
      name: job.name,
      product: job.product ?? null,
      conceptNumber: job.concept_number ?? null,
      status: job.status,
      cashDna: job.cash_dna,
      createdAt: job.created_at,
      thumbnailUrl,
    });
  }

  // Build concepts from markets
  const concepts: PipelineConcept[] = [];
  let lastSyncedAt: string | null = null;

  for (const market of markets) {
    const jobInfo = jobInfoMap.get(market.image_job_id);
    if (!jobInfo) continue;

    const lifecycle = stageMap.get(market.id);
    const dailyMetrics = metricsMap.get(market.id) ?? [];

    // Determine stage
    let stage: PipelineStage;
    let stageEnteredAt: string;
    if (lifecycle) {
      stage = lifecycle.stage;
      stageEnteredAt = lifecycle.entered_at;
    } else {
      stage = "testing";
      stageEnteredAt = market.created_at;
    }

    // Aggregate metrics
    let metricsAgg: PipelineConcept["metrics"] = null;
    if (dailyMetrics.length > 0) {
      const totalSpend = dailyMetrics.reduce((s, m) => s + m.spend, 0);
      const totalImpressions = dailyMetrics.reduce((s, m) => s + m.impressions, 0);
      const totalClicks = dailyMetrics.reduce((s, m) => s + m.clicks, 0);
      const totalConversions = dailyMetrics.reduce((s, m) => s + m.conversions, 0);
      const totalRevenue = dailyMetrics.reduce((s, m) => s + (m.revenue || 0), 0);
      const avgFrequency =
        dailyMetrics.length > 0
          ? dailyMetrics.reduce((s, m) => s + m.frequency, 0) / dailyMetrics.length
          : 0;

      metricsAgg = {
        totalSpend,
        cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
        cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
        frequency: avgFrequency,
        conversions: totalConversions,
        impressions: totalImpressions,
        clicks: totalClicks,
        roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
        revenue: totalRevenue,
      };

      // Track latest sync
      for (const m of dailyMetrics) {
        if (!lastSyncedAt || m.synced_at > lastSyncedAt) {
          lastSyncedAt = m.synced_at;
        }
      }
    }

    // Target CPA + ROAS lookup
    let targetCpa: number | null = null;
    let targetRoas: number | null = null;
    let currency: string | null = null;
    if (jobInfo.product) {
      const key = `${jobInfo.product}:${market.market}`;
      const setting = settingsLookup.get(key);
      if (setting) {
        targetCpa = setting.target_cpa;
        targetRoas = setting.target_roas ?? null;
        currency = setting.currency;
      }
    }

    // Compute signals
    const daysSincePush = daysBetween(market.created_at, new Date());
    const signals = computeSignals({
      stage,
      daysSincePush,
      totalSpend: metricsAgg?.totalSpend ?? 0,
      totalConversions: metricsAgg?.conversions ?? 0,
      cpa: metricsAgg?.cpa ?? 0,
      targetCpa,
      frequency: metricsAgg?.frequency ?? 0,
      dailyMetrics,
    });

    concepts.push({
      id: market.id, // image_job_market.id
      imageJobId: market.image_job_id,
      market: market.market,
      name: jobInfo.name,
      conceptNumber: jobInfo.conceptNumber,
      product: jobInfo.product,
      thumbnailUrl: jobInfo.thumbnailUrl,
      stage,
      stageEnteredAt,
      daysInStage: daysBetween(stageEnteredAt, new Date()),
      pushedAt: market.created_at,
      daysSincePush: daysBetween(market.created_at, new Date()),
      metrics: metricsAgg,
      signals,
      targetCpa,
      targetRoas,
      currency,
      cashDna: (jobInfo.cashDna as CashDna | null) ?? null,
      killHypothesis: lifecycle?.hypothesis ?? null,
      killNotes: lifecycle?.notes ?? null,
    });
  }

  // ── Add draft concepts (image_jobs not yet pushed to Meta) ──
  // Language → market mapping
  const langToMarket: Record<string, string> = { da: "DK", no: "NO", sv: "SE", de: "DE" };

  // Collect image_job IDs that already have market entries
  const jobsWithMarkets = new Set(markets.map((m) => m.image_job_id));

  // Fetch completed/ready jobs that have NO markets yet
  const { data: draftJobs } = await db
    .from("image_jobs")
    .select("id, name, product, concept_number, status, cash_dna, created_at, target_languages, source_images(thumbnail_url, original_url)")
    .in("status", ["completed", "reviewing", "ready"]);

  for (const job of draftJobs ?? []) {
    if (jobsWithMarkets.has(job.id)) continue; // already in pipeline via markets

    const sourceImages = (job.source_images ?? []) as Array<{ thumbnail_url: string | null; original_url: string | null }>;
    const thumbnailUrl = sourceImages[0]?.thumbnail_url ?? sourceImages[0]?.original_url ?? null;
    const targetLangs = (job.target_languages ?? []) as string[];

    // Create one draft entry per target market
    for (const lang of targetLangs) {
      const market = langToMarket[lang];
      if (!market) continue;

      concepts.push({
        id: `draft-${job.id}-${market}`, // synthetic ID for drafts
        imageJobId: job.id,
        market,
        name: job.name,
        conceptNumber: job.concept_number ?? null,
        product: job.product ?? null,
        thumbnailUrl,
        stage: "draft",
        stageEnteredAt: job.created_at,
        daysInStage: daysBetween(job.created_at, new Date()),
        pushedAt: job.created_at,
        daysSincePush: daysBetween(job.created_at, new Date()),
        metrics: null,
        signals: [],
        targetCpa: null,
        targetRoas: null,
        currency: null,
        cashDna: (job.cash_dna as CashDna | null) ?? null,
        killHypothesis: null,
        killNotes: null,
      });
    }
  }

  // Compute summary
  const queued = concepts.filter((c) => c.stage === "queued").length;
  const inTesting = concepts.filter((c) => c.stage === "testing").length;
  const needsReview = concepts.filter((c) => c.stage === "review").length;
  const activeScaling = concepts.filter((c) => c.stage === "active").length;
  const killed = concepts.filter((c) => c.stage === "killed").length;

  // Testing slots: get max from settings (per-product, take first found)
  const testingSlots = settingsRows.length > 0
    ? Math.max(...settingsRows.map((s) => s.testing_slots ?? 5))
    : 5;

  // Avg creative age (days since push for non-draft, non-queued, non-killed)
  const activeConcepts = concepts.filter(
    (c) => c.stage !== "draft" && c.stage !== "queued" && c.stage !== "killed"
  );
  const avgCreativeAge =
    activeConcepts.length > 0
      ? activeConcepts.reduce((sum, c) => sum + c.daysInStage, 0) / activeConcepts.length
      : 0;

  // Testing budget % (testing spend / total spend)
  const totalSpend = concepts.reduce(
    (sum, c) => sum + (c.metrics?.totalSpend ?? 0),
    0
  );
  const testingSpend = concepts
    .filter((c) => c.stage === "testing")
    .reduce((sum, c) => sum + (c.metrics?.totalSpend ?? 0), 0);
  const testingBudgetPct =
    totalSpend > 0 ? (testingSpend / totalSpend) * 100 : 0;

  const summary: PipelineSummary = {
    queued,
    inTesting,
    testingSlotsUsed: `${inTesting}/${testingSlots}`,
    needsReview,
    activeScaling,
    killed,
    avgCreativeAge,
    testingBudgetPct,
  };

  // Compute alerts
  const alerts: PipelineAlert[] = [];

  if (activeScaling < PUBLISH_MORE_THRESHOLD) {
    alerts.push({
      type: "publish_more",
      message: activeScaling === 0
        ? "No proven winners yet. Keep testing — concepts graduate to Active after 5 days of profitable ROAS."
        : `Only ${activeScaling} proven winner${activeScaling > 1 ? "s" : ""} (goal: ${PUBLISH_MORE_THRESHOLD}+). Keep pushing new concepts to build your pipeline.`,
      priority: activeScaling === 0 ? "high" : "medium",
    });
  }

  if (needsReview > 0) {
    alerts.push({
      type: "review_needed",
      message: `${needsReview} concept${needsReview > 1 ? "s have" : " has"} finished testing — check ${needsReview > 1 ? "their" : "its"} ROAS and decide: scale or kill?`,
      priority: needsReview >= 3 ? "high" : "medium",
    });
  }

  if (testingBudgetPct > 50 && totalSpend > 0) {
    alerts.push({
      type: "budget_imbalance",
      message: `${testingBudgetPct.toFixed(0)}% of your ad spend is on unproven concepts. Kill the losers so budget flows to winners.`,
      priority: "medium",
    });
  }

  const activeFatiguing = concepts.filter(
    (c) =>
      c.stage === "active" &&
      c.signals.some((s) => s.type === "fatigue")
  );
  if (activeFatiguing.length > 0 && activeFatiguing.length === activeScaling && activeScaling > 0) {
    alerts.push({
      type: "all_fatiguing",
      message: `All ${activeScaling} active concepts show fatigue signals. Fresh creatives needed urgently.`,
      priority: "high",
    });
  }

  return {
    concepts,
    summary,
    alerts,
    lastSyncedAt,
  };
}

// ── Queue helpers ────────────────────────────────────────────

/** Get queued markets ordered by entered_at (FIFO), optionally filtered by product */
export async function getQueuedConcepts(product?: string): Promise<
  Array<{ imageJobMarketId: string; imageJobId: string; market: string; name: string; conceptNumber: number | null; product: string | null; queuedAt: string }>
> {
  const db = createServerSupabase();

  // Get all queued lifecycle records
  const { data: queued } = await db
    .from("concept_lifecycle")
    .select("image_job_market_id, entered_at")
    .eq("stage", "queued")
    .is("exited_at", null)
    .order("entered_at", { ascending: true });

  if (!queued || queued.length === 0) return [];

  const marketIds = queued.map((q) => q.image_job_market_id);
  const { data: markets } = await db
    .from("image_job_markets")
    .select("id, image_job_id, market")
    .in("id", marketIds);

  if (!markets || markets.length === 0) return [];

  const imageJobIds = [...new Set(markets.map((m) => m.image_job_id))];
  const { data: jobs } = await db
    .from("image_jobs")
    .select("id, name, concept_number, product")
    .in("id", imageJobIds);

  const jobMap = new Map(
    (jobs ?? []).map((j) => [j.id, j])
  );

  const marketMap = new Map(
    markets.map((m) => [m.id, m])
  );

  return queued
    .map((q) => {
      const market = marketMap.get(q.image_job_market_id);
      if (!market) return null;
      const job = jobMap.get(market.image_job_id);
      if (!job) return null;
      if (product && job.product !== product) return null;
      return {
        imageJobMarketId: q.image_job_market_id,
        imageJobId: market.image_job_id,
        market: market.market,
        name: job.name,
        conceptNumber: job.concept_number ?? null,
        product: job.product ?? null,
        queuedAt: q.entered_at,
      };
    })
    .filter(Boolean) as Array<{ imageJobMarketId: string; imageJobId: string; market: string; name: string; conceptNumber: number | null; product: string | null; queuedAt: string }>;
}

/** Count markets currently in testing stage, optionally by product */
export async function getTestingCount(product?: string): Promise<number> {
  const db = createServerSupabase();

  if (product) {
    const { data: testingRows } = await db
      .from("concept_lifecycle")
      .select("image_job_market_id")
      .eq("stage", "testing")
      .is("exited_at", null);

    if (!testingRows || testingRows.length === 0) return 0;

    const marketIds = testingRows.map((r) => r.image_job_market_id);
    const { data: markets } = await db
      .from("image_job_markets")
      .select("image_job_id")
      .in("id", marketIds);

    if (!markets || markets.length === 0) return 0;

    const imageJobIds = [...new Set(markets.map((m) => m.image_job_id))];
    const { count } = await db
      .from("image_jobs")
      .select("id", { count: "exact", head: true })
      .in("id", imageJobIds)
      .eq("product", product);

    return count ?? 0;
  }

  const { count } = await db
    .from("concept_lifecycle")
    .select("image_job_market_id", { count: "exact", head: true })
    .eq("stage", "testing")
    .is("exited_at", null);

  return count ?? 0;
}

/** Get testing_slots setting for a product (takes max across all countries for that product) */
export async function getTestingSlots(product: string): Promise<number> {
  const db = createServerSupabase();
  const { data } = await db
    .from("pipeline_settings")
    .select("testing_slots")
    .eq("product", product);

  if (!data || data.length === 0) return 5; // default
  return Math.max(...data.map((r) => r.testing_slots ?? 5));
}

// ── Queue concept ────────────────────────────────────────────

export async function queueConcept(imageJobMarketId: string): Promise<{ position: number }> {
  const db = createServerSupabase();
  const now = new Date().toISOString();

  // Check if already queued or in pipeline
  const { data: existing } = await db
    .from("concept_lifecycle")
    .select("stage")
    .eq("image_job_market_id", imageJobMarketId)
    .is("exited_at", null)
    .single();

  if (existing) {
    throw new Error(`Market is already in stage: ${existing.stage}`);
  }

  // Create lifecycle record with stage "queued"
  await db.from("concept_lifecycle").insert({
    image_job_market_id: imageJobMarketId,
    stage: "queued",
    entered_at: now,
    signal: "user_queued",
  });

  // Calculate queue position
  const { count } = await db
    .from("concept_lifecycle")
    .select("*", { count: "exact", head: true })
    .eq("stage", "queued")
    .is("exited_at", null);

  return { position: count ?? 1 };
}

export async function unqueueConcept(imageJobMarketId: string): Promise<void> {
  const db = createServerSupabase();

  // Delete the queued lifecycle record
  await db
    .from("concept_lifecycle")
    .delete()
    .eq("image_job_market_id", imageJobMarketId)
    .eq("stage", "queued")
    .is("exited_at", null);
}

// ── AI hypothesis for killed concepts ────────────────────────

async function generateKillHypothesis(opts: {
  name: string;
  conceptNumber: number | null;
  product: string | null;
  market: string;
  daysTested: number;
  totalSpend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa: number;
  roas: number | null;
  revenue: number;
  targetCpa: number | null;
  targetRoas: number | null;
  currency: string;
  killSignal: string;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "AI hypothesis unavailable (no API key configured).";

  const client = new Anthropic({ apiKey });
  const prompt = `You are a performance marketing analyst. A Meta ad concept was killed after testing.

Concept: "${opts.name}"${opts.conceptNumber ? ` (#${opts.conceptNumber})` : ""}
Product: ${opts.product || "unknown"}
Market: ${opts.market}
Days tested: ${opts.daysTested}
Total spend: ${opts.totalSpend.toFixed(0)} ${opts.currency}
Impressions: ${opts.impressions.toLocaleString()}
Clicks: ${opts.clicks.toLocaleString()}
CTR: ${opts.ctr.toFixed(2)}%
Conversions: ${opts.conversions}
CPA: ${opts.conversions > 0 ? `${opts.cpa.toFixed(0)} ${opts.currency}` : "N/A (no conversions)"}${opts.targetCpa ? ` (target: ${opts.targetCpa.toFixed(0)} ${opts.currency})` : ""}
ROAS: ${opts.roas !== null ? `${opts.roas.toFixed(2)}x` : "N/A"}${opts.targetRoas ? ` (target: ${opts.targetRoas.toFixed(2)}x)` : ""}
Revenue: ${opts.revenue.toFixed(0)} ${opts.currency}
Kill reason: ${opts.killSignal}

In 2-3 sentences, hypothesize why this concept underperformed. Consider: weak hook, audience mismatch, poor offer framing, creative fatigue, low relevance, or competitive pressure. Be specific and actionable — suggest what to try differently next time.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text ?? "No hypothesis generated.";
  } catch (err) {
    console.error("[Hypothesis] Claude API error:", err);
    return "AI hypothesis failed to generate.";
  }
}

// ── Kill concept ─────────────────────────────────────────────

export async function killConcept(
  imageJobMarketId: string,
  notes?: string
): Promise<void> {
  const db = createServerSupabase();
  const now = new Date().toISOString();

  // Get the market and its campaign
  const { data: market } = await db
    .from("image_job_markets")
    .select("id, image_job_id, market, meta_campaign_id, created_at")
    .eq("id", imageJobMarketId)
    .single();

  if (!market) {
    throw new Error(`Market ${imageJobMarketId} not found`);
  }

  // Pause the Meta ad set for this specific market (if campaign exists)
  if (market.meta_campaign_id) {
    const { data: campaign } = await db
      .from("meta_campaigns")
      .select("meta_adset_id")
      .eq("id", market.meta_campaign_id)
      .single();

    if (campaign?.meta_adset_id) {
      try {
        await updateAdSet(campaign.meta_adset_id, { status: "PAUSED" });
      } catch (err) {
        console.error(`[Kill] Failed to pause ad set ${campaign.meta_adset_id}:`, err);
      }
    }
  }

  // Generate AI hypothesis from metrics
  let hypothesis: string | null = null;
  try {
    // Gather concept info and metrics for hypothesis
    const { data: jobInfo } = await db
      .from("image_jobs")
      .select("name, product, concept_number")
      .eq("id", market.image_job_id)
      .single();

    const { data: metricsRows } = await db
      .from("concept_metrics")
      .select("*")
      .eq("image_job_market_id", imageJobMarketId);

    const dailyMetrics = (metricsRows ?? []) as ConceptMetrics[];
    const totalSpend = dailyMetrics.reduce((s, m) => s + m.spend, 0);
    const totalImpressions = dailyMetrics.reduce((s, m) => s + m.impressions, 0);
    const totalClicks = dailyMetrics.reduce((s, m) => s + m.clicks, 0);
    const totalConversions = dailyMetrics.reduce((s, m) => s + m.conversions, 0);
    const totalRevenue = dailyMetrics.reduce((s, m) => s + (m.revenue || 0), 0);
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;

    // Get target CPA/ROAS and currency from settings
    let targetCpa: number | null = null;
    let targetRoas: number | null = null;
    let currency = "SEK";
    if (jobInfo?.product) {
      const { data: setting } = await db
        .from("pipeline_settings")
        .select("target_cpa, target_roas, currency")
        .eq("product", jobInfo.product)
        .eq("country", market.market)
        .single();
      if (setting) {
        targetCpa = setting.target_cpa;
        targetRoas = setting.target_roas;
        currency = setting.currency;
      }
    }

    hypothesis = await generateKillHypothesis({
      name: jobInfo?.name ?? "Unknown",
      conceptNumber: jobInfo?.concept_number ?? null,
      product: jobInfo?.product ?? null,
      market: market.market,
      daysTested: daysBetween(market.created_at, now),
      totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr,
      conversions: totalConversions,
      cpa,
      roas,
      revenue: totalRevenue,
      targetCpa,
      targetRoas,
      currency,
      killSignal: "manual_kill",
    });
  } catch (err) {
    console.error("[Kill] Hypothesis generation failed:", err);
  }

  // Close current lifecycle stage
  await db
    .from("concept_lifecycle")
    .update({ exited_at: now })
    .eq("image_job_market_id", imageJobMarketId)
    .is("exited_at", null);

  // Create new lifecycle row with stage = "killed"
  await db.from("concept_lifecycle").insert({
    image_job_market_id: imageJobMarketId,
    stage: "killed",
    entered_at: now,
    signal: "manual_kill",
    notes: notes ?? null,
    hypothesis,
  });
}

// ── Campaign budgets ──────────────────────────────────────────

export async function getCampaignBudgets(): Promise<CampaignBudget[]> {
  const db = createServerSupabase();

  // Get distinct meta_campaign_id values with their countries and product
  const { data: mappings } = await db
    .from("meta_campaign_mappings")
    .select("meta_campaign_id, country, product");

  if (!mappings || mappings.length === 0) return [];

  // Group countries by campaign ID
  const campaignInfoMap = new Map<string, { countries: Set<string>; product: string | null }>();
  for (const m of mappings) {
    if (!m.meta_campaign_id) continue;
    const existing = campaignInfoMap.get(m.meta_campaign_id);
    if (existing) {
      existing.countries.add(m.country);
    } else {
      campaignInfoMap.set(m.meta_campaign_id, {
        countries: new Set([m.country]),
        product: m.product ?? null,
      });
    }
  }

  // Get currency from pipeline_settings (per country)
  const { data: settingsData } = await db
    .from("pipeline_settings")
    .select("country, currency")
    .limit(10);
  const currencyMap = new Map<string, string>();
  for (const s of settingsData ?? []) {
    currencyMap.set(s.country, s.currency);
  }

  // Fetch budget from Meta API for each campaign
  const budgets: CampaignBudget[] = [];
  for (const [campaignId, info] of campaignInfoMap) {
    try {
      const data = await getCampaignBudget(campaignId);
      // Meta returns daily_budget in cents (integer string) in account currency
      const dailyBudgetCents = parseInt(data.daily_budget || "0", 10);
      // Determine currency from the campaign's country settings
      const firstCountry = [...info.countries][0];
      const currency = currencyMap.get(firstCountry) || "SEK";
      budgets.push({
        campaignId,
        name: data.name || campaignId,
        dailyBudget: dailyBudgetCents / 100,
        currency,
        countries: [...info.countries],
      });
    } catch {
      // Skip campaigns that fail (deleted, etc.)
    }
  }

  return budgets;
}
