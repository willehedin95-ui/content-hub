# Automated Concept Pipeline — Design

**Date:** 2026-03-02
**Status:** Approved
**Product Focus:** HappySleep only (Hydro13 excluded for now)
**Target Markets:** NO (Norway), DK (Denmark)

---

## Problem

Currently, ad concept generation is fully manual:
1. User manually triggers brainstorm
2. Reviews concept ideas
3. Approves concepts
4. Manually generates images
5. Manually assigns landing pages
6. Manually schedules to Meta

**User wants:**
- Automated concept generation with complete packages (images + copy + hypothesis)
- Notifications when concepts are ready for review
- Guidance on what to test next (no winners yet, inexperienced)
- Clear to-do pipeline showing exactly what needs attention

---

## Solution: Two-Stage Guided Workflow

### Philosophy

**For early-stage testing (no winners yet):**
- Focus on **coverage testing** first, not automation
- Hub generates concepts and suggests what to test
- User reviews and approves before committing to image generation
- Hub tracks performance and suggests actions, but user decides
- Progressive automation: start guided, move to full automation once you have winners

### Workflow Overview

1. **Pipeline Dashboard** shows coverage gaps and action items
2. **User clicks "Generate Concepts"** → AI generates ideas + hypotheses
3. **Telegram notification** + in-app badge when ready
4. **User reviews concepts** → approves promising ones
5. **Approved concepts** → trigger image generation (8 styles × languages)
6. **Images complete** → notification, moves to "To Schedule"
7. **User assigns landing page** → adds to Meta queue
8. **Ads go live** → performance tracked, suggestions shown

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│  PIPELINE DASHBOARD (/pipeline)                         │
│  ├─ Coverage Matrix (shows gaps, suggests next tests)   │
│  ├─ Generate Concepts button                            │
│  ├─ To Review section (new concepts)                    │
│  ├─ Generating Images section (in progress)             │
│  ├─ To Schedule section (ready to launch)               │
│  └─ Live Testing section (Meta performance)             │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  CONCEPT GENERATION ENGINE                              │
│  ├─ POST /api/pipeline/generate                         │
│  │   → Claude generates concepts + hypotheses           │
│  │   → Stores in `pipeline_concepts` table              │
│  │   → Status: "pending_review"                         │
│  │                                                       │
│  ├─ POST /api/pipeline/concepts/[id]/approve            │
│  │   → Creates image_job from concept                   │
│  │   → Triggers image generation (existing system)      │
│  │   → Status: "generating_images"                      │
│  │                                                       │
│  └─ Polls image_job status → "images_complete"          │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  NOTIFICATION SYSTEM                                    │
│  ├─ Telegram Bot (existing design, new messages)        │
│  │   → "10 new concepts ready for review"              │
│  │   → "Concept #142 images ready"                     │
│  │                                                       │
│  └─ In-app Badge (sidebar count)                        │
│      → "Pipeline (10)" with red dot                     │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  COVERAGE MATRIX ENGINE                                 │
│  ├─ Analyzes existing concepts (CASH DNA)               │
│  ├─ Identifies gaps (missing awareness × market)        │
│  └─ Generates suggestions ("Test Problem Aware for NO") │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. User clicks "Generate Concepts" → modal with options
2. API generates concepts → Claude creates ideas + hypotheses → saves to DB
3. Notifications sent → Telegram + in-app badge
4. User reviews → approves or rejects
5. Approved concepts → create image_job → trigger generation
6. Images complete → notification → moves to "To Schedule"
7. User schedules → adds to Meta queue

### Key Design Principles

- **Leverage existing systems**: Image generation uses static ad generator, Meta push uses existing integration
- **DB-driven state**: Pipeline status in DB, UI polls for updates
- **Progressive enhancement**: Core workflow first, auto-suggestions later
- **No breaking changes**: New `/pipeline` page alongside existing `/brainstorm`

---

## Database Schema

### New Table: `pipeline_concepts`

