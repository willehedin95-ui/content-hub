import { getAdInsights } from "./meta";
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

async function detectStageTransitions(): Promise<void> {
  const db = createServerSupabase();
  const now = new Date().toISOString();

  // Get all pushed concepts and their earliest push date
  const { data: pushData } = await db
    .from("meta_campaigns")
    .select("image_job_id, created_at, countries, product")
    .in("status", ["pushed", "pushing"])
    .not("image_job_id", "is", null)
    .order("created_at", { ascending: true });

  if (!pushData || pushData.length === 0) return;

  // Build map: image_job_id → { earliestPush, countries, product }
  const conceptInfoMap = new Map<
    string,
    { earliestPush: string; countries: string[]; product: string | null }
  >();
  for (const row of pushData) {
    const id = row.image_job_id as string;
    const existing = conceptInfoMap.get(id);
    if (!existing || new Date(row.created_at) < new Date(existing.earliestPush)) {
      conceptInfoMap.set(id, {
        earliestPush: row.created_at,
        countries: row.countries ?? [],
        product: row.product ?? null,
      });
    } else {
      // Merge countries
      const allCountries = new Set([...existing.countries, ...(row.countries ?? [])]);
      existing.countries = [...allCountries];
    }
  }

  const conceptIds = [...conceptInfoMap.keys()];

  // Get current lifecycle stage (where exited_at IS NULL)
  const { data: lifecycleData } = await db
    .from("concept_lifecycle")
    .select("*")
    .in("image_job_id", conceptIds)
    .is("exited_at", null);

  const currentStageMap = new Map<string, ConceptLifecycle>();
  for (const row of (lifecycleData ?? []) as ConceptLifecycle[]) {
    currentStageMap.set(row.image_job_id, row);
  }

  // Get pipeline_settings for target CPA lookup
  const { data: settingsData } = await db
    .from("pipeline_settings")
    .select("*");

  const settingsMap = new Map<string, PipelineSetting>();
  for (const s of (settingsData ?? []) as PipelineSetting[]) {
    settingsMap.set(`${s.product}:${s.country}`, s);
  }

  // Get concept products from image_jobs
  const { data: jobData } = await db
    .from("image_jobs")
    .select("id, product")
    .in("id", conceptIds);

  const jobProductMap = new Map<string, string | null>();
  for (const j of jobData ?? []) {
    jobProductMap.set(j.id, j.product ?? null);
  }

  // Get aggregated metrics from concept_metrics
  const { data: metricsData } = await db
    .from("concept_metrics")
    .select("*")
    .in("image_job_id", conceptIds);

  // Group metrics by concept
  const metricsMap = new Map<string, ConceptMetrics[]>();
  for (const m of (metricsData ?? []) as ConceptMetrics[]) {
    const existing = metricsMap.get(m.image_job_id) ?? [];
    existing.push(m);
    metricsMap.set(m.image_job_id, existing);
  }

  // Determine transitions
  for (const conceptId of conceptIds) {
    const info = conceptInfoMap.get(conceptId)!;
    const currentLifecycle = currentStageMap.get(conceptId);
    const currentStage = currentLifecycle?.stage ?? null;

    // If already killed, skip
    if (currentStage === "killed") continue;

    const dailyMetrics = metricsMap.get(conceptId) ?? [];
    const daysSincePush = daysBetween(info.earliestPush, now);
    const totalSpend = dailyMetrics.reduce((s, m) => s + m.spend, 0);
    const totalConversions = dailyMetrics.reduce((s, m) => s + m.conversions, 0);
    const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

    // Look up target CPA — use first matching product:country
    const product = jobProductMap.get(conceptId) ?? info.product;
    let targetCpa: number | null = null;
    for (const country of info.countries) {
      const key = `${product}:${country}`;
      const setting = settingsMap.get(key);
      if (setting) {
        targetCpa = setting.target_cpa;
        break;
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

      // Create new lifecycle record
      await db.from("concept_lifecycle").insert({
        image_job_id: conceptId,
        stage: newStage,
        entered_at: now,
        signal,
      });
    }
  }
}

// ── Sync pipeline metrics ────────────────────────────────────

export async function syncPipelineMetrics(): Promise<{ synced: number; errors: string[] }> {
  const db = createServerSupabase();
  const errors: string[] = [];

  // Fetch all concepts with pushed Meta campaigns
  const { data: campaigns } = await db
    .from("meta_campaigns")
    .select("id, image_job_id, meta_ads(meta_ad_id)")
    .in("status", ["pushed", "pushing"])
    .not("image_job_id", "is", null);

  if (!campaigns || campaigns.length === 0) {
    return { synced: 0, errors: [] };
  }

  // Build map: meta_ad_id → image_job_id
  const adToConceptMap = new Map<string, string>();
  for (const campaign of campaigns) {
    const jobId = campaign.image_job_id as string;
    const ads = (campaign.meta_ads ?? []) as Array<{ meta_ad_id: string | null }>;
    for (const ad of ads) {
      if (ad.meta_ad_id) {
        adToConceptMap.set(ad.meta_ad_id, jobId);
      }
    }
  }

  if (adToConceptMap.size === 0) {
    return { synced: 0, errors: [] };
  }

  // Get ad insights for the last 30 days
  const { since, until } = getDateRange(30);
  let insights;
  try {
    insights = await getAdInsights(since, until);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { synced: 0, errors: [`Failed to fetch Meta insights: ${msg}`] };
  }

  // Aggregate metrics per concept per day
  // Key: `${image_job_id}:${date}`
  const aggregated = new Map<
    string,
    {
      image_job_id: string;
      date: string;
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      frequencySum: number;
      frequencyCount: number;
    }
  >();

  for (const row of insights) {
    const conceptId = adToConceptMap.get(row.ad_id);
    if (!conceptId) continue;

    const date = row.date_start; // Meta returns YYYY-MM-DD
    const key = `${conceptId}:${date}`;

    const existing = aggregated.get(key) ?? {
      image_job_id: conceptId,
      date,
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      frequencySum: 0,
      frequencyCount: 0,
    };

    existing.spend += parseFloat(row.spend) || 0;
    existing.impressions += parseInt(row.impressions) || 0;
    existing.clicks += parseInt(row.clicks) || 0;

    // Extract purchase conversions from the actions array
    if (row.actions) {
      for (const action of row.actions) {
        if (action.action_type === "purchase" || action.action_type === "omni_purchase") {
          existing.conversions += parseInt(action.value) || 0;
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

    const { error } = await db.from("concept_metrics").upsert(
      {
        image_job_id: agg.image_job_id,
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
        roas: null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "image_job_id,date" }
    );

    if (error) {
      errors.push(`Failed to upsert metrics for ${agg.image_job_id} on ${agg.date}: ${error.message}`);
    } else {
      syncedCount++;
    }
  }

  // Detect stage transitions after metrics are synced
  try {
    await detectStageTransitions();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Stage transition detection failed: ${msg}`);
  }

  return { synced: syncedCount, errors };
}

// ── Get pipeline data ────────────────────────────────────────

export async function getPipelineData(): Promise<PipelineData> {
  const db = createServerSupabase();
  const { since } = getDateRange(30);

  // Fetch everything in parallel
  const [jobsResult, lifecycleResult, metricsResult, settingsResult, campaignsResult] =
    await Promise.all([
      db
        .from("image_jobs")
        .select("id, name, product, concept_number, status, cash_dna, created_at, source_images(thumbnail_url)")
        .in("status", ["completed", "reviewing", "ready"]),
      db.from("concept_lifecycle").select("*").is("exited_at", null),
      db
        .from("concept_metrics")
        .select("*")
        .gte("date", since),
      db.from("pipeline_settings").select("*"),
      db
        .from("meta_campaigns")
        .select("image_job_id, created_at, countries, language, status")
        .in("status", ["pushed", "pushing"])
        .not("image_job_id", "is", null),
    ]);

  const jobs = jobsResult.data ?? [];
  const lifecycleRows = (lifecycleResult.data ?? []) as ConceptLifecycle[];
  const metricsRows = (metricsResult.data ?? []) as ConceptMetrics[];
  const settingsRows = (settingsResult.data ?? []) as PipelineSetting[];
  const campaignRows = campaignsResult.data ?? [];

  // Build lookup maps
  const stageMap = new Map<string, ConceptLifecycle>();
  for (const lc of lifecycleRows) {
    stageMap.set(lc.image_job_id, lc);
  }

  const metricsMap = new Map<string, ConceptMetrics[]>();
  for (const m of metricsRows) {
    const existing = metricsMap.get(m.image_job_id) ?? [];
    existing.push(m);
    metricsMap.set(m.image_job_id, existing);
  }

  const settingsLookup = new Map<string, PipelineSetting>();
  for (const s of settingsRows) {
    settingsLookup.set(`${s.product}:${s.country}`, s);
  }

  // Build pushed concept info: image_job_id → { earliestPush, languages, countries }
  const pushedMap = new Map<
    string,
    { earliestPush: string; languages: Set<string>; countries: Set<string> }
  >();
  for (const row of campaignRows) {
    const id = row.image_job_id as string;
    const existing = pushedMap.get(id);
    if (!existing) {
      pushedMap.set(id, {
        earliestPush: row.created_at,
        languages: new Set(row.language ? [row.language] : []),
        countries: new Set(row.countries ?? []),
      });
    } else {
      if (new Date(row.created_at) < new Date(existing.earliestPush)) {
        existing.earliestPush = row.created_at;
      }
      if (row.language) existing.languages.add(row.language);
      for (const c of row.countries ?? []) existing.countries.add(c);
    }
  }

  // Build concepts
  const concepts: PipelineConcept[] = [];
  let lastSyncedAt: string | null = null;

  for (const job of jobs) {
    const lifecycle = stageMap.get(job.id);
    const pushInfo = pushedMap.get(job.id);
    const dailyMetrics = metricsMap.get(job.id) ?? [];

    // Determine stage
    let stage: PipelineStage;
    let stageEnteredAt: string;
    if (lifecycle) {
      stage = lifecycle.stage;
      stageEnteredAt = lifecycle.entered_at;
    } else if (pushInfo) {
      stage = "testing";
      stageEnteredAt = pushInfo.earliestPush;
    } else {
      stage = "draft";
      stageEnteredAt = job.created_at;
    }

    // Aggregate metrics
    let metricsAgg: PipelineConcept["metrics"] = null;
    if (dailyMetrics.length > 0) {
      const totalSpend = dailyMetrics.reduce((s, m) => s + m.spend, 0);
      const totalImpressions = dailyMetrics.reduce((s, m) => s + m.impressions, 0);
      const totalClicks = dailyMetrics.reduce((s, m) => s + m.clicks, 0);
      const totalConversions = dailyMetrics.reduce((s, m) => s + m.conversions, 0);
      const avgFrequency =
        dailyMetrics.length > 0
          ? dailyMetrics.reduce((s, m) => s + m.frequency, 0) / dailyMetrics.length
          : 0;

      metricsAgg = {
        totalSpend,
        cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        frequency: avgFrequency,
        conversions: totalConversions,
        impressions: totalImpressions,
        roas: null,
      };

      // Track latest sync
      for (const m of dailyMetrics) {
        if (!lastSyncedAt || m.synced_at > lastSyncedAt) {
          lastSyncedAt = m.synced_at;
        }
      }
    }

    // Target CPA lookup
    let targetCpa: number | null = null;
    let currency: string | null = null;
    if (pushInfo) {
      for (const country of pushInfo.countries) {
        const key = `${job.product}:${country}`;
        const setting = settingsLookup.get(key);
        if (setting) {
          targetCpa = setting.target_cpa;
          currency = setting.currency;
          break;
        }
      }
    }

    // Compute signals
    const daysSincePush = pushInfo
      ? daysBetween(pushInfo.earliestPush, new Date())
      : 0;
    const signals = pushInfo
      ? computeSignals({
          stage,
          daysSincePush,
          totalSpend: metricsAgg?.totalSpend ?? 0,
          totalConversions: metricsAgg?.conversions ?? 0,
          cpa: metricsAgg?.cpa ?? 0,
          targetCpa,
          frequency: metricsAgg?.frequency ?? 0,
          dailyMetrics,
        })
      : [];

    // Get thumbnail
    const sourceImages = (job.source_images ?? []) as Array<{ thumbnail_url: string | null }>;
    const thumbnailUrl = sourceImages[0]?.thumbnail_url ?? null;

    concepts.push({
      id: job.id,
      name: job.name,
      conceptNumber: job.concept_number ?? null,
      product: job.product ?? null,
      thumbnailUrl,
      stage,
      stageEnteredAt,
      daysInStage: daysBetween(stageEnteredAt, new Date()),
      languages: pushInfo ? [...pushInfo.languages] : [],
      metrics: metricsAgg,
      signals,
      targetCpa,
      currency,
      cashDna: (job.cash_dna as CashDna | null) ?? null,
    });
  }

  // Compute summary
  const draftsReady = concepts.filter((c) => c.stage === "draft").length;
  const inTesting = concepts.filter((c) => c.stage === "testing").length;
  const needsReview = concepts.filter((c) => c.stage === "review").length;
  const activeScaling = concepts.filter((c) => c.stage === "active").length;
  const killed = concepts.filter((c) => c.stage === "killed").length;

  // Avg creative age (days since push for non-draft, non-killed)
  const activeConcepts = concepts.filter(
    (c) => c.stage !== "draft" && c.stage !== "killed"
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
    draftsReady,
    inTesting,
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
      message: `Only ${activeScaling} active concepts (target: ${PUBLISH_MORE_THRESHOLD}+). Push more concepts to testing.`,
      priority: activeScaling === 0 ? "high" : "medium",
    });
  }

  if (needsReview > 0) {
    alerts.push({
      type: "review_needed",
      message: `${needsReview} concept${needsReview > 1 ? "s" : ""} waiting for review.`,
      priority: needsReview >= 3 ? "high" : "medium",
    });
  }

  if (testingBudgetPct > 50 && totalSpend > 0) {
    alerts.push({
      type: "budget_imbalance",
      message: `${testingBudgetPct.toFixed(0)}% of budget is going to testing. Consider killing underperformers.`,
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

// ── Kill concept ─────────────────────────────────────────────

export async function killConcept(
  imageJobId: string,
  notes?: string
): Promise<void> {
  const db = createServerSupabase();
  const now = new Date().toISOString();

  // Close current lifecycle stage
  await db
    .from("concept_lifecycle")
    .update({ exited_at: now })
    .eq("image_job_id", imageJobId)
    .is("exited_at", null);

  // Create new lifecycle row with stage = "killed"
  await db.from("concept_lifecycle").insert({
    image_job_id: imageJobId,
    stage: "killed",
    entered_at: now,
    signal: "manual_kill",
    notes: notes ?? null,
  });
}
