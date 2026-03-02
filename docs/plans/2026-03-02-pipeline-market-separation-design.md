# Pipeline Market Separation — Design Doc

> Date: 2026-03-02
> Status: Approved
> Approach: New `pipeline_concepts` table as intermediary

## Problem

The Creative Pipeline currently aggregates concepts across all markets. When a concept is pushed to both Danish (DA) and Norwegian (NO) markets:

1. **Can't make market-specific decisions** — Killing a concept kills it in all markets
2. **Can't see market-specific performance** — Metrics (spend, ROAS, conversions) are summed across all markets
3. **UI shows confusing state** — Card displays "DA, NO" when DK filter is selected, making it unclear which market the data represents
4. **Currency displays incorrectly** — Shows local currency (DKK, NOK) instead of SEK (actual spend/revenue currency)
5. **No budget guidance** — Budget section shows spend per concept but doesn't guide optimization decisions

## Solution

Redesign the pipeline to treat **each concept × market combination as a separate pipeline entity**. Create a `pipeline_concepts` table that represents one concept in one market. Retroactively split all existing concepts and re-fetch per-market metrics from Meta.

## Requirements Summary

1. **Retroactive split** — All existing concepts split by market, not just new pushes
2. **Per-market metrics from day 1** — Re-fetch Meta data per market for clean historical data
3. **Separate cards per market** — "All" tab shows all market entries as distinct cards
4. **Same concept number across markets** — Both markets show "#2", differentiated by market badge
5. **SEK everywhere** — All metrics display in SEK (actual spend/revenue currency)
6. **Simple budget alerts** — Flag low per-concept budget with actionable guidance

---

## Data Model

### New Table: `pipeline_concepts`

