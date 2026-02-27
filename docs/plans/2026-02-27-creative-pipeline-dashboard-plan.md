# Creative Pipeline Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Creative Pipeline Dashboard at `/pipeline` that tracks ad concept lifecycle (draft → testing → review → active → killed), shows smart signals for kill/scale/fatigue, and pulls performance data from Meta API.

**Architecture:** Three new Supabase tables (`pipeline_settings`, `concept_metrics`, `concept_lifecycle`) store target CPA thresholds, daily performance snapshots, and state transition history. A pipeline logic library computes stages and signals. Data syncs from Meta on page load + manual refresh. The UI is an action summary bar + Kanban-style pipeline columns.

**Tech Stack:** Next.js 15 (App Router), Supabase (PostgreSQL), Meta Marketing API v22.0, React, Tailwind CSS, lucide-react icons.

**Design doc:** `docs/plans/2026-02-27-creative-pipeline-dashboard-design.md`

---

## Task 1: Create Database Tables

**Files:**
- None (SQL via Supabase Management API)

**Step 1: Create `pipeline_settings` table**

```sql
CREATE TABLE pipeline_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL,
  country text NOT NULL,
  target_cpa numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product, country)
);

ALTER TABLE pipeline_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON pipeline_settings FOR ALL USING (true) WITH CHECK (true);
```

**Step 2: Create `concept_metrics` table**

```sql
CREATE TABLE concept_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_job_id uuid NOT NULL REFERENCES image_jobs(id) ON DELETE CASCADE,
  date date NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  cpc numeric NOT NULL DEFAULT 0,
  cpm numeric NOT NULL DEFAULT 0,
  frequency numeric NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  cpa numeric NOT NULL DEFAULT 0,
  roas numeric,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(image_job_id, date)
);

ALTER TABLE concept_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON concept_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_concept_metrics_job ON concept_metrics(image_job_id);
CREATE INDEX idx_concept_metrics_date ON concept_metrics(date);
```

**Step 3: Create `concept_lifecycle` table**

```sql
CREATE TABLE concept_lifecycle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_job_id uuid NOT NULL REFERENCES image_jobs(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('draft', 'testing', 'review', 'active', 'killed')),
  entered_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz,
  signal text,
  notes text
);

ALTER TABLE concept_lifecycle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON concept_lifecycle FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_concept_lifecycle_job ON concept_lifecycle(image_job_id);
CREATE INDEX idx_concept_lifecycle_current ON concept_lifecycle(image_job_id) WHERE exited_at IS NULL;
```

Run all three via Supabase Management API:
```bash
curl -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL HERE>"}'
```

**Step 4: Commit**
```bash
git add -A && git commit -m "chore: create pipeline database tables (settings, metrics, lifecycle)"
```

---

## Task 2: Add Pipeline Types

**Files:**
- Modify: `src/types/index.ts` (append at end)

**Step 1: Add pipeline types to `src/types/index.ts`**

Append these types at the end of the file:

```typescript
// ── Pipeline Dashboard ──────────────────────────────────────

export type PipelineStage = "draft" | "testing" | "review" | "active" | "killed";

export interface PipelineSetting {
  id: string;
  product: string;
  country: string;
  target_cpa: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface ConceptMetrics {
  id: string;
  image_job_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  conversions: number;
  cpa: number;
  roas: number | null;
  synced_at: string;
}

export interface ConceptLifecycle {
  id: string;
  image_job_id: string;
  stage: PipelineStage;
  entered_at: string;
  exited_at: string | null;
  signal: string | null;
  notes: string | null;
}

export interface PipelineSignal {
  type: "kill" | "scale" | "fatigue" | "no_spend" | "review_ready";
  reason: string;
}

export interface PipelineAlert {
  type: "publish_more" | "review_needed" | "budget_imbalance" | "all_fatiguing";
  message: string;
  priority: "high" | "medium" | "low";
}

export interface PipelineConcept {
  id: string;
  name: string;
  conceptNumber: number | null;
  product: string | null;
  thumbnailUrl: string | null;
  stage: PipelineStage;
  stageEnteredAt: string;
  daysInStage: number;
  languages: string[];
  metrics: {
    totalSpend: number;
    cpa: number;
    ctr: number;
    frequency: number;
    conversions: number;
    impressions: number;
    roas: number | null;
  } | null;
  signals: PipelineSignal[];
  targetCpa: number | null;
  currency: string | null;
  cashDna: CashDna | null;
}

export interface PipelineSummary {
  draftsReady: number;
  inTesting: number;
  needsReview: number;
  activeScaling: number;
  killed: number;
  avgCreativeAge: number;
  testingBudgetPct: number;
}

export interface PipelineData {
  concepts: PipelineConcept[];
  summary: PipelineSummary;
  alerts: PipelineAlert[];
  lastSyncedAt: string | null;
}
```

