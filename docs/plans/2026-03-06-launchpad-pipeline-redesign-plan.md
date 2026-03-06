# Launch Pad & Pipeline Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace slot-based pipeline with budget-aware auto-push, add a launch pad staging area, support concept sources (hub/external/legacy), and merge legacy SE ads.

**Architecture:** New `"launchpad"` lifecycle stage as the single source for auto-push candidates. Budget-aware push logic replaces hard slot limits. `source` field on `image_jobs` separates hub (#NNN) from external (RNNN) numbering. Legacy SE ads merged into existing concepts via one-time script.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres), Meta Graph API v22.0, Tailwind CSS, TypeScript

**Design doc:** `docs/plans/2026-03-06-launchpad-pipeline-redesign-design.md`

---

## Task 1: Database Migration — Add `source` and `launchpad_priority` to `image_jobs`

**Files:**
- Create: `scripts/migrations/2026-03-06-launchpad-columns.sql`

**Step 1: Write the migration SQL**

```sql
-- Add source column with default 'hub'
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'hub';

-- Add launchpad_priority (null = not on launch pad, lower = higher priority)
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS launchpad_priority INTEGER;

-- Backfill: mark existing "New Ad Concept" imports as 'external'
-- (These have concept folders from Google Drive and no brainstorm tags)
-- Skip for now — user will manually tag if needed

-- Index for launch pad queries
CREATE INDEX IF NOT EXISTS idx_image_jobs_launchpad
  ON image_jobs (launchpad_priority)
  WHERE launchpad_priority IS NOT NULL;
```

**Step 2: Run migration via Supabase Management API**

Run:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL from step 1>"}'
```

Expected: Empty result (no errors).

**Step 3: Verify columns exist**

Run:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = '\''image_jobs'\'' AND column_name IN ('\''source'\'', '\''launchpad_priority'\'')"}'
```

Expected: Two rows — `source TEXT 'hub'` and `launchpad_priority INTEGER null`.

**Step 4: Commit**

```bash
git add scripts/migrations/2026-03-06-launchpad-columns.sql
git commit -m "feat: add source and launchpad_priority columns to image_jobs"
```

---

## Task 2: Database Migration — Add RPC for external concept numbers

**Files:**
- Create: `scripts/migrations/2026-03-06-external-concept-number-rpc.sql`

**Step 1: Write the RPC**

```sql
CREATE OR REPLACE FUNCTION assign_next_external_concept_number(p_job_id UUID, p_product TEXT)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  -- Get max external concept number for this product
  SELECT COALESCE(MAX(concept_number), 0) + 1
  INTO next_num
  FROM image_jobs
  WHERE product = p_product
    AND source = 'external'
    AND concept_number IS NOT NULL;

  -- Assign it
  UPDATE image_jobs
  SET concept_number = next_num
  WHERE id = p_job_id;

  RETURN next_num;
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Run migration via Supabase Management API**

**Step 3: Verify RPC exists**

Run a test call:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT routine_name FROM information_schema.routines WHERE routine_name = '\''assign_next_external_concept_number'\''"}'
```

Expected: One row.

**Step 4: Commit**

```bash
git add scripts/migrations/2026-03-06-external-concept-number-rpc.sql
git commit -m "feat: add RPC for external concept number assignment"
```

---

## Task 3: Update Types — Add `source`, `launchpad_priority`, and `"launchpad"` stage

**Files:**
- Modify: `src/types/index.ts:683` (PipelineStage)
- Modify: `src/types/index.ts:773-782` (PipelineSummary)

**Step 1: Update PipelineStage type**

At line 683, change:
```typescript
export type PipelineStage = "draft" | "queued" | "testing" | "review" | "active" | "killed";
```
to:
```typescript
export type PipelineStage = "draft" | "queued" | "launchpad" | "testing" | "review" | "active" | "killed";
```

Note: Keep `"queued"` for backward compatibility with existing DB records.

**Step 2: Add source type**

After the PipelineStage line, add:
```typescript
export type ConceptSource = "hub" | "external" | "legacy";
```

**Step 3: Update PipelineSummary — replace testingSlotsUsed with budget info**

Change PipelineSummary (lines 773-782) to:
```typescript
export interface PipelineSummary {
  launchpad: number;
  inTesting: number;
  needsReview: number;
  activeScaling: number;
  killed: number;
  avgCreativeAge: number;
  availableBudgetByMarket: Record<string, { available: number; currency: string; canPush: number }>;
}
```

**Step 4: Add source/priority to PipelineConcept**

In the PipelineConcept interface (line 738), add after `product`:
```typescript
  source: ConceptSource;
  launchpadPriority: number | null;
```

**Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add launchpad stage, ConceptSource type, budget-aware summary"
```

---

## Task 4: Update `meta-push.ts` — Support R-prefix for external concepts

**Files:**
- Modify: `src/lib/meta-push.ts:76-108` (concept number assignment + ad set naming)

**Step 1: Update concept number assignment**

Replace lines 76-108 with logic that:
1. Checks `job.source` to decide which RPC to call
2. For `source === "external"`: call `assign_next_external_concept_number`
3. For `source === "hub"` (or null): call existing `assign_next_concept_number`
4. Build prefix: `source === "external"` → `"R"` else `"#"`

```typescript
  // Auto-assign concept number if not set
  let conceptNumber = job.concept_number;
  const isExternal = job.source === "external";

  if (!conceptNumber) {
    if (isExternal) {
      const { data: assigned, error: rpcError } = await db.rpc("assign_next_external_concept_number", {
        p_job_id: jobId,
        p_product: job.product,
      });
      if (!rpcError && assigned !== null) {
        conceptNumber = assigned;
      }
    }

    if (!conceptNumber) {
      // Hub concepts or fallback
      const { data: assigned, error: rpcError } = await db.rpc("assign_next_concept_number", {
        p_job_id: jobId,
        p_product: job.product,
      });

      if (rpcError || assigned === null || assigned === undefined) {
        const { data: maxRow } = await db
          .from("image_jobs")
          .select("concept_number")
          .eq("product", job.product)
          .not("concept_number", "is", null)
          .eq("source", isExternal ? "external" : "hub")
          .order("concept_number", { ascending: false })
          .limit(1)
          .single();

        conceptNumber = (maxRow?.concept_number ?? 0) + 1;

        await db
          .from("image_jobs")
          .update({ concept_number: conceptNumber })
          .eq("id", jobId);
      } else {
        conceptNumber = assigned;
      }
    }
  }

  const conceptNumberStr = String(conceptNumber).padStart(3, "0");
  const numberPrefix = isExternal ? "R" : "#";
  const conceptName = job.name.replace(/^#\d+\s*/, "").replace(/^R\d+\s*/, "").toLowerCase();
```

**Step 2: Update ad set name construction**

At line 245, change:
```typescript
const adSetName = `${country} #${conceptNumberStr} | statics | ${conceptName}`;
```
to:
```typescript
const adSetName = `${country} ${numberPrefix}${conceptNumberStr} | statics | ${conceptName}`;
```

**Step 3: Commit**

```bash
git add src/lib/meta-push.ts
git commit -m "feat: support R-prefix numbering for external concepts in Meta push"
```

---

## Task 5: Budget-Aware Push Logic — New `calculateAvailableBudget()` in `pipeline.ts`

**Files:**
- Modify: `src/lib/pipeline.ts` — add new function, keep old ones for now

**Step 1: Add `calculateAvailableBudget()` function**

Add after `getTestingSlots()` (after line 1238):

```typescript
/**
 * Calculate available testing budget per market.
 * Formula: campaign_budget - avg_winner_spend(3d) - concepts_in_testing(3d) × 150
 * Returns per-market: { available, currency, canPush }
 */
export async function calculateAvailableBudget(): Promise<
  Record<string, { available: number; currency: string; canPush: number; campaignBudget: number }>
> {
  const db = createServerSupabase();
  const BUDGET_PER_NEW_CONCEPT = 150; // kr needed per concept in testing

  // Get campaign mappings to know which campaigns serve which markets
  const { data: mappings } = await db
    .from("meta_campaign_mappings")
    .select("product, country, meta_campaign_id");

  if (!mappings || mappings.length === 0) return {};

  // Get pipeline settings for currency
  const { data: settings } = await db
    .from("pipeline_settings")
    .select("country, currency");

  const currencyMap = new Map((settings ?? []).map((s) => [s.country, s.currency]));

  // Get campaign budgets from Meta
  const uniqueCampaigns = [...new Set(mappings.map((m) => m.meta_campaign_id).filter(Boolean))];
  const budgetByCountry: Record<string, number> = {};

  for (const campaignId of uniqueCampaigns) {
    try {
      const data = await getCampaignBudget(campaignId);
      const dailyBudget = parseInt(data.daily_budget || "0", 10) / 100;
      // Find which country this campaign serves
      const mapping = mappings.find((m) => m.meta_campaign_id === campaignId);
      if (mapping) {
        budgetByCountry[mapping.country] = (budgetByCountry[mapping.country] ?? 0) + dailyBudget;
      }
    } catch {
      // Skip
    }
  }

  // Get avg daily spend per market for established concepts (last 3 days)
  // "Established" = concepts in testing for 4+ days or in review/active stage
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const sinceDate = threeDaysAgo.toISOString().split("T")[0];

  const { data: recentMetrics } = await db
    .from("concept_metrics")
    .select("image_job_market_id, spend, date")
    .gte("date", sinceDate);

  // Get market info for these metrics
  const metricMarketIds = [...new Set((recentMetrics ?? []).map((m) => m.image_job_market_id))];
  const { data: marketRows } = await db
    .from("image_job_markets")
    .select("id, market")
    .in("id", metricMarketIds);

  const marketLookup = new Map((marketRows ?? []).map((m) => [m.id, m.market]));

  // Sum spend per market over last 3 days, divide by 3 for daily avg
  const spendByMarket: Record<string, number> = {};
  for (const metric of recentMetrics ?? []) {
    const market = marketLookup.get(metric.image_job_market_id);
    if (market) {
      spendByMarket[market] = (spendByMarket[market] ?? 0) + metric.spend;
    }
  }

  // Count concepts pushed in last 3 days per market
  const { data: recentPushes } = await db
    .from("concept_lifecycle")
    .select("image_job_market_id")
    .eq("stage", "testing")
    .gte("entered_at", threeDaysAgo.toISOString());

  const recentPushMarketIds = (recentPushes ?? []).map((p) => p.image_job_market_id);
  const { data: recentPushMarkets } = await db
    .from("image_job_markets")
    .select("id, market")
    .in("id", recentPushMarketIds.length > 0 ? recentPushMarketIds : ["none"]);

  const conceptsTestingByMarket: Record<string, number> = {};
  for (const m of recentPushMarkets ?? []) {
    conceptsTestingByMarket[m.market] = (conceptsTestingByMarket[m.market] ?? 0) + 1;
  }

  // Calculate available budget per market
  const result: Record<string, { available: number; currency: string; canPush: number; campaignBudget: number }> = {};

  for (const country of Object.keys(budgetByCountry)) {
    const campaignBudget = budgetByCountry[country];
    const avgDailySpend = (spendByMarket[country] ?? 0) / 3;
    const conceptsInTesting = conceptsTestingByMarket[country] ?? 0;
    const testingCost = conceptsInTesting * BUDGET_PER_NEW_CONCEPT;
    const available = Math.max(0, campaignBudget - avgDailySpend - testingCost);
    const canPush = Math.floor(available / BUDGET_PER_NEW_CONCEPT);

    result[country] = {
      available: Math.round(available),
      currency: currencyMap.get(country) ?? "SEK",
      canPush,
      campaignBudget,
    };
  }

  return result;
}
```

**Step 2: Add `getLaunchpadConcepts()` function**

Add after `calculateAvailableBudget()`:

```typescript
/**
 * Get concepts on the launch pad, ordered by priority.
 * Returns concepts grouped by imageJobId with per-market push status.
 */
export async function getLaunchpadConcepts(): Promise<
  Array<{
    imageJobId: string;
    name: string;
    conceptNumber: number | null;
    source: string;
    product: string | null;
    thumbnailUrl: string | null;
    priority: number;
    markets: Array<{
      market: string;
      imageJobMarketId: string;
      stage: PipelineStage; // "launchpad" or "testing"/"active" etc
    }>;
  }>
> {
  const db = createServerSupabase();

  // Get all image_jobs on the launch pad
  const { data: jobs } = await db
    .from("image_jobs")
    .select("id, name, concept_number, source, product, launchpad_priority")
    .not("launchpad_priority", "is", null)
    .order("launchpad_priority", { ascending: true });

  if (!jobs || jobs.length === 0) return [];

  const jobIds = jobs.map((j) => j.id);

  // Get markets for these jobs
  const { data: markets } = await db
    .from("image_job_markets")
    .select("id, image_job_id, market")
    .in("image_job_id", jobIds);

  // Get current lifecycle stage per market
  const marketIds = (markets ?? []).map((m) => m.id);
  const { data: lifecycles } = await db
    .from("concept_lifecycle")
    .select("image_job_market_id, stage")
    .in("image_job_market_id", marketIds.length > 0 ? marketIds : ["none"])
    .is("exited_at", null);

  const stageMap = new Map((lifecycles ?? []).map((l) => [l.image_job_market_id, l.stage as PipelineStage]));

  // Get thumbnail for first source image per job
  const { data: sourceImages } = await db
    .from("source_images")
    .select("image_job_id, storage_path")
    .in("image_job_id", jobIds)
    .order("created_at", { ascending: true });

  const thumbMap = new Map<string, string>();
  for (const img of sourceImages ?? []) {
    if (!thumbMap.has(img.image_job_id)) {
      thumbMap.set(img.image_job_id, img.storage_path);
    }
  }

  return jobs.map((job) => ({
    imageJobId: job.id,
    name: job.name,
    conceptNumber: job.concept_number,
    source: job.source ?? "hub",
    product: job.product,
    thumbnailUrl: thumbMap.get(job.id) ?? null,
    priority: job.launchpad_priority!,
    markets: (markets ?? [])
      .filter((m) => m.image_job_id === job.id)
      .map((m) => ({
        market: m.market,
        imageJobMarketId: m.id,
        stage: stageMap.get(m.id) ?? "launchpad",
      })),
  }));
}
```

**Step 3: Commit**

```bash
git add src/lib/pipeline.ts
git commit -m "feat: add calculateAvailableBudget and getLaunchpadConcepts helpers"
```

---

## Task 6: Launch Pad API — CRUD endpoints

**Files:**
- Create: `src/app/api/launchpad/route.ts`
- Create: `src/app/api/launchpad/reorder/route.ts`
- Create: `src/app/api/launchpad/push/route.ts`

**Step 1: Create main GET/POST/DELETE endpoint**

`src/app/api/launchpad/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { calculateAvailableBudget, getLaunchpadConcepts } from "@/lib/pipeline";

// GET: Fetch launch pad concepts + budget info
export async function GET() {
  const [concepts, budgets] = await Promise.all([
    getLaunchpadConcepts(),
    calculateAvailableBudget(),
  ]);
  return NextResponse.json({ concepts, budgets });
}

// POST: Add concept to launch pad
export async function POST(req: NextRequest) {
  const { imageJobId } = await req.json();
  if (!imageJobId) return NextResponse.json({ error: "imageJobId required" }, { status: 400 });

  const db = createServerSupabase();

  // Validate concept is ready (has images, copy, landing page, product)
  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, product, source, target_languages, landing_page_id, ab_test_id, ad_copy_primary")
    .eq("id", imageJobId)
    .single();

  if (!job) return NextResponse.json({ error: "Concept not found" }, { status: 404 });

  const errors: string[] = [];
  if (!job.product) errors.push("Product not set");
  if (!job.landing_page_id && !job.ab_test_id) errors.push("No landing page or A/B test selected");
  if (!job.ad_copy_primary || job.ad_copy_primary.length === 0) errors.push("No ad copy");
  // TODO: Check images exist per target language/ratio

  if (errors.length > 0) {
    return NextResponse.json({ error: "Concept not ready", details: errors }, { status: 422 });
  }

  // Get next priority number
  const { data: maxPriority } = await db
    .from("image_jobs")
    .select("launchpad_priority")
    .not("launchpad_priority", "is", null)
    .order("launchpad_priority", { ascending: false })
    .limit(1)
    .single();

  const nextPriority = (maxPriority?.launchpad_priority ?? 0) + 1;

  // Set launchpad_priority
  await db
    .from("image_jobs")
    .update({ launchpad_priority: nextPriority })
    .eq("id", imageJobId);

  // Create launchpad lifecycle entries per market
  const { data: markets } = await db
    .from("image_job_markets")
    .select("id")
    .eq("image_job_id", imageJobId);

  const now = new Date().toISOString();
  for (const market of markets ?? []) {
    // Check if already has an active lifecycle
    const { data: existing } = await db
      .from("concept_lifecycle")
      .select("stage")
      .eq("image_job_market_id", market.id)
      .is("exited_at", null)
      .single();

    if (!existing) {
      await db.from("concept_lifecycle").insert({
        image_job_market_id: market.id,
        stage: "launchpad",
        entered_at: now,
        signal: "user_added_to_launchpad",
      });
    }
  }

  return NextResponse.json({ success: true, priority: nextPriority });
}

// DELETE: Remove concept from launch pad
export async function DELETE(req: NextRequest) {
  const { imageJobId } = await req.json();
  if (!imageJobId) return NextResponse.json({ error: "imageJobId required" }, { status: 400 });

  const db = createServerSupabase();

  // Clear priority
  await db
    .from("image_jobs")
    .update({ launchpad_priority: null })
    .eq("id", imageJobId);

  // Close launchpad lifecycle entries
  const { data: markets } = await db
    .from("image_job_markets")
    .select("id")
    .eq("image_job_id", imageJobId);

  const now = new Date().toISOString();
  for (const market of markets ?? []) {
    await db
      .from("concept_lifecycle")
      .update({ exited_at: now })
      .eq("image_job_market_id", market.id)
      .eq("stage", "launchpad")
      .is("exited_at", null);
  }

  return NextResponse.json({ success: true });
}
```

**Step 2: Create reorder endpoint**

`src/app/api/launchpad/reorder/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

// POST: Reorder launch pad priorities
export async function POST(req: NextRequest) {
  const { order } = await req.json(); // string[] of imageJobIds in desired order
  if (!order || !Array.isArray(order)) {
    return NextResponse.json({ error: "order array required" }, { status: 400 });
  }

  const db = createServerSupabase();

  for (let i = 0; i < order.length; i++) {
    await db
      .from("image_jobs")
      .update({ launchpad_priority: i + 1 })
      .eq("id", order[i]);
  }

  return NextResponse.json({ success: true });
}
```

**Step 3: Create push-now endpoint**

`src/app/api/launchpad/push/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { pushConceptToMeta } from "@/lib/meta-push";

const MARKET_TO_LANG: Record<string, string> = { NO: "no", DK: "da", SE: "sv", DE: "de" };

// POST: Push a concept from launch pad to Meta immediately
export async function POST(req: NextRequest) {
  const { imageJobId, markets } = await req.json(); // markets: string[] e.g. ["NO", "DK", "SE"]
  if (!imageJobId) return NextResponse.json({ error: "imageJobId required" }, { status: 400 });

  const db = createServerSupabase();

  const languages = (markets ?? ["NO", "DK", "SE"])
    .map((m: string) => MARKET_TO_LANG[m])
    .filter(Boolean);

  const pushResult = await pushConceptToMeta(imageJobId, { languages });

  // Transition lifecycle per market
  const now = new Date().toISOString();
  const { data: marketRows } = await db
    .from("image_job_markets")
    .select("id, market")
    .eq("image_job_id", imageJobId);

  for (const row of marketRows ?? []) {
    const lang = MARKET_TO_LANG[row.market];
    const langResult = pushResult.results.find((r) => r.language === lang);

    if (langResult?.status === "pushed") {
      // Close launchpad lifecycle
      await db
        .from("concept_lifecycle")
        .update({ exited_at: now })
        .eq("image_job_market_id", row.id)
        .eq("stage", "launchpad")
        .is("exited_at", null);

      // Create testing lifecycle
      await db.from("concept_lifecycle").insert({
        image_job_market_id: row.id,
        stage: "testing",
        entered_at: now,
        signal: "manual_push",
      });
    }
  }

  // Clear from launch pad if all markets pushed
  const { data: remaining } = await db
    .from("concept_lifecycle")
    .select("stage")
    .in("image_job_market_id", (marketRows ?? []).map((m) => m.id))
    .eq("stage", "launchpad")
    .is("exited_at", null);

  if (!remaining || remaining.length === 0) {
    await db
      .from("image_jobs")
      .update({ launchpad_priority: null })
      .eq("id", imageJobId);
  }

  return NextResponse.json({ success: true, results: pushResult.results });
}
```

**Step 4: Commit**

```bash
git add src/app/api/launchpad/
git commit -m "feat: add launch pad API — GET/POST/DELETE, reorder, push-now"
```

---

## Task 7: Rewrite Pipeline Push Cron — Budget-Aware Logic

**Files:**
- Modify: `src/app/api/cron/pipeline-push/route.ts:73-202`

**Step 1: Replace slot-based push logic with budget-aware push**

Replace the entire "Step 2: Push queued concepts" section (lines 73-202) with:

```typescript
    // Step 2: Push from launch pad based on available budget per market
    const budgets = await calculateAvailableBudget();
    const launchpadConcepts = await getLaunchpadConcepts();

    if (launchpadConcepts.length === 0) {
      return NextResponse.json({
        message: "Sync complete, no concepts on launch pad",
        syncedMetrics: syncResult.synced,
        stageTransitions: syncResult.transitions.length,
        pushed: 0,
      });
    }

    const MARKET_TO_LANG: Record<string, string> = { NO: "no", DK: "da", SE: "sv", DE: "de" };
    const results: Array<{ concept: string; market: string; status: string; error?: string }> = [];

    // For each market independently: check budget, push next launchpad concept
    for (const [market, budget] of Object.entries(budgets)) {
      if (budget.canPush <= 0) {
        console.log(`[Pipeline Push] ${market}: No budget for testing (${budget.available} ${budget.currency} available, need 150)`);
        continue;
      }

      // Find next launchpad concept that hasn't been pushed to this market yet
      let pushCount = 0;
      for (const concept of launchpadConcepts) {
        if (pushCount >= budget.canPush) break;

        const marketEntry = concept.markets.find((m) => m.market === market);
        if (!marketEntry || marketEntry.stage !== "launchpad") continue;

        const lang = MARKET_TO_LANG[market];
        if (!lang) continue;

        try {
          console.log(`[Pipeline Push] Pushing ${concept.name} to ${market} (budget: ${budget.available} ${budget.currency})...`);
          const pushResult = await pushConceptToMeta(concept.imageJobId, { languages: [lang] });
          const langResult = pushResult.results.find((r) => r.language === lang);

          if (langResult?.status === "pushed") {
            const now = new Date().toISOString();

            // Close launchpad lifecycle
            await db
              .from("concept_lifecycle")
              .update({ exited_at: now })
              .eq("image_job_market_id", marketEntry.imageJobMarketId)
              .eq("stage", "launchpad")
              .is("exited_at", null);

            // Create testing lifecycle
            await db.from("concept_lifecycle").insert({
              image_job_market_id: marketEntry.imageJobMarketId,
              stage: "testing",
              entered_at: now,
              signal: "auto_pushed_budget_aware",
            });

            results.push({ concept: concept.name, market, status: "pushed" });
            pushCount++;

            // Check if concept fully pushed (all markets) → clear from launch pad
            const { data: remaining } = await db
              .from("concept_lifecycle")
              .select("stage")
              .in("image_job_market_id", concept.markets.map((m) => m.imageJobMarketId))
              .eq("stage", "launchpad")
              .is("exited_at", null);

            if (!remaining || remaining.length === 0) {
              await db.from("image_jobs").update({ launchpad_priority: null }).eq("id", concept.imageJobId);
            }
          } else {
            results.push({ concept: concept.name, market, status: "failed", error: langResult?.error ?? "Unknown" });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          results.push({ concept: concept.name, market, status: "failed", error: errorMsg });
        }
      }
    }

    // Send Telegram summary
    if (results.length > 0) {
      const pushed = results.filter((r) => r.status === "pushed");
      const failed = results.filter((r) => r.status === "failed");
      const remaining = await getLaunchpadConcepts();

      const lines = [
        `🚀 Auto-push results:`,
        ...pushed.map((r) => `  ✅ ${r.concept} → ${r.market}`),
        ...failed.map((r) => `  ❌ ${r.concept} → ${r.market}: ${r.error}`),
        ``,
        `📋 Launch pad: ${remaining.length} concepts remaining`,
        ...Object.entries(budgets).map(([m, b]) => `  ${m}: ${b.available} ${b.currency} available`),
      ];

      await sendTelegramMessage(lines.join("\n"));
    }
```

Update imports at top of file to include `calculateAvailableBudget`, `getLaunchpadConcepts` from pipeline.ts.

**Step 2: Commit**

```bash
git add src/app/api/cron/pipeline-push/route.ts
git commit -m "feat: replace slot-based push with budget-aware launch pad push"
```

---

## Task 8: Add Concept-Level Kill Rules to Auto-Pause Cron

**Files:**
- Modify: `src/app/api/cron/auto-pause-bleeders/route.ts` — add concept-level kill after individual ad pauses

**Step 1: Add zombie ad set detection after individual pauses**

After the existing bleeder pause loop (after line ~122), add:

```typescript
    // === Concept-level kills ===

    // 1. Zombie cleanup: ad sets where ALL ads are paused
    const { data: activeCampaigns } = await db
      .from("meta_campaigns")
      .select("id, meta_adset_id, image_job_id, adset_name")
      .eq("status", "pushed");

    const killedAdSets: string[] = [];

    for (const campaign of activeCampaigns ?? []) {
      if (!campaign.meta_adset_id) continue;

      // Check if any active ads remain
      const { data: ads } = await db
        .from("meta_ads")
        .select("meta_ad_id, status")
        .eq("campaign_id", campaign.id);

      const activeAds = (ads ?? []).filter((a) => a.status !== "PAUSED");
      if (ads && ads.length > 0 && activeAds.length === 0) {
        // All ads paused → kill the ad set
        try {
          await updateAdSet(campaign.meta_adset_id, { status: "PAUSED" });
          killedAdSets.push(campaign.adset_name ?? campaign.meta_adset_id);

          // Mark concept as killed in lifecycle
          const { data: markets } = await db
            .from("image_job_markets")
            .select("id")
            .eq("image_job_id", campaign.image_job_id);

          for (const market of markets ?? []) {
            const { data: lifecycle } = await db
              .from("concept_lifecycle")
              .select("id, stage")
              .eq("image_job_market_id", market.id)
              .in("stage", ["testing", "review", "active"])
              .is("exited_at", null)
              .single();

            if (lifecycle) {
              const now = new Date().toISOString();
              await db.from("concept_lifecycle")
                .update({ exited_at: now })
                .eq("id", lifecycle.id);
              await db.from("concept_lifecycle").insert({
                image_job_market_id: market.id,
                stage: "killed",
                entered_at: now,
                signal: "zombie_all_ads_paused",
              });
            }
          }
        } catch (err) {
          console.error(`Failed to kill zombie ad set ${campaign.adset_name}:`, err);
        }
      }
    }

    // 2. Abandoned by Meta: < 1 kr/day for 5+ days AND zero conversions
    // (This uses concept_metrics — checked during syncPipelineMetrics/detectStageTransitions)
    // The existing detectStageTransitions handles this via the kill signal logic.

    if (killedAdSets.length > 0) {
      await sendTelegramMessage(
        `🪦 Killed ${killedAdSets.length} zombie ad set(s) (all ads paused):\n` +
        killedAdSets.map((n) => `  • ${n}`).join("\n")
      );
    }
```

**Step 2: Commit**

```bash
git add src/app/api/cron/auto-pause-bleeders/route.ts
git commit -m "feat: add concept-level zombie kill to auto-pause cron"
```

---

## Task 9: Launch Pad Page — Frontend

**Files:**
- Create: `src/app/launchpad/page.tsx`
- Create: `src/app/launchpad/LaunchpadClient.tsx`
- Modify: `src/components/layout/Sidebar.tsx:38-58` (add route)

**Step 1: Create server page wrapper**

`src/app/launchpad/page.tsx`:
```typescript
import LaunchpadClient from "./LaunchpadClient";

export default function LaunchpadPage() {
  return <LaunchpadClient />;
}
```

**Step 2: Create LaunchpadClient component**

`src/app/launchpad/LaunchpadClient.tsx`:

Build a client component that:
- Fetches `GET /api/launchpad` on mount
- Shows budget indicators at top per market (colored bars: green = can push, yellow = limited, red = no budget)
- Lists concepts in priority order as cards
- Each card shows: thumbnail, name, source badge (Hub #017 / Ron R021), product
- Per-market status columns: ✅ Live / ⏳ Waiting / ❌ Failed
- Drag handle for reorder (call `POST /api/launchpad/reorder` on drop)
- "Push Now" button per concept (call `POST /api/launchpad/push`)
- "Remove" button per concept (call `DELETE /api/launchpad`)
- Empty state: "No concepts on launch pad. Add concepts from the Concepts page."

Use existing UI patterns from the codebase (Tailwind, shadcn components if available, consistent with PipelineClient.tsx styling).

**Step 3: Add sidebar navigation entry**

In `src/components/layout/Sidebar.tsx`, add to the "Ads" group children array (after line 47):
```typescript
{ href: "/launchpad", label: "Launch Pad", icon: Rocket },
```

Import `Rocket` from `lucide-react` at the top.

**Step 4: Commit**

```bash
git add src/app/launchpad/ src/components/layout/Sidebar.tsx
git commit -m "feat: add launch pad page with budget indicators and concept cards"
```

---

## Task 10: "Add to Launch Pad" Button on Concept Detail Page

**Files:**
- Modify: The concept detail page component (likely `src/app/images/[id]/page.tsx` or similar)

**Step 1: Find the concept detail page**

Search for the concept detail page that shows individual concept info, images, ad copy, etc.

**Step 2: Add "Add to Launch Pad" button**

Add a button that:
- Only shows when concept is NOT already on launch pad (`launchpad_priority === null`)
- Calls `POST /api/launchpad` with `{ imageJobId }`
- On success: shows success toast, updates UI to show "On Launch Pad" badge
- On 422 (not ready): shows the specific errors from the response
- When already on launch pad: shows "On Launch Pad ✓" badge with "Remove" option

**Step 3: Commit**

```bash
git add src/app/images/
git commit -m "feat: add 'Add to Launch Pad' button to concept detail page"
```

---

## Task 11: Set `source: "external"` on "New Ad Concept" Flow

**Files:**
- Modify: The API endpoint or component that creates image_jobs from the "New Ad Concept" dialog

**Step 1: Find the creation endpoint**

Search for where the "New Ad Concept" dialog creates the `image_jobs` record.

**Step 2: Add `source: "external"` to the insert**

When creating a new image_job from the "New Ad Concept" flow, add `source: "external"` to the insert payload.

Concepts created from Brainstorm or competitor-swipe should get `source: "hub"` (the default).

**Step 3: Commit**

```bash
git commit -m "feat: tag New Ad Concept imports as source: external"
```

---

## Task 12: Legacy SE Import Script

**Files:**
- Create: `scripts/import-legacy-se.ts`

**Step 1: Write the import script**

A Node.js script that:
1. Fetches all active SE ad sets from Meta API
2. Checks which ones are NOT in `meta_campaigns` table
3. For each untracked SE ad set:
   a. Parse concept name from ad set name
   b. Search `image_jobs` for matching name (case-insensitive, fuzzy)
   c. If match found: create `image_job_market` (market: "SE") under existing concept
   d. If no match: create new `image_job` with `source: "legacy"`
   e. Create `meta_campaigns` record linking ad set
   f. Pull ad creative thumbnail via Meta Graph API
   g. Create `concept_lifecycle` record (stage: "testing" or "active" based on performance)
4. Print summary of what was merged/created

**Step 2: Run in dry-run mode first**

```bash
npx tsx scripts/import-legacy-se.ts --dry-run
```

Review output. Then run for real:

```bash
npx tsx scripts/import-legacy-se.ts
```

**Step 3: Commit**

```bash
git add scripts/import-legacy-se.ts
git commit -m "feat: add legacy SE import script for merging orphaned Meta ad sets"
```

---

## Task 13: Update `pipeline_settings` — Remove `testing_slots` dependency

**Files:**
- Modify: `src/lib/pipeline.ts` — mark `getTestingSlots()` as deprecated
- Modify: `src/app/pipeline/PipelineClient.tsx` — remove slots display
- Modify: `src/types/index.ts` — make `testing_slots` optional in PipelineSetting

**Step 1: Make testing_slots optional in type**

In `PipelineSetting` interface, change `testing_slots: number` to `testing_slots?: number`.

**Step 2: Add deprecation comment to getTestingSlots**

```typescript
/** @deprecated Use calculateAvailableBudget() instead. Kept for backward compat. */
export async function getTestingSlots(product: string): Promise<number> {
```

**Step 3: Update PipelineClient to show budget info instead of slots**

Replace the "X/Y testing slots" display with the per-market budget indicators from the launch pad design.

**Step 4: Commit**

```bash
git add src/lib/pipeline.ts src/app/pipeline/PipelineClient.tsx src/types/index.ts
git commit -m "refactor: deprecate testing_slots, show budget-aware indicators instead"
```

---

## Task 14: Integration Test — End-to-End Launch Pad Flow

**Step 1: Manual test checklist**

Run `npm run dev` and verify:

1. **Add to launch pad**: Open a concept → click "Add to Launch Pad" → verify it appears on `/launchpad`
2. **Validation**: Try adding a concept without a landing page → verify error message
3. **Budget display**: Check that per-market budget numbers appear and look reasonable
4. **Reorder**: Drag concepts to reorder → verify order persists on page reload
5. **Push now**: Click "Push Now" on a concept → verify it pushes to Meta and transitions to "testing"
6. **Per-market status**: After pushing to one market, verify the launch pad shows that market as ✅ while others show ⏳
7. **Remove**: Click "Remove" → verify concept leaves the launch pad
8. **Cron simulation**: Call `POST /api/cron/pipeline-push` with the cron secret → verify it picks up from launch pad based on budget

**Step 2: Verify naming**

Push a hub concept → verify ad set name: `SE #XXX | statics | name`
Push an external concept → verify ad set name: `SE RXXX | statics | name`

**Step 3: Commit any fixes**

```bash
git commit -m "fix: address issues found during integration testing"
```