Stores generated concepts before they become image_jobs.

```sql
CREATE TABLE pipeline_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Concept metadata
  concept_number INTEGER UNIQUE, -- Auto-increment (e.g., #142)
  name TEXT NOT NULL, -- Short title
  product TEXT NOT NULL, -- 'happysleep' only for now

  -- CASH DNA
  cash_dna JSONB, -- {concept_type, angle, awareness_level, segment_id}

  -- Generated content
  headline TEXT NOT NULL, -- Main hook
  primary_copy TEXT[], -- Array of primary text variations
  ad_copy_headline TEXT[], -- Array of headline variations
  hypothesis TEXT NOT NULL, -- Why this might work

  -- Generation context
  generation_mode TEXT, -- 'matrix' | 'from_template' | etc.
  generation_batch_id UUID, -- Groups concepts generated together
  template_id TEXT, -- If from_template mode

  -- Pipeline status
  status TEXT NOT NULL DEFAULT 'pending_review',
    -- 'pending_review' | 'approved' | 'rejected' |
    -- 'generating_images' | 'images_complete' |
    -- 'scheduled' | 'live'

  -- Relationships
  image_job_id UUID REFERENCES image_jobs(id),
  rejected_reason TEXT,

  -- Target settings
  target_languages TEXT[] NOT NULL, -- ['no', 'da']
  target_markets TEXT[], -- ['NO', 'DK']

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  images_completed_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ
);

CREATE INDEX idx_pipeline_concepts_status ON pipeline_concepts(status);
CREATE INDEX idx_pipeline_concepts_batch ON pipeline_concepts(generation_batch_id);
CREATE INDEX idx_pipeline_concepts_product ON pipeline_concepts(product);
```

### New Table: `pipeline_notifications`

Tracks sent notifications to avoid duplicates.

```sql
CREATE TABLE pipeline_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  concept_id UUID REFERENCES pipeline_concepts(id),
  notification_type TEXT NOT NULL, -- 'concepts_ready' | 'images_complete'
  channel TEXT NOT NULL, -- 'telegram' | 'in_app'

  sent_at TIMESTAMPTZ DEFAULT NOW(),
  telegram_message_id TEXT,

  metadata JSONB
);
```

### New Table: `coverage_matrix_cache`

Caches coverage analysis to avoid recalculating on every page load.

```sql
CREATE TABLE coverage_matrix_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  product TEXT NOT NULL, -- 'happysleep'
  market TEXT NOT NULL, -- 'NO' | 'DK'
  awareness_level TEXT NOT NULL,

  concept_count INTEGER DEFAULT 0,
  live_ad_count INTEGER DEFAULT 0,

  last_tested_at TIMESTAMPTZ,
  performance_summary JSONB, -- Avg CTR, CPA (when available)

  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(product, market, awareness_level)
);
```

### Modifications to Existing Tables

**`image_jobs` table:**
```sql
ALTER TABLE image_jobs
ADD COLUMN pipeline_concept_id UUID REFERENCES pipeline_concepts(id);
```

Links image_jobs back to the concept that generated them.

---

## Coverage Matrix Logic

### Visual Grid

Shows what's been tested and what's missing:

```
COVERAGE MATRIX — HappySleep

                 NO Market    DK Market
Unaware           2 concepts   ⚠️ Missing
Problem Aware     4 concepts   3 concepts
Solution Aware    1 concept    ⚠️ Missing
Product Aware     ⚠️ Missing   1 concept
```

### Gap Detection

Below the matrix:

```
📊 ACTION ITEMS

Priority Gaps:
❌ Missing: Solution Aware concepts for DK market
❌ Missing: Unaware concepts for NO market
⚠️  Low coverage: Only 1 Product Aware concept tested

Suggestions:
💡 Test Problem Aware + "sleep quality decline" angle for NO
💡 Create Unaware + curiosity hook for DK market
```

### Calculation Logic