**Step 2: Commit**
```bash
git add src/types/index.ts && git commit -m "feat: add pipeline dashboard types"
```

---

## Task 3: Add `frequency` to Meta Insights API

**Files:**
- Modify: `src/lib/meta.ts` — update `getAdInsights()` fields

**Step 1: Update `getAdInsights()` to include `frequency`**

In `src/lib/meta.ts`, find the `getAdInsights()` function. Change the `fields` string from:
```typescript
const fields = "impressions,clicks,spend,ad_id,actions";
```
to:
```typescript
const fields = "impressions,clicks,spend,ctr,cpc,cpm,frequency,ad_id,actions";
```

Also update the return type to include `frequency`:
```typescript
): Promise<Array<MetaInsightsRow & { ad_id: string; frequency?: string; actions?: Array<{ action_type: string; value: string }> }>> {
```

**Step 2: Commit**
```bash
git add src/lib/meta.ts && git commit -m "feat: add frequency and full metrics to getAdInsights()"
```

---

## Task 4: Build Pipeline Logic Library

**Files:**
- Create: `src/lib/pipeline.ts`

This is the core business logic file. It handles:
1. Fetching pipeline data from Supabase + Meta
2. Computing stages from existing data
3. Detecting signals (kill, scale, fatigue)
4. Syncing metrics from Meta
5. Managing lifecycle transitions

**Step 1: Create `src/lib/pipeline.ts`**

