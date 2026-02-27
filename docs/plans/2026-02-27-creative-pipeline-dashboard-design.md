# Creative Pipeline Dashboard — Design Doc

> Date: 2026-02-27
> Status: Approved
> Location: `/pipeline` (sidebar: Ads > Pipeline)

## Problem

After pushing ad concepts to Meta, there's no visibility into their lifecycle. No way to know at a glance which concepts need review, which should be killed, which are ready to scale, or when it's time to publish more. The result is anxiety and inaction — sitting and waiting instead of running a continuous creative testing pipeline.

## Solution

A Creative Pipeline Dashboard that automatically tracks every concept from draft through testing, review, active scaling, and killed. Shows smart signals for what needs attention today. Pulls performance data from Meta and compares against target CPA thresholds.

## Design Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Lifecycle detection | Fully automatic | Zero maintenance. Stages computed from existing data + time + metrics. |
| Target CPA | Per product + country | Margins differ by product and market. |
| Navigation | Ads > Pipeline | Natural grouping with Brainstorm, Ad Concepts, Ad Spy. |
| Primary view | Action summary at top | "What should I do today" is the most important question. |
| Data fetching | Cached in Supabase, synced on page load + manual refresh | Instant page loads, historical tracking, no background infra needed initially. |

## Data Model

### New Tables

#### `pipeline_settings`

Target CPA per product/country. Unique constraint on `(product, country)`.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| product | text | "happysleep" or "hydro13" |
| country | text | "NO", "DK", "SE" |
| target_cpa | numeric | Target cost per acquisition in local currency |
| currency | text | "NOK", "DKK", "SEK" |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

#### `concept_metrics`

Daily snapshot of Meta performance per concept. Unique constraint on `(image_job_id, date)` — upserted on sync.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| image_job_id | uuid | FK → image_jobs.id |
| date | date | The day these metrics are for |
| spend | numeric | Total spend across all ads in this concept |
| impressions | integer | |
| clicks | integer | |
| ctr | numeric | Click-through rate |
| cpc | numeric | Cost per click |
| cpm | numeric | Cost per mille |
| frequency | numeric | Average frequency |
| conversions | integer | Purchase actions |
| cpa | numeric | Cost per conversion |
| roas | numeric | Return on ad spend (nullable) |
| synced_at | timestamptz | When this row was last updated from Meta |

#### `concept_lifecycle`

State transitions with timestamps. Multiple rows per concept — one per stage it's been in. Current stage = row with `exited_at IS NULL`.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| image_job_id | uuid | FK → image_jobs.id |
| stage | text | "draft", "testing", "review", "active", "killed" |
| entered_at | timestamptz | When the concept entered this stage |
| exited_at | timestamptz | When it left (null if current) |
| signal | text | What triggered the transition |
| notes | text | Optional learnings / notes |

### No changes to existing tables

The pipeline layer sits on top of `image_jobs`, `meta_campaigns`, and `meta_ads` without modifying them.

## Stage Detection Rules

| Stage | Entry Trigger | Exit Trigger |
|-------|--------------|-------------|
| Draft | `image_jobs.status = 'completed'` + has completed images + no `meta_campaigns` record | Pushed to Meta |
| Testing | `meta_campaigns` record created | 7 days elapsed since push |
| Review | 7 days since push | User kills or concept auto-graduates to Active |
| Active | CPA at or below target for 5+ consecutive days with 3+ total conversions | Frequency > 2.5 or CPA rises above 2x target |
| Killed | Spent 2x target CPA with 0 conversions, OR manual kill, OR fatigue threshold hit | Terminal state (notes recorded for learnings) |

Stage transitions are evaluated during each sync. When a concept's metrics meet the threshold for the next stage, the system auto-transitions it and logs the signal/reason.

## API Endpoints

### `POST /api/pipeline/sync`

Syncs performance data from Meta and evaluates stage transitions.

1. Fetches all active concepts (image_jobs with meta_campaigns, not killed)
2. Pulls metrics from Meta via `getAdInsights()` (adds `frequency` to fields)
3. Aggregates per concept (one concept = multiple ads across languages)
4. Upserts into `concept_metrics` (one row per concept per day)
5. Runs stage detection logic, creates `concept_lifecycle` rows for state changes
6. Returns full pipeline state