1. Count concepts by: Product × Market × Awareness Level
2. Identify empty cells (never tested) → High priority
3. Identify thin coverage (<2 concepts) → Medium priority
4. Suggest next tests based on gaps

### Smart Suggestions (Later)

Once performance data exists:
- "Problem Aware has 2.3% CTR vs 0.8% Unaware — generate more Problem Aware"
- "Contrarian angle outperforms by 40%"
- "NO market converts 2x better than DK"

For now: **coverage-driven** (fill gaps systematically)

---

## Concept Generation Flow

### User Interaction

**Modal on "Generate Concepts" click:**

```
┌─ Generate Concepts ─────────────────────┐
│                                          │
│  How many concepts?                      │
│  [10] (default)                          │
│                                          │
│  Generation mode:                        │
│  ○ Matrix Coverage (Recommended)         │
│     → Fills gaps in coverage matrix      │
│  ○ From Template                         │
│     → Uses proven ad templates           │
│  ○ From Research                         │
│     → Based on customer research         │
│  ○ From Scratch                          │
│     → Pure creative exploration          │
│                                          │
│  Target markets:                         │
│  ☑ Norway (NO)                           │
│  ☑ Denmark (DK)                          │
│                                          │
│            [Cancel] [Generate]           │
└──────────────────────────────────────────┘
```

### API Route: `POST /api/pipeline/generate`

**Request:**
```json
{
  "count": 10,
  "mode": "matrix",
  "product": "happysleep",
  "target_markets": ["NO", "DK"],
  "target_languages": ["no", "da"]
}
```

**Process:**

1. Generate batch ID for grouping
2. For Matrix mode: analyze coverage gaps, prioritize empty cells
3. Call Claude API with enhanced prompt:
   ```
   System: Existing brainstorm system + CASH framework

   User: Generate 10 concepts for HappySleep (NO + DK markets).

   PRIORITY GAPS (fill these first):
   - Missing: Solution Aware for DK
   - Missing: Unaware for NO
   - Low coverage: Product Aware (only 1 tested)

   For each concept provide:
   1. Name (short title)
   2. Headline (hook)
   3. Primary copy (3 variations)
   4. Ad copy headlines (3 variations)
   5. CASH DNA (concept type, angle, awareness, segment)
   6. HYPOTHESIS (2-3 sentences):
      - Why this might work
      - What awareness/psychology it targets
      - What you're testing

   Example hypothesis:
   "Testing Problem Aware with 'sleep quality decline after 40'.
   Targets core wound (feeling older) through cinematic pain.
   If successful, proves age-related pain > generic insomnia."
   ```

4. Parse response using enhanced `parseConceptProposals()`
5. Save to `pipeline_concepts` with status "pending_review"
6. Send notifications: Telegram + in-app badge
7. Return success with batch_id

**Response:**
```json
{
  "success": true,
  "batch_id": "uuid",
  "concepts_generated": 10,
  "concepts": [...]
}
```

---

## Pipeline Dashboard UI

### Page: `/pipeline`

Replaces `/brainstorm` in sidebar.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  Pipeline                                    [Generate Concepts]  │
├─────────────────────────────────────────────────────────────┤
│  📊 COVERAGE MATRIX — HappySleep                            │
│  [Grid showing NO/DK × awareness levels]                    │
│  📋 Priority Gaps                                           │
│  • Missing: Solution Aware for DK                           │
├─────────────────────────────────────────────────────────────┤
│  📥 TO REVIEW (3)                                           │
│  [Concept cards with hypothesis, approve/reject buttons]    │
├─────────────────────────────────────────────────────────────┤
│  🎨 GENERATING IMAGES (2)                                   │
│  [Progress bars per concept]                                │
├─────────────────────────────────────────────────────────────┤
│  📅 TO SCHEDULE (5)                                         │
│  [Image thumbnails, landing page selector, Meta queue btn]  │
├─────────────────────────────────────────────────────────────┤
│  🚀 LIVE TESTING (12)                                       │
│  [Performance metrics, flags, kill buttons]                 │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