```typescript
import { createServerSupabase } from "@/lib/supabase";
import { getAdInsights } from "@/lib/meta";
import type {
  PipelineConcept,
  PipelineStage,
  PipelineSignal,
  PipelineAlert,
  PipelineSummary,
  PipelineData,
  PipelineSetting,
  ConceptMetrics,
  CashDna,
} from "@/types";

// ── Constants ──────────────────────────────────────────────

const TESTING_DAYS = 7;           // Days before moving from testing → review
const SCALE_CONSECUTIVE_DAYS = 5; // Days CPA must be below target to auto-graduate
const SCALE_MIN_CONVERSIONS = 3;  // Minimum total conversions to auto-graduate
const FATIGUE_FREQUENCY = 2.5;    // Frequency threshold for fatigue warning
const CTR_DROP_PCT = 0.20;        // 20% CTR drop = fatigue signal
const KILL_CPA_MULTIPLIER = 2;    // Spent 2x target CPA with 0 conversions = kill
const PUBLISH_MORE_THRESHOLD = 5; // Alert when active concepts < this
const AVG_AGE_THRESHOLD = 14;     // Alert when avg creative age > this
const NO_SPEND_DAYS = 3;          // Alert when ad has $0 spend for this many days

// ── Sync: Pull metrics from Meta and update DB ─────────────

export async function syncPipelineMetrics(): Promise<void> {
  const db = createServerSupabase();

  // 1. Get all concepts with pushed Meta campaigns (not killed)
  const { data: activeConcepts } = await db
    .from("meta_campaigns")
    .select("image_job_id, meta_adset_id, meta_ads(meta_ad_id)")
    .in("status", ["pushed", "pushing"])
    .not("image_job_id", "is", null);

  if (!activeConcepts || activeConcepts.length === 0) return;

  // Build map: meta_ad_id → image_job_id
  const adToConceptMap = new Map<string, string>();
  for (const campaign of activeConcepts) {
    const ads = (campaign.meta_ads ?? []) as Array<{ meta_ad_id: string | null }>;
    for (const ad of ads) {
      if (ad.meta_ad_id && campaign.image_job_id) {
        adToConceptMap.set(ad.meta_ad_id, campaign.image_job_id);
      }
    }
  }

  if (adToConceptMap.size === 0) return;

  // 2. Pull last 30 days of ad insights from Meta (covers all active concepts)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const since = thirtyDaysAgo.toISOString().split("T")[0];
  const until = now.toISOString().split("T")[0];

  let adInsights: Array<{
    ad_id: string;
    impressions: string;
    clicks: string;
    spend: string;
    ctr: string;
    cpc: string;
    cpm: string;
    frequency?: string;
    date_start: string;
    date_stop: string;
    actions?: Array<{ action_type: string; value: string }>;
  }>;

  try {
    adInsights = await getAdInsights(since, until);
  } catch (err) {
    console.error("[Pipeline Sync] Failed to fetch Meta insights:", err);
    return;
  }

  // 3. Aggregate per concept per day
  const conceptDayMap = new Map<string, Map<string, {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    conversions: number;
    frequencyCount: number; // for averaging
  }>>();

  for (const row of adInsights) {
    const conceptId = adToConceptMap.get(row.ad_id);
    if (!conceptId) continue;

    const date = row.date_start;
    if (!conceptDayMap.has(conceptId)) conceptDayMap.set(conceptId, new Map());
    const dayMap = conceptDayMap.get(conceptId)!;

    if (!dayMap.has(date)) {
      dayMap.set(date, {
        spend: 0, impressions: 0, clicks: 0,
        ctr: 0, cpc: 0, cpm: 0, frequency: 0,
        conversions: 0, frequencyCount: 0,
      });
    }

    const day = dayMap.get(date)!;
    day.spend += parseFloat(row.spend || "0");
    day.impressions += parseInt(row.impressions || "0");
    day.clicks += parseInt(row.clicks || "0");

    const freq = parseFloat(row.frequency || "0");
    if (freq > 0) {
      day.frequency += freq;
      day.frequencyCount += 1;
    }

    // Extract purchase conversions from actions
    if (row.actions) {
      for (const action of row.actions) {
        if (action.action_type === "purchase" || action.action_type === "omni_purchase") {
          day.conversions += parseInt(action.value || "0");
        }
      }
    }
  }

  // 4. Upsert into concept_metrics
  const upsertRows: Array<{
    image_job_id: string;
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    conversions: number;
    cpa: number;
    roas: number | null;
    synced_at: string;
  }> = [];

  for (const [conceptId, dayMap] of conceptDayMap) {
    for (const [date, metrics] of dayMap) {
      const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
      const cpc = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0;
      const cpm = metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0;
      const avgFreq = metrics.frequencyCount > 0 ? metrics.frequency / metrics.frequencyCount : 0;
      const cpa = metrics.conversions > 0 ? metrics.spend / metrics.conversions : 0;

      upsertRows.push({
        image_job_id: conceptId,
        date,
        spend: metrics.spend,
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        ctr,
        cpc,
        cpm,
        frequency: avgFreq,
        conversions: metrics.conversions,
        cpa,
        roas: null, // Would need Shopify integration for revenue
        synced_at: new Date().toISOString(),
      });
    }
  }

  // Batch upsert (Supabase handles ON CONFLICT via unique constraint)
  if (upsertRows.length > 0) {
    const { error } = await db
      .from("concept_metrics")
      .upsert(upsertRows, { onConflict: "image_job_id,date" });

    if (error) {
      console.error("[Pipeline Sync] Failed to upsert metrics:", error);
    }
  }

  // 5. Run stage detection
  await detectStageTransitions();
}

// ── Stage Detection ────────────────────────────────────────

async function detectStageTransitions(): Promise<void> {
  const db = createServerSupabase();

  // Get all concepts that have been pushed (have meta_campaigns)
  const { data: pushedConcepts } = await db
    .from("meta_campaigns")
    .select("image_job_id, created_at")
    .in("status", ["pushed", "pushing"])
    .not("image_job_id", "is", null);

  if (!pushedConcepts || pushedConcepts.length === 0) return;

  // Group by concept — get earliest push date per concept
  const conceptPushDates = new Map<string, string>();
  for (const c of pushedConcepts) {
    if (!c.image_job_id) continue;
    const existing = conceptPushDates.get(c.image_job_id);
    if (!existing || c.created_at < existing) {
      conceptPushDates.set(c.image_job_id, c.created_at);
    }
  }

  // Get current lifecycle state for all pushed concepts
  const conceptIds = [...conceptPushDates.keys()];
  const { data: lifecycleRows } = await db
    .from("concept_lifecycle")
    .select("*")
    .in("image_job_id", conceptIds)
    .is("exited_at", null);

  const currentStages = new Map<string, { id: string; stage: PipelineStage; entered_at: string }>();
  for (const row of lifecycleRows ?? []) {
    currentStages.set(row.image_job_id, {
      id: row.id,
      stage: row.stage as PipelineStage,
      entered_at: row.entered_at,
    });
  }

  // Get pipeline settings for target CPA lookup
  const { data: settings } = await db
    .from("pipeline_settings")
    .select("*");

  const settingsMap = new Map<string, PipelineSetting>();
  for (const s of settings ?? []) {
    settingsMap.set(`${s.product}:${s.country}`, s as PipelineSetting);
  }

  // Get concept products for target CPA lookup
  const { data: conceptProducts } = await db
    .from("image_jobs")
    .select("id, product")
    .in("id", conceptIds);

  const productMap = new Map<string, string>();
  for (const c of conceptProducts ?? []) {
    if (c.product) productMap.set(c.id, c.product);
  }

  // Get concept countries from meta_campaigns
  const { data: conceptCountries } = await db
    .from("meta_campaigns")
    .select("image_job_id, countries")
    .in("image_job_id", conceptIds)
    .in("status", ["pushed", "pushing"]);

  const countryMap = new Map<string, string>();
  for (const c of conceptCountries ?? []) {
    if (c.image_job_id && c.countries?.length > 0) {
      // Use first country for CPA lookup
      countryMap.set(c.image_job_id, c.countries[0]);
    }
  }

  // Get aggregated metrics per concept (last 30 days total + daily breakdown)
  const { data: allMetrics } = await db
    .from("concept_metrics")
    .select("*")
    .in("image_job_id", conceptIds)
    .order("date", { ascending: true });

  const metricsPerConcept = new Map<string, ConceptMetrics[]>();
  for (const m of allMetrics ?? []) {
    if (!metricsPerConcept.has(m.image_job_id)) {
      metricsPerConcept.set(m.image_job_id, []);
    }
    metricsPerConcept.get(m.image_job_id)!.push(m as ConceptMetrics);
  }

  const now = new Date();

  for (const conceptId of conceptIds) {
    const pushDate = conceptPushDates.get(conceptId);
    if (!pushDate) continue;

    const currentStage = currentStages.get(conceptId);
    const daysSincePush = Math.floor((now.getTime() - new Date(pushDate).getTime()) / 86400000);
    const metrics = metricsPerConcept.get(conceptId) ?? [];
    const product = productMap.get(conceptId);
    const country = countryMap.get(conceptId);

    // Get target CPA
    let targetCpa: number | null = null;
    if (product && country) {
      const setting = settingsMap.get(`${product}:${country}`);
      if (setting) targetCpa = setting.target_cpa;
    }

    // Aggregate totals
    const totalSpend = metrics.reduce((sum, m) => sum + m.spend, 0);
    const totalConversions = metrics.reduce((sum, m) => sum + m.conversions, 0);

    // Determine what stage the concept SHOULD be in
    let targetStage: PipelineStage;
    let signal: string;

    // Check kill conditions first (terminal)
    if (currentStage?.stage === "killed") {
      continue; // Already killed, skip
    }

    if (targetCpa && totalSpend >= targetCpa * KILL_CPA_MULTIPLIER && totalConversions === 0) {
      targetStage = "killed";
      signal = `spent_${Math.round(totalSpend)}_with_0_conversions`;
    } else if (targetCpa && daysSincePush >= TESTING_DAYS && totalConversions > 0) {
      const overallCpa = totalSpend / totalConversions;
      if (overallCpa > targetCpa * KILL_CPA_MULTIPLIER) {
        targetStage = "killed";
        signal = `cpa_${Math.round(overallCpa)}_exceeds_2x_target_${targetCpa}`;
      } else if (checkScaleReady(metrics, targetCpa)) {
        targetStage = "active";
        signal = `cpa_below_target_for_${SCALE_CONSECUTIVE_DAYS}_days`;
      } else {
        targetStage = "review";
        signal = "7_days_elapsed";
      }
    } else if (daysSincePush >= TESTING_DAYS) {
      targetStage = "review";
      signal = "7_days_elapsed";
    } else {
      targetStage = "testing";
      signal = "pushed_to_meta";
    }

    // Transition if needed
    if (!currentStage) {
      // No lifecycle record yet — create initial state
      await db.from("concept_lifecycle").insert({
        image_job_id: conceptId,
        stage: targetStage,
        entered_at: targetStage === "testing" ? pushDate : now.toISOString(),
        signal,
      });
    } else if (currentStage.stage !== targetStage) {
      // Stage changed — close current, open new
      await db
        .from("concept_lifecycle")
        .update({ exited_at: now.toISOString() })
        .eq("id", currentStage.id);

      await db.from("concept_lifecycle").insert({
        image_job_id: conceptId,
        stage: targetStage,
        entered_at: now.toISOString(),
        signal,
      });
    }
  }
}

// Check if CPA has been below target for N consecutive recent days
function checkScaleReady(metrics: ConceptMetrics[], targetCpa: number): boolean {
  if (metrics.length < SCALE_CONSECUTIVE_DAYS) return false;

  const totalConversions = metrics.reduce((sum, m) => sum + m.conversions, 0);
  if (totalConversions < SCALE_MIN_CONVERSIONS) return false;

  // Check last N days
  const recentDays = metrics.slice(-SCALE_CONSECUTIVE_DAYS);
  return recentDays.every(day => {
    if (day.conversions === 0) return false;
    return day.cpa <= targetCpa;
  });
}

// ── Build Pipeline Data ────────────────────────────────────

export async function getPipelineData(): Promise<PipelineData> {
  const db = createServerSupabase();

  // Fetch all data in parallel
  const [
    conceptsResult,
    lifecycleResult,
    metricsResult,
    settingsResult,
    campaignsResult,
  ] = await Promise.all([
    // All completed concepts (potential drafts + pushed)
    db.from("image_jobs")
      .select("id, name, product, concept_number, target_languages, cash_dna, created_at, source_images(thumbnail_url)")
      .in("status", ["completed", "reviewing", "ready"])
      .order("created_at", { ascending: false }),
    // Current lifecycle stages
    db.from("concept_lifecycle")
      .select("*")
      .is("exited_at", null),
    // All metrics (last 30 days)
    db.from("concept_metrics")
      .select("*")
      .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]),
    // Pipeline settings
    db.from("pipeline_settings")
      .select("*"),
    // Pushed campaigns (to identify non-draft concepts)
    db.from("meta_campaigns")
      .select("image_job_id, countries, created_at")
      .in("status", ["pushed", "pushing"]),
  ]);

  const concepts = conceptsResult.data ?? [];
  const lifecycleRows = lifecycleResult.data ?? [];
  const metricsRows = metricsResult.data ?? [];
  const settingsRows = settingsResult.data ?? [];
  const campaignRows = campaignsResult.data ?? [];

  // Build lookup maps
  const stageMap = new Map<string, { stage: PipelineStage; entered_at: string }>();
  for (const row of lifecycleRows) {
    stageMap.set(row.image_job_id, { stage: row.stage as PipelineStage, entered_at: row.entered_at });
  }

  const metricsMap = new Map<string, ConceptMetrics[]>();
  for (const m of metricsRows) {
    if (!metricsMap.has(m.image_job_id)) metricsMap.set(m.image_job_id, []);
    metricsMap.get(m.image_job_id)!.push(m as ConceptMetrics);
  }

  const settingsMap = new Map<string, PipelineSetting>();
  for (const s of settingsRows) {
    settingsMap.set(`${s.product}:${s.country}`, s as PipelineSetting);
  }

  const pushedConceptIds = new Set(campaignRows.map(c => c.image_job_id).filter(Boolean));
  const conceptCountries = new Map<string, string>();
  for (const c of campaignRows) {
    if (c.image_job_id && c.countries?.length > 0 && !conceptCountries.has(c.image_job_id)) {
      conceptCountries.set(c.image_job_id, c.countries[0]);
    }
  }

  const now = new Date();
  const pipelineConcepts: PipelineConcept[] = [];

  for (const concept of concepts) {
    const isPushed = pushedConceptIds.has(concept.id);
    const lifecycle = stageMap.get(concept.id);
    const metrics = metricsMap.get(concept.id) ?? [];
    const country = conceptCountries.get(concept.id);

    // Determine stage
    let stage: PipelineStage;
    let stageEnteredAt: string;

    if (lifecycle) {
      stage = lifecycle.stage;
      stageEnteredAt = lifecycle.entered_at;
    } else if (isPushed) {
      stage = "testing";
      stageEnteredAt = now.toISOString();
    } else {
      stage = "draft";
      stageEnteredAt = concept.created_at;
    }

    const daysInStage = Math.floor(
      (now.getTime() - new Date(stageEnteredAt).getTime()) / 86400000
    );

    // Get target CPA
    let targetCpa: number | null = null;
    let currency: string | null = null;
    if (concept.product && country) {
      const setting = settingsMap.get(`${concept.product}:${country}`);
      if (setting) {
        targetCpa = setting.target_cpa;
        currency = setting.currency;
      }
    }

    // Aggregate metrics
    let conceptMetrics: PipelineConcept["metrics"] = null;
    if (metrics.length > 0) {
      const totalSpend = metrics.reduce((s, m) => s + m.spend, 0);
      const totalImpressions = metrics.reduce((s, m) => s + m.impressions, 0);
      const totalClicks = metrics.reduce((s, m) => s + m.clicks, 0);
      const totalConversions = metrics.reduce((s, m) => s + m.conversions, 0);
      const avgFrequency = metrics.length > 0
        ? metrics.reduce((s, m) => s + m.frequency, 0) / metrics.filter(m => m.frequency > 0).length || 0
        : 0;

      conceptMetrics = {
        totalSpend,
        cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        frequency: avgFrequency,
        conversions: totalConversions,
        impressions: totalImpressions,
        roas: null,
      };
    }

    // Compute signals
    const signals = computeSignals(stage, conceptMetrics, metrics, targetCpa, daysInStage);

    // Get thumbnail
    const sourceImages = (concept.source_images ?? []) as Array<{ thumbnail_url: string | null }>;
    const thumbnailUrl = sourceImages.find(si => si.thumbnail_url)?.thumbnail_url ?? null;

    pipelineConcepts.push({
      id: concept.id,
      name: concept.name,
      conceptNumber: concept.concept_number,
      product: concept.product,
      thumbnailUrl,
      stage,
      stageEnteredAt,
      daysInStage,
      languages: concept.target_languages ?? [],
      metrics: conceptMetrics,
      signals,
      targetCpa,
      currency,
      cashDna: (concept.cash_dna as CashDna) ?? null,
    });
  }

  // Compute summary
  const summary = computeSummary(pipelineConcepts);

  // Compute alerts
  const alerts = computeAlerts(pipelineConcepts, summary);

  // Get last sync time
  const { data: lastSync } = await db
    .from("concept_metrics")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1);

  return {
    concepts: pipelineConcepts,
    summary,
    alerts,
    lastSyncedAt: lastSync?.[0]?.synced_at ?? null,
  };
}

// ── Signal Computation ─────────────────────────────────────

function computeSignals(
  stage: PipelineStage,
  aggregated: PipelineConcept["metrics"],
  dailyMetrics: ConceptMetrics[],
  targetCpa: number | null,
  daysInStage: number,
): PipelineSignal[] {
  const signals: PipelineSignal[] = [];

  if (!aggregated || stage === "draft" || stage === "killed") return signals;

  // Review ready
  if (stage === "testing" && daysInStage >= TESTING_DAYS) {
    signals.push({ type: "review_ready", reason: `${daysInStage} days in testing — time to review` });
  }

  // Kill signals
  if (targetCpa) {
    if (aggregated.totalSpend >= targetCpa * KILL_CPA_MULTIPLIER && aggregated.conversions === 0) {
      signals.push({
        type: "kill",
        reason: `Spent ${Math.round(aggregated.totalSpend)} (${KILL_CPA_MULTIPLIER}x target) with 0 conversions`,
      });
    } else if (aggregated.conversions > 0 && aggregated.cpa > targetCpa * KILL_CPA_MULTIPLIER && daysInStage >= TESTING_DAYS) {
      signals.push({
        type: "kill",
        reason: `CPA ${Math.round(aggregated.cpa)} is ${KILL_CPA_MULTIPLIER}x above target ${targetCpa}`,
      });
    }
  }

  // Scale signals
  if (targetCpa && checkScaleReady(dailyMetrics, targetCpa)) {
    signals.push({
      type: "scale",
      reason: `CPA below target (${targetCpa}) for ${SCALE_CONSECUTIVE_DAYS}+ days with ${aggregated.conversions} conversions`,
    });
  }

  // Fatigue signals
  if (aggregated.frequency > FATIGUE_FREQUENCY) {
    signals.push({
      type: "fatigue",
      reason: `Frequency ${aggregated.frequency.toFixed(1)} exceeds ${FATIGUE_FREQUENCY} threshold`,
    });
  }

  // CTR drop detection
  if (dailyMetrics.length >= 5) {
    const peakCtr = Math.max(...dailyMetrics.map(m => m.ctr));
    const recentCtr = dailyMetrics.slice(-3).reduce((s, m) => s + m.ctr, 0) / 3;
    if (peakCtr > 0 && (peakCtr - recentCtr) / peakCtr >= CTR_DROP_PCT) {
      signals.push({
        type: "fatigue",
        reason: `CTR dropped ${Math.round(((peakCtr - recentCtr) / peakCtr) * 100)}% from peak`,
      });
    }
  }

  // No spend signal
  if (daysInStage >= NO_SPEND_DAYS && aggregated.totalSpend === 0) {
    signals.push({
      type: "no_spend",
      reason: `No spend after ${daysInStage} days — Meta isn't delivering this ad`,
    });
  }

  return signals;
}

