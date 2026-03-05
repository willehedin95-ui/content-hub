# Concept Learnings — Creative Testing Feedback Loop

## Problem

When ads get killed or promoted, the knowledge dies with the action. There's no structured system to capture *what was tested* (angle + awareness + style + market) and *what the market told us*. Without this, the same failing hypotheses get retested, and winning patterns aren't systematically replicated.

## Solution

A **concept_learnings** table that auto-generates structured learning records whenever a concept reaches a terminal state (killed or active). AI analyzes the performance data against the original hypothesis and CASH DNA, producing a takeaway and tags. These learnings are:

1. **Auto-generated** — no manual input required
2. **Queryable by CASH DNA variables** — filter by angle, awareness level, style, product, market
3. **Injected into brainstorm prompts** — Claude sees what's worked/failed before generating new concepts
4. **Shown on the brainstorm page** — visual context for the user

## Data Model

### New table: `concept_learnings`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| image_job_market_id | FK → image_job_markets | Which concept + market |
| image_job_id | FK → image_jobs | For easy joins |
| product | TEXT | happysleep, hydro13 |
| market | TEXT | SE, DK, NO, DE |
| outcome | TEXT | "winner" or "loser" |
| angle | TEXT | From cash_dna (Story, Contrarian, etc.) |
| awareness_level | TEXT | From cash_dna |
| style | TEXT | From cash_dna |
| concept_type | TEXT | From cash_dna (avatar_facts, etc.) |
| days_tested | INTEGER | Days from push to kill/active |
| total_spend | NUMERIC | Total spend during testing |
| impressions | INTEGER | |
| clicks | INTEGER | |
| ctr | NUMERIC | |
| conversions | INTEGER | |
| cpa | NUMERIC | |
| roas | NUMERIC | Nullable |
| hypothesis_tested | TEXT | From pipeline_concepts.hypothesis or concept_lifecycle.hypothesis |
| takeaway | TEXT | AI-generated learning |
| tags | TEXT[] | AI-extracted keywords for filtering |
| signal | TEXT | Kill/promotion signal (no_conversions_high_spend, cpa_below_target_sustained, etc.) |
| concept_name | TEXT | For display (e.g. "#042 Sleep Fear Hook") |
| created_at | TIMESTAMPTZ | |

No foreign key to `concept_lifecycle` — we denormalize everything so learnings are self-contained and queryable without joins.

## Auto-Generation Flow

### Trigger Points

**1. Manual kill** — in `killConcept()` (pipeline.ts)
After creating the lifecycle row, call `generateConceptLearning()` and insert into `concept_learnings`.

**2. Auto kill** — in `detectStageTransitions()` (pipeline.ts)
When `newStage === "killed"`, generate a learning alongside the existing hypothesis.

**3. Promotion to active** — in `detectStageTransitions()` (pipeline.ts)
When `newStage === "active"`, generate a "winner" learning.

### The AI Call

Replace `generateKillHypothesis()` with `generateConceptLearning()`. Single Claude Haiku call that returns JSON:

```typescript
interface ConceptLearningResult {
  takeaway: string;   // 2-3 sentences: what the market told us
  tags: string[];     // 2-5 descriptive keywords
  hypothesis: string; // 2-3 sentences: why it won/lost (replaces old kill hypothesis)
}
```

The prompt includes:
- Concept name, product, market
- CASH DNA (angle, awareness, style, concept type)
- Original hypothesis (why we thought it would work)
- Performance metrics (spend, CTR, CPA, ROAS, conversions)
- Outcome (winner/loser) and signal
- Instruction to write a structured learning focused on *which variables contributed to the outcome*

The `hypothesis` field goes to `concept_lifecycle.hypothesis` (backwards compat with existing kill modal). The `takeaway` + `tags` go to `concept_learnings`.

### Error Handling

If the Claude call fails, the learning row is still created with `takeaway = null`. A future sync could backfill missing takeaways.

## Brainstorm Injection

### New function: `buildLearningsContext(product: string)`

Queries `concept_learnings` for the given product. Returns a markdown section for the system prompt:

```markdown
## LEARNINGS FROM PAST TESTS

### What Works
- **Story** angles for HappySleep in SE: 3/3 won (avg ROAS 2.4x)
- **Problem Aware** hooks consistently outperform Solution Aware (5/7 vs 1/4)

### What Doesn't Work
- **Fear** triggers for HappySleep in NO: 0/3 converted
- **Native** style with **Unaware** awareness: 0/2 (decent CTR but no conversions)

### Recent Takeaways
- "#042 Sleep Fear Native" (NO, killed): Good CTR (1.8%) but zero conversions — hook attracts curiosity but doesn't pre-qualify buyers
- "#038 Hydro13 Expert Story" (SE, winner): Expert authority + story angle drove 2.8x ROAS — double down on this combination
```

This function aggregates learnings into patterns AND includes the 5 most recent individual takeaways for specificity.

### Integration Points

**1. System prompt injection** — `buildProductContext()` in brainstorm.ts gets a new `learningsContext` parameter, appended after product knowledge and before hooks.

**2. API route** — `/api/brainstorm/route.ts` calls `buildLearningsContext(productSlug)` and passes it through.

**3. Same for pipeline generate** — `/api/pipeline/generate/route.ts` also gets learnings injected.

## Learnings Page (UI)

### Location

New sidebar item in the "Ads" group: "Learnings" with a `BookOpen` icon, route `/learnings`.

### Page Layout

Simple filterable table/card view:

**Filters (top bar):**
- Product (dropdown)
- Market (dropdown)
- Outcome (winner/loser/all)
- Angle (dropdown, populated from distinct values)
- Awareness Level (dropdown)

**Cards show:**
- Concept name + number
- Outcome badge (green "Winner" / red "Loser")
- Product + Market
- CASH DNA pills (angle, awareness, style)
- Key metrics (spend, CPA, ROAS, CTR)
- Takeaway text
- Tags as chips

**Pattern Summary (top of page):**
- Win rate by angle (bar chart or simple stats)
- Win rate by awareness level
- Win rate by style
- Only shown when enough data exists (5+ learnings)

### Brainstorm Page Addition

On the brainstorm page, before generating, show a collapsible "Learnings for {product}" section with relevant past learnings. Same content as what's injected into the prompt.

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/pipeline.ts` | Replace `generateKillHypothesis()` with `generateConceptLearning()`. Add learning insertion to `killConcept()` and `detectStageTransitions()`. |
| `src/lib/brainstorm.ts` | Add `buildLearningsContext()`. Update `buildProductContext()` signature to accept learnings. |
| `src/app/api/brainstorm/route.ts` | Call `buildLearningsContext()` and pass to prompt builder. |
| `src/app/api/pipeline/generate/route.ts` | Same as above. |
| `src/components/layout/Sidebar.tsx` | Add "Learnings" item to Ads group. |
| `src/app/learnings/page.tsx` | New page (server component shell). |
| `src/app/learnings/LearningsClient.tsx` | New page (client component with filters + cards). |
| `src/app/api/learnings/route.ts` | New API: GET learnings with filters. |
| `src/app/brainstorm/` | Add learnings preview section to brainstorm page. |

## Migration

```sql
CREATE TABLE concept_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_job_market_id UUID REFERENCES image_job_markets(id) ON DELETE SET NULL,
  image_job_id UUID REFERENCES image_jobs(id) ON DELETE SET NULL,
  product TEXT NOT NULL,
  market TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('winner', 'loser')),
  angle TEXT,
  awareness_level TEXT,
  style TEXT,
  concept_type TEXT,
  days_tested INTEGER,
  total_spend NUMERIC,
  impressions INTEGER,
  clicks INTEGER,
  ctr NUMERIC,
  conversions INTEGER,
  cpa NUMERIC,
  roas NUMERIC,
  hypothesis_tested TEXT,
  takeaway TEXT,
  tags TEXT[] DEFAULT '{}',
  signal TEXT,
  concept_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_concept_learnings_product ON concept_learnings(product);
CREATE INDEX idx_concept_learnings_market ON concept_learnings(product, market);
CREATE INDEX idx_concept_learnings_outcome ON concept_learnings(outcome);
CREATE INDEX idx_concept_learnings_angle ON concept_learnings(angle);
```

## Backfill

After deploying, backfill learnings for all concepts currently in `killed` or `active` stage by querying `concept_lifecycle` + `concept_metrics` + `image_jobs.cash_dna` and running `generateConceptLearning()` for each. This seeds the system with historical data immediately.