**1. CoverageMatrix**
- Fetches `/api/pipeline/coverage`
- Color coding: green (tested), yellow (low), red (missing)

**2. ConceptCard** (To Review)
- Shows: number, name, headline, hypothesis (expandable)
- CASH DNA badges
- Actions: Approve & Generate Images | Reject

**3. ImageGenerationProgress**
- Progress bar (X/Y images)
- Polls every 3s
- Shows current generating styles

**4. ScheduleCard** (To Schedule)
- 8 style thumbnails
- Landing page dropdown (manual for now)
- "Add to Meta Queue" button

**5. LiveTestingCard**
- Per-market performance
- Flags (✅ good, ⚠️ warning, ❌ critical)
- Suggestions + Kill button

### State Management

- Poll `/api/pipeline/concepts?status=pending_review`
- Poll `/api/pipeline/concepts?status=generating_images`
- Poll `/api/pipeline/concepts?status=images_complete`
- Fetch Meta performance for "Live Testing"

---

## Notification System

### Telegram Notifications

**Message 1: Concepts Ready**
```
✅ 10 new concepts ready for review!

HappySleep • NO + DK markets
Generated via Matrix Coverage mode

Top priorities:
• #145 Sleep Quality Decline (Problem Aware)
• #146 Insomnia Root Cause (Solution Aware)

👉 Review now: [Link to /pipeline]
```

**Message 2: Images Complete**
```
🎨 Concept #142 images ready!

"Better Sleep Naturally"
✅ 24 images generated (8 styles × 3 languages)

Next steps:
• Assign landing page
• Add to Meta queue

👉 Review: [Link to /pipeline/concepts/142]
```

**Message 3: Performance Alert** (later)
```
⚠️ Performance alert

Concept #138 - DK market
€38 spent • 0.4% CTR (below threshold)

Suggestion: Consider killing DK campaign

👉 Review: [Link to /pipeline]
```

### In-App Badge

**Sidebar:**
```
Ads
├─ Pipeline (10) ← Red badge
├─ Ad Concepts
└─ Ad Spy
```

**Badge count:** pending_review + images_complete

**API:** `GET /api/pipeline/badge-count`
```json
{
  "count": 10,
  "breakdown": {
    "to_review": 3,
    "images_complete": 5,
    "performance_alerts": 2
  }
}
```

Poll every 30s when user active.

### Notification Settings

```
Notifications

Telegram
☑ Notify when concepts ready
☑ Notify when images complete
☐ Performance alerts (coming soon)

Status: ✅ Connected

[Test Notification]
```

---

## Image Generation Flow

### On Concept Approval

**API: `POST /api/pipeline/concepts/[id]/approve`**

**Process:**

1. Update concept status → "approved"
2. Create `image_job`:
   ```typescript
   const imageJob = await createImageJob({
     name: concept.name,
     product: concept.product,
     concept_number: concept.concept_number,
     pipeline_concept_id: concept.id,

     ad_copy_primary: concept.primary_copy,
     ad_copy_headline: concept.ad_copy_headline,
     cash_dna: concept.cash_dna,

     target_languages: concept.target_languages,
     target_ratios: ['1:1'], // Meta only

     status: 'ready',
     auto_export: false,
   });
   ```

3. Update concept → link image_job, status = "generating_images"
4. Trigger generation → `POST /api/image-jobs/[id]/generate-all`
   - **Existing system!** Generates:
   - 8 styles × languages × ratios
   - For HappySleep NO+DK: 8 × 2 × 1 = 16 images
5. Poll for completion (existing polling system)
6. On complete:
   - Update concept status → "images_complete"
   - Send Telegram notification
   - Update in-app badge

### No Code Changes to Image Generator

Existing `/api/image-jobs/[id]/generate-all` already:
- ✅ Generates all 8 styles
- ✅ Supports multiple languages
- ✅ Uses nano-banana-2
- ✅ Tracks progress in DB
- ✅ Supports polling