// ── Summary & Alerts ───────────────────────────────────────

function computeSummary(concepts: PipelineConcept[]): PipelineSummary {
  const byStage = { draft: 0, testing: 0, review: 0, active: 0, killed: 0 };
  let totalAge = 0;
  let ageCount = 0;
  let testingSpend = 0;
  let totalSpend = 0;

  for (const c of concepts) {
    byStage[c.stage]++;

    if (c.stage === "testing" || c.stage === "review" || c.stage === "active") {
      totalAge += c.daysInStage;
      ageCount++;
    }

    if (c.metrics) {
      totalSpend += c.metrics.totalSpend;
      if (c.stage === "testing" || c.stage === "review") {
        testingSpend += c.metrics.totalSpend;
      }
    }
  }

  return {
    draftsReady: byStage.draft,
    inTesting: byStage.testing,
    needsReview: byStage.review,
    activeScaling: byStage.active,
    killed: byStage.killed,
    avgCreativeAge: ageCount > 0 ? Math.round(totalAge / ageCount) : 0,
    testingBudgetPct: totalSpend > 0 ? Math.round((testingSpend / totalSpend) * 100) : 0,
  };
}

function computeAlerts(concepts: PipelineConcept[], summary: PipelineSummary): PipelineAlert[] {
  const alerts: PipelineAlert[] = [];

  const activeAndTesting = summary.inTesting + summary.activeScaling;
  if (activeAndTesting < PUBLISH_MORE_THRESHOLD) {
    alerts.push({
      type: "publish_more",
      message: `Only ${activeAndTesting} active concepts — publish more to keep the pipeline healthy`,
      priority: "high",
    });
  }

  if (summary.avgCreativeAge > AVG_AGE_THRESHOLD && activeAndTesting > 0) {
    alerts.push({
      type: "publish_more",
      message: `Average creative age is ${summary.avgCreativeAge} days — time for fresh concepts`,
      priority: "medium",
    });
  }

  if (summary.needsReview > 0) {
    alerts.push({
      type: "review_needed",
      message: `${summary.needsReview} concept${summary.needsReview > 1 ? "s" : ""} passed 7 days — review and decide`,
      priority: "medium",
    });
  }

  const fatiguingConcepts = concepts.filter(
    c => (c.stage === "active" || c.stage === "testing") && c.signals.some(s => s.type === "fatigue")
  );
  if (fatiguingConcepts.length > 0 && fatiguingConcepts.length === activeAndTesting) {
    alerts.push({
      type: "all_fatiguing",
      message: "All active concepts showing fatigue — publish fresh creative urgently",
      priority: "high",
    });
  }

  if (summary.testingBudgetPct < 20 && summary.testingBudgetPct > 0) {
    alerts.push({
      type: "budget_imbalance",
      message: `Only ${summary.testingBudgetPct}% of spend going to testing (target: 20-30%)`,
      priority: "low",
    });
  }

  return alerts;
}