This table represents **one concept in one market** — the canonical pipeline entity.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| image_job_id | uuid | FK → image_jobs.id |
| market | text | "SE", "DK", "NO", "DE" (from COUNTRY_MAP) |
| meta_campaign_id | uuid | FK → meta_campaigns.id (the specific market's campaign record) |
| created_at | timestamptz | When this market entry was created |

**Unique constraint:** `(image_job_id, market)` — one pipeline entry per concept per market

**Index:** `(image_job_id)` for fast lookups when showing all markets of a concept

### Modified Tables

**`concept_lifecycle`**
- **Remove:** `image_job_id` column
- **Add:** `pipeline_concept_id` uuid FK → pipeline_concepts.id
- No other changes needed

**`concept_metrics`**
- **Remove:** `image_job_id` column
- **Add:** `pipeline_concept_id` uuid FK → pipeline_concepts.id
- Unique constraint becomes: `(pipeline_concept_id, date)`

**`pipeline_settings`**
- **Change:** `currency` column → always "SEK" (or remove it and hardcode in app)
- Keep `target_cpa` and `target_roas` per product/country
- Country codes: "SE", "DK", "NO" (uppercase for consistency with pipeline_concepts.market)

### Data Relationships

```
image_jobs (concept)
    ↓ one-to-many
pipeline_concepts (concept × market)
    ↓ one-to-many
concept_lifecycle (stage history per market)
concept_metrics (daily performance per market)
```

---

## Migration Strategy

### Step 1: Create `pipeline_concepts` from existing `meta_campaigns`

For every unique `(image_job_id, language)` pair in `meta_campaigns` where status is "pushed" or "pushing":

```sql
INSERT INTO pipeline_concepts (image_job_id, market, meta_campaign_id, created_at)
SELECT
  image_job_id,
  CASE language
    WHEN 'sv' THEN 'SE'
    WHEN 'da' THEN 'DK'
    WHEN 'no' THEN 'NO'
    WHEN 'de' THEN 'DE'
  END as market,
  id as meta_campaign_id,
  created_at
FROM meta_campaigns
WHERE image_job_id IS NOT NULL
  AND status IN ('pushed', 'pushing')
  AND language IS NOT NULL
ORDER BY created_at ASC
ON CONFLICT (image_job_id, market) DO NOTHING;
```

**Result:** If "Ugly" concept was pushed to DA and NO, you'll get:
- `pipeline_concepts` row 1: (image_job_id=ugly_id, market="DK", meta_campaign_id=campaign_da_id)
- `pipeline_concepts` row 2: (image_job_id=ugly_id, market="NO", meta_campaign_id=campaign_no_id)

### Step 2: Split `concept_lifecycle` by market

For each existing lifecycle record, duplicate it for every market that concept was pushed to:

```sql
-- Create temporary mapping
WITH pipeline_map AS (
  SELECT image_job_id, market, id as pipeline_concept_id
  FROM pipeline_concepts
)
-- Insert new lifecycle records with pipeline_concept_id
INSERT INTO concept_lifecycle_new (pipeline_concept_id, stage, entered_at, exited_at, signal, notes)
SELECT
  pm.pipeline_concept_id,
  cl.stage,
  cl.entered_at,
  cl.exited_at,
  cl.signal,
  cl.notes
FROM concept_lifecycle cl
JOIN pipeline_map pm ON pm.image_job_id = cl.image_job_id;

-- Swap tables
DROP TABLE concept_lifecycle;
ALTER TABLE concept_lifecycle_new RENAME TO concept_lifecycle;
```

**Important:** Each market gets a **copy** of the lifecycle history. If "Ugly" was in "review" stage, both DA and NO entries start in "review". Going forward, they can diverge (you can kill DA but keep NO active).

### Step 3: Re-fetch and split `concept_metrics` per market

**Delete** existing aggregated metrics:
```sql
DELETE FROM concept_metrics;
```

**Re-sync from Meta** using the new pipeline logic:
- For each `pipeline_concepts` row, fetch insights filtered by that market's `meta_campaigns.meta_adset_id`
- Insert metrics with `pipeline_concept_id` instead of `image_job_id`
- Meta API call: `GET /insights?fields=...&filtering=[{field:'adset.id',operator:'IN',value:[adset_id]}]`

This gives clean per-market metrics from day 1 with no aggregation artifacts.

### Step 4: Handle edge cases

- **Concepts never pushed to Meta** (stage = "draft"): No `pipeline_concepts` row needed until pushed
- **Orphaned lifecycle records** (image_job_id not in meta_campaigns): Skip them (likely old test data)
- **Multiple meta_campaigns per market** (concept re-pushed): Use earliest `created_at` campaign

---

## API Changes

### Core Pipeline Logic (`src/lib/pipeline.ts`)

**`getPipelineData()` - Main change:**
- Query `pipeline_concepts` instead of aggregating from `image_jobs`
- Each `PipelineConcept` object represents one market entry
- Add `market` field to `PipelineConcept` type

**New query flow:**
```typescript
// 1. Fetch all pipeline_concepts with their image_job metadata
const { data: pipelineConcepts } = await db
  .from('pipeline_concepts')
  .select('*, image_jobs(name, product, concept_number, cash_dna, source_images(thumbnail_url))')

// 2. For each pipeline_concept, fetch lifecycle + metrics
const lifecycle = await db
  .from('concept_lifecycle')
  .select('*')
  .eq('pipeline_concept_id', concept.id)
  .is('exited_at', null)

const metrics = await db
  .from('concept_metrics')
  .select('*')
  .eq('pipeline_concept_id', concept.id)
```

**`syncPipelineMetrics()` - Per-market sync:**
```typescript
// For each pipeline_concept:
//   1. Get its meta_campaign.meta_adset_id
//   2. Fetch insights filtered by that ad set only
//   3. Aggregate metrics for this market
//   4. Upsert to concept_metrics with pipeline_concept_id

const insights = await getAdInsights(since, until, {
  filtering: [{ field: 'adset.id', operator: 'EQUAL', value: adSetId }]
})
```

**`killConcept()` - Now per-market:**
```typescript
// OLD: killConcept(imageJobId)
// NEW: killConcept(pipelineConceptId)

async function killConcept(pipelineConceptId: string, notes?: string) {
  // 1. Get the pipeline_concept to find its meta_campaign
  const { data: pc } = await db
    .from('pipeline_concepts')
    .select('meta_campaign_id')
    .eq('id', pipelineConceptId)
    .single()

  // 2. Pause only THIS market's ad sets
  const { data: campaign } = await db
    .from('meta_campaigns')
    .select('meta_adset_id')
    .eq('id', pc.meta_campaign_id)
    .single()

  await updateAdSet(campaign.meta_adset_id, { status: 'PAUSED' })

  // 3. Close lifecycle for this pipeline_concept only
  await db
    .from('concept_lifecycle')
    .update({ exited_at: now() })
    .eq('pipeline_concept_id', pipelineConceptId)
    .is('exited_at', null)

  // 4. Create killed stage
  await db.from('concept_lifecycle').insert({
    pipeline_concept_id: pipelineConceptId,
    stage: 'killed',
    entered_at: now(),
    signal: 'manual_kill',
    notes
  })
}
```

### Push Flow (`src/lib/meta-push.ts`)

**Add pipeline_concepts creation:**
```typescript
// After successfully pushing to Meta and creating meta_campaigns record:
const { data: metaCampaign } = await db
  .from('meta_campaigns')
  .insert({ ... })
  .select()
  .single()

// Create pipeline_concepts entry for this market
const { data: pipelineConcept } = await db.from('pipeline_concepts').insert({
  image_job_id: jobId,
  market: country, // "SE", "DK", "NO"
  meta_campaign_id: metaCampaign.id,
  created_at: now()
}).select().single()

// Initialize lifecycle to "testing" stage
await db.from('concept_lifecycle').insert({
  pipeline_concept_id: pipelineConcept.id,
  stage: 'testing',
  entered_at: now(),
  signal: 'pushed_to_meta'
})
```

### Updated Type: `PipelineConcept`

```typescript
export interface PipelineConcept {
  id: string // pipeline_concept.id (not image_job.id!)
  imageJobId: string // for linking back to source concept
  market: string // "SE", "DK", "NO"
  name: string
  conceptNumber: number | null
  product: string | null
  thumbnailUrl: string | null
  stage: PipelineStage
  stageEnteredAt: string
  daysInStage: number
  metrics: {
    totalSpend: number
    cpa: number
    ctr: number
    cpc: number
    cpm: number
    frequency: number
    conversions: number
    impressions: number
    clicks: number
    roas: number | null
    revenue: number
  } | null
  signals: PipelineSignal[]
  targetCpa: number | null
  targetRoas: number | null
  currency: "SEK" // Always SEK
  cashDna: CashDna | null
}
```

---

## UI Changes & Fixes

### Country Filter Tabs (Fixed)

**Before:** Clicking "DK" showed concepts with `languages.includes("da")` — could show concepts that were also pushed to NO.

**After:** Clicking "DK" shows only `pipeline_concepts` where `market = "DK"`

```typescript
// Filter logic in PipelineClient.tsx
const filteredConcepts = countryFilter
  ? allConcepts.filter(c => c.market === countryFilter)
  : allConcepts
```

**Tab badge counts:**
- All: Total count of all pipeline_concepts entries
- SE: Count where market = "SE"
- DK: Count where market = "DK"
- NO: Count where market = "NO"

### Concept Cards (Updated Display)

**Before:**
```
┌─────────────────────────┐
│ [img] Bold Text         │
│       #2                │
│ happysleep  DA, NO      │  ← Shows both markets
│ 6d  ROAS: 5.28x        │  ← Aggregated metrics
└─────────────────────────┘
```

**After:**
```
┌─────────────────────────┐
│ [img] Bold Text         │
│       #2                │
│ happysleep  DK          │  ← Single market badge
│ 6d  ROAS: 5.28x        │  ← Per-market metrics
└─────────────────────────┘

┌─────────────────────────┐
│ [img] Bold Text         │  ← Separate card for NO market
│       #2                │
│ happysleep  NO          │
│ 6d  ROAS: 6.12x        │  ← Different ROAS
└─────────────────────────┘
```

**Market badge styling:**
- DK: `bg-red-100 text-red-700` (Danish red)
- NO: `bg-blue-100 text-blue-700` (Norwegian blue)
- SE: `bg-yellow-100 text-yellow-700` (Swedish yellow)

### Currency Display (Fixed)

**All currency values show "SEK":**
```typescript
function formatCurrency(amount: number): string {
  return `${amount.toFixed(2)} SEK`
}
```

Remove the `currency` parameter — it's always SEK.

**Displayed in:**
- Spend: `3403.00 SEK`
- Revenue: `17970.82 SEK`
- CPA: `170.15 SEK`
- CPC: `5.32 SEK`
- CPM: `225.01 SEK`
- Budget: `500 SEK/day`

### Budget Guidance (Enhanced)

**Campaign Budget Section shows:**

```
┌─────────────────────────────────────────────────────┐
│ CAMPAIGN BUDGETS                                    │
├─────────────────────────────────────────────────────┤
│ HappySleep | DK                    500 SEK/day      │
│ DK: 4 concepts                     ~125 SEK/day per │
│                                                      │
│ ⚠️ Per-concept budget is low (125 SEK/day). Consider:│
│    • Kill underperforming concepts to free budget   │
│    • Increase total daily budget to 800+ SEK        │
└─────────────────────────────────────────────────────┘
```

**Alert thresholds:**
- **Low budget:** < 150 SEK/day per concept → Show warning
- **Very low:** < 100 SEK/day per concept → Show high-priority alert
- **Optimal:** 150-300 SEK/day per concept → No alert

### Layout Fix: Padding

Add left padding to pipeline page:
```tsx
// src/app/pipeline/PipelineClient.tsx
<div className="max-w-[1400px] pl-8"> {/* Added pl-8 */}
  {/* Pipeline content */}
</div>
```

### Review → Active Flow (Clarified in UI)

Add help text to Review column:
```
┌─────────────────────────┐
│ REVIEW               1  │
├─────────────────────────┤
│ ℹ️ Concepts ready for    │
│   decision. Review ROAS │
│   and either:           │
│   • Kill if unprofitable│
│   • Wait for auto-scale │
│     (5+ days at target) │
└─────────────────────────┘
```

---

## Testing & Edge Cases

### Migration Testing

**Before running migration in production:**

1. **Count check:**
   ```sql
   -- Should match: pipeline_concepts count = distinct (image_job_id, language) in meta_campaigns
   SELECT COUNT(*) FROM pipeline_concepts;
   SELECT COUNT(DISTINCT (image_job_id, language)) FROM meta_campaigns
   WHERE status IN ('pushed', 'pushing') AND image_job_id IS NOT NULL;
   ```

2. **Metrics verification:**
   - Pick one concept (e.g., "Ugly #1")
   - Manually verify DA market metrics match Meta Ads Manager filtered by DA ad set
   - Verify NO market metrics match Meta Ads Manager filtered by NO ad set
   - Verify sum(DA + NO) equals old aggregated total

3. **Lifecycle check:**
   - Verify each market copy has same stage as original
   - Verify `daysInStage` calculation is correct per market

### Per-Market Operations Testing

**Test scenario: Kill concept in one market, keep in another**

1. Push "Test Concept #99" to DK and NO
2. Verify two pipeline entries appear (one DK, one NO)
3. Let both run for 2 days
4. Kill DK market entry
5. **Expected results:**
   - DK entry moves to "Killed" stage
   - DK Meta ad set pauses
   - NO entry stays in "Testing" stage
   - NO Meta ad set still active
6. Navigate to NO tab — should still see "Test Concept #99"
7. Navigate to DK tab — should see "Test Concept #99" in Killed column

### Budget Alert Testing

**Test scenarios:**

| Daily Budget | Active Concepts | Per-Concept | Expected Alert |
|--------------|----------------|-------------|----------------|
| 500 SEK | 4 | 125 SEK | ⚠️ Low budget warning |
| 500 SEK | 6 | 83 SEK | 🔴 Very low budget alert |
| 600 SEK | 3 | 200 SEK | ✅ No alert (optimal) |
| 800 SEK | 2 | 400 SEK | ✅ No alert (healthy) |

### Edge Cases

**1. Concept pushed to same market twice (re-push)**
- **Scenario:** Push "Concept #5" to DK, kill it, then push again to DK
- **Behavior:** Creates new `pipeline_concepts` row with new `meta_campaign_id`
- **UI:** Shows as separate entry (keeps killed entry, adds new testing entry)

**2. Concept never pushed to Meta (draft stage)**
- **Scenario:** Concept completed images but never pushed
- **Behavior:** No `pipeline_concepts` row exists (not in pipeline)
- **UI:** Doesn't appear in pipeline (only concepts with Meta campaigns appear)

**3. Multi-market budget (HappySleep in DK + NO)**
- **Scenario:** HappySleep has campaigns in both DK and NO markets
- **Behavior:** Budget section shows two rows (one per market)
- **UI:**
  ```
  HappySleep | DK    500 SEK/day (4 concepts, ~125 SEK/each)
  HappySleep | NO    300 SEK/day (2 concepts, ~150 SEK/each)
  ```

**4. Orphaned lifecycle/metrics (concept deleted from meta_campaigns)**
- **Scenario:** User manually deletes meta_campaigns record
- **Behavior:** Migration skips creating pipeline_concepts (no mapping)
- **UI:** Old lifecycle/metrics become orphaned (won't display, harmless)

**5. Currency in pipeline_settings**
- **Migration:** Update all `pipeline_settings.currency` to "SEK"
- **App:** Hardcode "SEK" in formatCurrency, ignore settings.currency field

### Manual QA Checklist

- [ ] All tab shows both DK and NO entries for same concept
- [ ] DK tab shows only DK market entries
- [ ] NO tab shows only NO market entries
- [ ] SE tab shows only SE market entries (if any exist)
- [ ] Currency displays "SEK" everywhere (no DKK, NOK, USD)
- [ ] Killing DK market concept doesn't affect NO market
- [ ] Budget alerts trigger at correct thresholds
- [ ] Padding visible between sidebar and pipeline page
- [ ] Concept cards show single market badge (not "DA, NO")
- [ ] Metrics per market match Meta Ads Manager per ad set
- [ ] Review column shows help text about decision flow

---

## Files to Create/Modify

### Database Schema
- Create `pipeline_concepts` table (new)
- Modify `concept_lifecycle` table (add `pipeline_concept_id`, drop `image_job_id`)
- Modify `concept_metrics` table (add `pipeline_concept_id`, drop `image_job_id`)
- Migration script for data split

### Backend
- `src/lib/pipeline.ts` — Update all functions to use `pipeline_concepts`
- `src/lib/meta-push.ts` — Add `pipeline_concepts` creation on push
- `src/types/index.ts` — Update `PipelineConcept` type with `market` field

### Frontend
- `src/app/pipeline/PipelineClient.tsx` — Update filtering, display, formatting
- `src/components/pipeline/ConceptCard.tsx` — Update to show single market badge
- `src/components/pipeline/CampaignBudgetSection.tsx` — Add budget alerts

### API Routes
- `src/app/api/pipeline/route.ts` — Return market-separated concepts
- `src/app/api/pipeline/sync/route.ts` — Sync per-market metrics
- `src/app/api/pipeline/kill/route.ts` — Accept `pipelineConceptId` instead of `imageJobId`
- `src/app/api/pipeline/queue/route.ts` — Accept `pipelineConceptId` instead of `imageJobId`

---

## Success Criteria

1. ✅ User can kill a concept in DK market without affecting NO market
2. ✅ Each market shows accurate per-market metrics (not aggregated)
3. ✅ Country filter tabs show only that market's concepts
4. ✅ All currency values display in SEK
5. ✅ Budget section provides actionable guidance with threshold alerts
6. ✅ Same concept number appears on both market entries (e.g., both show "#2")
7. ✅ Migration completes without data loss
8. ✅ Per-market metrics match Meta Ads Manager filtered by ad set

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Migration fails, data loss | Backup database before migration, test on staging first |
| Metrics don't match Meta | Verify API filtering logic with test ad sets, manual spot-checks |
| Orphaned records | Document cleanup queries, add monitoring for null foreign keys |
| Performance regression | Index `pipeline_concepts(image_job_id)`, profile queries before/after |
| User confusion with new UI | Add help text to Review column, document market separation in changelog |