We just **create an image_job** and use existing infrastructure!

### Integration Points

```
pipeline_concepts (new)
      ↓
  [Approve]
      ↓
  image_jobs (existing) ← pipeline_concept_id link
      ↓
  source_images (existing)
      ↓
  image_translations (existing)
      ↓
  versions (existing)
```

---

## Performance Tracking

### Live Testing Section

Shows ads currently running + performance.

**API: `GET /api/pipeline/live-testing`**

Returns concepts with `status='live'` + Meta performance:

```typescript
{
  concepts: [
    {
      id: "uuid",
      concept_number: 138,
      name: "Better Sleep Naturally",

      performance: {
        NO: {
          spend: 45.20,
          impressions: 8234,
          clicks: 98,
          ctr: 1.19,
          cpa: 12.50,
          status: "active",
          flag: "good",
        },
        DK: {
          spend: 38.50,
          clicks: 31,
          ctr: 0.42,
          status: "active",
          flag: "warning",
        }
      },

      suggestion: "DK underperforming (CTR < 1%). Consider killing.",
      suggestion_action: "kill_dk",
    }
  ]
}
```

### Performance Flags

Simple thresholds (no winners yet, will refine later):

```typescript
function getPerformanceFlag(ctr: number, spend: number) {
  if (spend < 20) return "learning";
  if (ctr < 1.0) return "warning";
  if (spend > 50 && ctr < 0.5) return "critical";
  if (ctr >= 1.0) return "good";
  return "neutral";
}
```

**Later:** Compare vs winning benchmarks, factor CPA, detect early signals.

### Suggestions Logic

```typescript
function generateSuggestion(concept) {
  const underperforming = markets.filter(m =>
    concept.performance[m].flag === "critical"
  );

  if (underperforming.length) {
    return {
      text: `${markets} underperforming. Consider killing.`,
      action: "kill",
      markets: underperforming,
    };
  }

  const winners = markets.filter(m =>
    concept.performance[m].ctr > 2.0 && spend > 20
  );

  if (winners.length) {
    return {
      text: `${markets} performing well. Consider scaling.`,
      action: "scale",
      markets: winners,
    };
  }

  return null;
}
```

### Kill Ad Action

**Flow:**
1. User clicks "Kill Ad"
2. Confirmation modal
3. `POST /api/pipeline/concepts/[id]/kill`
4. Pause Meta ad set (existing API)
5. Update DB statuses

---

## Implementation Phases

### Phase 1: Core Pipeline (MVP)

- ✅ Database schema (3 new tables + 1 column)
- ✅ `/pipeline` page with 4 sections (To Review, Generating, To Schedule, Live)
- ✅ Coverage Matrix (simple counting, static suggestions)
- ✅ Concept generation API (Matrix mode only)
- ✅ Approval flow → image_job creation
- ✅ Telegram notifications (2 types: concepts ready, images complete)
- ✅ In-app badge
- ✅ Performance tracking (basic flags + kill action)

**Deliverable:** Working pipeline from "Generate Concepts" to "Live Testing"

### Phase 2: Enhancements

- Smart Coverage Matrix suggestions (based on performance data)
- Auto-landing page recommendation
- Performance alerts (Telegram notifications)
- More generation modes (From Template, From Research)
- Performance dashboard (`/performance` page with charts)

### Phase 3: Full Automation

- Scheduled auto-generation (daily/weekly)
- Auto-kill rules (configurable thresholds)
- Auto-scaling winners
- Full "hands-off" mode

---

## Success Criteria

**Phase 1 complete when:**
1. User can generate 10 concepts via Pipeline page
2. Concepts appear in "To Review" with hypotheses
3. Telegram notification sent when ready
4. User can approve concepts → images generate automatically
5. Images complete → notification → moves to "To Schedule"
6. User can schedule to Meta → appears in "Live Testing"
7. Live Testing shows performance flags + kill button works