// ── Manual Actions ─────────────────────────────────────────

export async function killConcept(imageJobId: string, notes?: string): Promise<void> {
  const db = createServerSupabase();
  const now = new Date().toISOString();

  // Close current stage
  await db
    .from("concept_lifecycle")
    .update({ exited_at: now })
    .eq("image_job_id", imageJobId)
    .is("exited_at", null);

  // Enter killed stage
  await db.from("concept_lifecycle").insert({
    image_job_id: imageJobId,
    stage: "killed",
    entered_at: now,
    signal: "manual_kill",
    notes: notes || null,
  });
}
```

**Step 2: Commit**
```bash
git add src/lib/pipeline.ts && git commit -m "feat: add pipeline logic library (sync, stage detection, signals)"
```

---

## Task 5: Create Pipeline Settings API

**Files:**
- Create: `src/app/api/pipeline/settings/route.ts`

**Step 1: Create the settings API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function GET() {
  const db = createServerSupabase();

  const { data, error } = await db
    .from("pipeline_settings")
    .select("*")
    .order("product")
    .order("country");

  if (error) return safeError(error, "Failed to fetch pipeline settings");

  return NextResponse.json(data ?? []);
}

export async function PUT(req: NextRequest) {
  const { product, country, target_cpa, currency } = await req.json();

  if (!product || !country || target_cpa == null) {
    return NextResponse.json(
      { error: "product, country, and target_cpa are required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  const { data: existing } = await db
    .from("pipeline_settings")
    .select("id")
    .eq("product", product)
    .eq("country", country)
    .single();

  if (existing) {
    const { error } = await db
      .from("pipeline_settings")
      .update({ target_cpa, currency, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) return safeError(error, "Failed to update pipeline setting");
  } else {
    const { error } = await db
      .from("pipeline_settings")
      .insert({ product, country, target_cpa, currency: currency || "USD" });

    if (error) return safeError(error, "Failed to create pipeline setting");
  }

  return NextResponse.json({ ok: true });
}
```