### `GET /api/pipeline`

Returns everything the dashboard needs:

```typescript
{
  concepts: [{
    id: string
    name: string
    conceptNumber: number
    product: string
    thumbnailUrl: string
    stage: "draft" | "testing" | "review" | "active" | "killed"
    stageEnteredAt: string
    daysInStage: number
    languages: string[]
    metrics: {
      totalSpend: number
      cpa: number
      ctr: number
      frequency: number
      conversions: number
      impressions: number
      roas: number | null
    } | null
    signals: {
      type: "kill" | "scale" | "fatigue" | "no_spend" | "review_ready"
      reason: string
    }[]
    targetCpa: number
    currency: string
  }]
  summary: {
    draftsReady: number
    inTesting: number
    needsReview: number
    activeScaling: number
    killed: number
    avgCreativeAge: number
    testingBudgetPct: number
  }
  alerts: {
    type: "publish_more" | "review_needed" | "budget_imbalance" | "all_fatiguing"
    message: string
    priority: "high" | "medium" | "low"
  }[]
}
```

### `GET /api/pipeline/settings`

Returns target CPA settings for all product/country combos.

### `PUT /api/pipeline/settings`

Updates target CPA for a specific product/country.

## UI Layout

### Page: `/pipeline`

**Top: Action Summary Bar**

Colored cards showing counts and alerts:
- Drafts ready (blue)
- In testing (gray, "hands off")
- Need review (orange)
- Active/scaling (green)
- Killed (muted)
- Smart alerts: "Publish more!" (when active < 5 or avg age > 14 days), "Review needed", kill/scale candidates

**Middle: Pipeline Columns (Kanban-style)**

Five columns: Draft → Testing → Review → Active → Killed

Each concept card shows:
- Thumbnail image
- Concept name + number
- Product badge
- Country flags
- Age in days
- CPA vs target (color-coded green/yellow/red)
- Signal badges (Kill?, Scale?, Fatiguing)

**Card interactions:**
- Click → expand to show full metrics (spend, CTR, frequency, conversions, daily trend)
- Kill button (on review/active) → marks killed, prompts for learnings note
- Push to Meta button (on drafts) → triggers existing push flow

**Bottom: Settings Panel**

Collapsible section to set target CPA per product/country. Simple editable table.

**Header: Refresh Button**

Triggers `POST /api/pipeline/sync` to re-fetch data from Meta.

## Signal Thresholds (from Creative Testing Framework)

| Signal | Condition | Priority |
|--------|-----------|----------|
| Kill candidate | Spent ≥ 2x target CPA with 0 conversions | High |
| Kill candidate | CPA > 2x target after 7+ days | High |
| Scale candidate | CPA ≤ target for 5+ consecutive days, 3+ conversions | High |
| Fatigue warning | Frequency > 2.5 | Medium |
| Fatigue warning | CTR dropped 20%+ from peak | Medium |
| No spend | Ad running 3+ days with $0 spend | Medium |
| Review ready | Concept in testing for 7+ days | Medium |
| Publish more | Active concepts < 5 | High |
| Publish more | Avg creative age > 14 days | Medium |
| Budget imbalance | Testing spend < 20% of total | Low |

## Files to Create/Modify

### New files
- `src/app/pipeline/page.tsx` — Page wrapper
- `src/app/pipeline/PipelineClient.tsx` — Client component with dashboard UI
- `src/app/api/pipeline/route.ts` — GET pipeline data
- `src/app/api/pipeline/sync/route.ts` — POST sync from Meta
- `src/app/api/pipeline/settings/route.ts` — GET/PUT target CPA settings
- `src/lib/pipeline.ts` — Pipeline logic (stage detection, signal computation, metrics aggregation)

### Modified files
- `src/lib/meta.ts` — Add `frequency` to insight fields
- `src/components/layout/Sidebar.tsx` — Add "Pipeline" to Ads group
- `src/types/index.ts` — Add pipeline-related types

### Database
- Create `pipeline_settings` table
- Create `concept_metrics` table
- Create `concept_lifecycle` table
- RLS policies for all three tables (service role access)