**User experience:**
- Clear guidance on what to test (Coverage Matrix)
- Complete concepts (images + copy + hypothesis)
- Notifications when action needed
- Simple workflow: Review → Approve → Schedule → Monitor

---

## Technical Notes

### Environment Variables

No new env vars needed — uses existing:
- `ANTHROPIC_API_KEY` (concept generation)
- `TELEGRAM_BOT_TOKEN` (notifications)
- `META_SYSTEM_USER_TOKEN` (performance tracking, kill action)

### API Routes (New)

- `POST /api/pipeline/generate` — Generate concepts
- `GET /api/pipeline/concepts` — List concepts (with status filter)
- `GET /api/pipeline/concepts/[id]` — Get concept details
- `POST /api/pipeline/concepts/[id]/approve` — Approve & generate images
- `POST /api/pipeline/concepts/[id]/reject` — Reject concept
- `POST /api/pipeline/concepts/[id]/kill` — Kill live ad
- `GET /api/pipeline/coverage` — Coverage matrix data
- `GET /api/pipeline/badge-count` — Badge count
- `GET /api/pipeline/live-testing` — Live testing data

### Reused Systems

- Static ad generator (image generation)
- Meta Ads integration (performance tracking, kill action)
- Telegram bot (notifications)
- Existing UI components (concept cards, progress bars, image grids)

### Migration Plan

1. Create new tables via Supabase Management API
2. Add `pipeline_concept_id` column to `image_jobs`
3. Build `/pipeline` page alongside existing pages
4. Update sidebar to include Pipeline with badge
5. No changes to existing `/brainstorm` or `/concepts` pages
6. Gradual migration: user can use both systems during transition

---

## Risks & Mitigations

**Risk:** User overwhelmed by too many concepts
**Mitigation:** Default to 10 concepts, clear hypothesis helps decide quickly

**Risk:** Image generation costs spike
**Mitigation:** Two-stage approval (review concepts before generating images)

**Risk:** Performance flags wrong (no baseline yet)
**Mitigation:** Simple thresholds + user final decision, will refine once data exists

**Risk:** Coverage Matrix confusing
**Mitigation:** Clear visual grid + plain English suggestions below

**Risk:** Notifications annoying
**Mitigation:** User controls in settings (can disable Telegram, keep in-app only)

---

## Future Enhancements

- **Landing page AI recommendation** — Auto-suggest best page per concept
- **Concept iteration system** — "Generate 5 variations of winning concept #138"
- **A/B test integration** — Auto-create A/B tests for promising concepts
- **WhatsApp notifications** — Alternative to Telegram
- **Daily briefing** — Morning summary of performance + suggested actions
- **Concept library** — Save best hypotheses for reuse
- **Segment testing** — Auto-test different audience segments per concept

---

## Appendix: User Journey Example

**Day 1:**
1. User opens `/pipeline`, sees empty Coverage Matrix
2. Clicks "Generate Concepts" → Matrix mode, 10 concepts, NO + DK
3. Waits 30s → Telegram: "10 concepts ready"
4. Reviews concepts, reads hypotheses, approves 5 promising ones
5. Images start generating (40 images total: 5 concepts × 8 styles × 1 language avg)

**Day 2:**
1. Telegram: "Concept #142 images ready"
2. Opens Pipeline → "To Schedule" section → reviews 8 styles
3. Assigns landing page, clicks "Add to Meta Queue"
4. Concept moves to "Live Testing" → shows "Learning phase"

**Day 5:**
1. Opens Pipeline → "Live Testing" shows performance
2. Concept #142: NO (€45, 1.2% CTR ✅) | DK (€38, 0.4% CTR ⚠️)
3. Suggestion: "DK underperforming, consider killing"
4. Clicks "Kill Ad" → confirms → DK ad set paused
5. Coverage Matrix shows gap: "Missing: Solution Aware for DK"
6. Clicks "Generate Concepts" → fills gap with 5 new concepts

**Outcome:** Systematic testing with clear guidance, no manual busywork.