**Step 2: Commit**
```bash
git add src/app/api/pipeline/settings/route.ts && git commit -m "feat: add pipeline settings API (GET/PUT target CPA)"
```

---

## Task 6: Create Pipeline Sync API

**Files:**
- Create: `src/app/api/pipeline/sync/route.ts`

**Step 1: Create the sync API route**

```typescript
import { NextResponse } from "next/server";
import { syncPipelineMetrics, getPipelineData } from "@/lib/pipeline";

export const maxDuration = 60;

export async function POST() {
  try {
    await syncPipelineMetrics();
    const data = await getPipelineData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[Pipeline Sync] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**
```bash
git add src/app/api/pipeline/sync/route.ts && git commit -m "feat: add pipeline sync API endpoint"
```

---

## Task 7: Create Pipeline Data API

**Files:**
- Create: `src/app/api/pipeline/route.ts`

**Step 1: Create the GET pipeline data route**

```typescript
import { NextResponse } from "next/server";
import { getPipelineData } from "@/lib/pipeline";

export async function GET() {
  try {
    const data = await getPipelineData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[Pipeline] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch pipeline data" },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**
```bash
git add src/app/api/pipeline/route.ts && git commit -m "feat: add pipeline data GET endpoint"
```

---

## Task 8: Create Pipeline Kill API

**Files:**
- Create: `src/app/api/pipeline/kill/route.ts`

**Step 1: Create the kill concept API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { killConcept } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { imageJobId, notes } = await req.json();

    if (!imageJobId) {
      return NextResponse.json({ error: "imageJobId is required" }, { status: 400 });
    }

    await killConcept(imageJobId, notes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Pipeline Kill] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to kill concept" },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**
```bash
git add src/app/api/pipeline/kill/route.ts && git commit -m "feat: add pipeline kill concept endpoint"
```

---

## Task 9: Add Pipeline to Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add Pipeline nav item to Ads group**

Import `GitBranch` (or `Workflow`) from lucide-react at the top of the file where other icons are imported.

Then in the `nav` array, add a new item inside the `Ads` group children, as the first item:

```typescript
{ href: "/pipeline", label: "Pipeline", icon: Workflow },
```

The Ads group children should become:
```typescript
children: [
  { href: "/pipeline", label: "Pipeline", icon: Workflow },
  { href: "/brainstorm", label: "Brainstorm", icon: Lightbulb },
  { href: "/images", label: "Ad Concepts", icon: Image },
  { href: "/spy", label: "Ad Spy", icon: Eye },
  { href: "/saved-ads", label: "Saved Ads", icon: Bookmark },
],
```

**Step 2: Commit**
```bash
git add src/components/layout/Sidebar.tsx && git commit -m "feat: add Pipeline to sidebar navigation"
```

---

## Task 10: Build Pipeline Dashboard UI

**Files:**
- Create: `src/app/pipeline/page.tsx`
- Create: `src/app/pipeline/PipelineClient.tsx`

This is the largest task. Build the full dashboard UI with:
- Action summary bar at top
- Kanban-style pipeline columns
- Concept cards with metrics and signals
- Expandable card detail view
- Kill button with notes modal
- Settings panel for target CPA
- Refresh/sync button

**Step 1: Create the page wrapper `src/app/pipeline/page.tsx`**

```typescript
import PipelineClient from "./PipelineClient";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  return (
    <div className="p-8">
      <PipelineClient />
    </div>
  );
}
```

**Step 2: Create `src/app/pipeline/PipelineClient.tsx`**

Build a client component with:

1. **State**: `pipelineData`, `settings`, `loading`, `syncing`, `expandedId`, `killModal`, `settingsOpen`
2. **On mount**: Fetch `GET /api/pipeline` for cached data, then auto-sync via `POST /api/pipeline/sync`
3. **Action summary bar**: 5 colored stat cards (drafts, testing, review, active, killed) + alert badges
4. **Pipeline columns**: 5 columns rendered as a horizontal scroll container. Each column has a header with count and stage-appropriate color. Cards inside each column.
5. **Concept card**: Thumbnail, name, #number, product badge, country flags, age badge, CPA vs target bar (green/yellow/red), signal badges
6. **Expanded card**: Click to expand inline — show full metrics table (spend, CTR, CPC, CPM, frequency, conversions, CPA), daily sparkline/trend if possible
7. **Kill modal**: Button on review/active cards. Opens a modal with textarea for "What did you learn?" notes. Calls `POST /api/pipeline/kill`
8. **Settings panel**: Collapsible at bottom. Table of product/country/target_cpa/currency. Editable inline. Save button calls `PUT /api/pipeline/settings`
9. **Header**: Page title "Creative Pipeline" + "Sync" button (calls `POST /api/pipeline/sync`, shows spinner) + "Last synced: X minutes ago" text

Follow the existing UI patterns:
- Use Tailwind CSS classes matching the existing design system
- Use lucide-react icons
- Use the same color palette as the rest of the hub (indigo accents, gray backgrounds, etc.)
- No external UI libraries — everything is custom Tailwind

Reference `src/app/tracking/TrackingClient.tsx` for the general page layout and stats card pattern.
Reference `src/app/settings/tabs/MetaAdsTab.tsx` for the settings panel layout pattern.
Reference the `@superpowers:frontend-design` skill for design quality.

**Step 3: Commit**
```bash
git add src/app/pipeline/ && git commit -m "feat: add creative pipeline dashboard UI"
```

---

## Task 11: Manual Testing & Polish

**Step 1: Run dev server and test the full flow**

```bash
npm run dev
```

Navigate to `/pipeline`. Verify:
- [ ] Page loads without errors
- [ ] Sync button triggers Meta data fetch
- [ ] Concepts appear in correct pipeline columns
- [ ] Draft concepts show (completed image_jobs not pushed to Meta)
- [ ] Pushed concepts show with metrics
- [ ] Kill button works and prompts for notes
- [ ] Settings panel allows setting target CPA per product/country
- [ ] Signals appear correctly (kill, scale, fatigue, no_spend)
- [ ] Alert bar shows appropriate messages
- [ ] Sidebar shows Pipeline link under Ads group

**Step 2: Fix any issues found during testing**

**Step 3: Final commit**
```bash
git add -A && git commit -m "fix: polish pipeline dashboard after manual testing"
```
