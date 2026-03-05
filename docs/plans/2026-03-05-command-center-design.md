# Command Center — Unified Action Queue

**Date**: 2026-03-05
**Inspired by**: Arnold HQ's "Actionable Steps" + "Kill List" + "Smart Reports" features
**Replaces**: `/morning-brief` page (existing signals reused, UI evolved)

## Problem

The current morning brief is a daily snapshot — ephemeral action cards that disappear if not acted on. Four pain points:

1. **One-shot snapshot** — Actions don't persist across days. No backlog.
2. **Too narrow scope** — Only ad ops (pause/scale/budget). No creative pipeline, landing page, or competitor signals.
3. **No impact ranking** — Cards are prioritized but don't show estimated $ value.
4. **Missing the loop** — No outcome tracking. Did pausing that bleeder actually improve ROAS?

## Solution

A persistent action queue (`action_queue` table) that:
- Carries actions across days, re-scoring daily with fresh data
- Escalates unresolved actions (normal → elevated → critical)
- Covers ad ops, creative pipeline, and landing page signals
- Shows estimated $/day impact for every action
- Tracks outcomes 48h after execution

## Data Model

### `action_queue` table

```sql
CREATE TABLE action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  category TEXT NOT NULL, -- 'ad_ops', 'creative', 'landing_page', 'budget'
  priority_score INTEGER NOT NULL DEFAULT 50, -- 0-100
  estimated_impact_daily DECIMAL, -- $/day savings or revenue
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  guidance TEXT, -- detailed "why" explanation
  status TEXT NOT NULL DEFAULT 'pending', -- pending, snoozed, done, dismissed, expired
  source_signal TEXT NOT NULL, -- fatigue, bleeder, winner, efficiency, lp_problem, low_diversity, unpushed_concepts
  signal_data JSONB, -- raw metrics that triggered this
  dedup_key TEXT NOT NULL, -- unique key for deduplication (action_type + entity ID)
  meta_ad_id TEXT,
  meta_adset_id TEXT,
  meta_campaign_id TEXT,
  image_job_id INTEGER,
  market TEXT, -- SE, NO, DK
  product TEXT, -- happysleep, hydro13
  days_pending INTEGER NOT NULL DEFAULT 0,
  escalation_level TEXT NOT NULL DEFAULT 'normal', -- normal, elevated, critical
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snoozed_until TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  execution_snapshot JSONB, -- metrics frozen at action time
  outcome_checked_at TIMESTAMPTZ,
  outcome JSONB, -- metrics 48h post-action
  outcome_summary TEXT, -- human-readable outcome
  UNIQUE(dedup_key, status) -- prevent duplicate pending actions for same entity
);

CREATE INDEX idx_action_queue_status ON action_queue(status);
CREATE INDEX idx_action_queue_priority ON action_queue(priority_score DESC) WHERE status = 'pending';
CREATE INDEX idx_action_queue_outcome ON action_queue(executed_at) WHERE status = 'done' AND outcome IS NULL;
```

### Deduplication

`dedup_key` = `{action_type}:{entity_id}`, e.g.:
- `pause_bleeder:act_123456` (Meta ad ID)
- `scale_winner:act_789012`
- `creative_refresh:42` (image_job_id)
- `generate_concepts:global`

Unique constraint on `(dedup_key, status)` prevents duplicate pending actions. When the daily cron finds an existing pending action, it updates priority/metrics instead of inserting.

### Escalation Rules

| days_pending | escalation_level | priority_modifier |
|---|---|---|
| 0-1 | normal | +0 |
| 2-4 | elevated | +10 |
| 5+ | critical | +20 |

## Action Types

### Ad Ops (sourced from existing signal engine)

| action_type | source_signal | category | base_priority | $ impact formula |
|---|---|---|---|---|
| `pause_bleeder` | bleeder | ad_ops | 70 | daily_spend × (1 - target_CPA/actual_CPA) |
| `pause_fatigued` | fatigue (critical) | ad_ops | 55 | daily_spend × estimated_waste_ratio |
| `scale_winner` | winner | ad_ops | 60 | budget_increase × current_ROAS |
| `budget_shift` | efficiency | budget | 40 | spend_delta × ROAS_differential |
| `pause_adset` | multiple bleeders | ad_ops | 65 | sum of bleeder waste |
| `review_lp` | lp_problem | landing_page | 50 | daily_spend × conversion_gap |

### Creative Pipeline (new signals)

| action_type | source_signal | category | base_priority | trigger |
|---|---|---|---|---|
| `creative_refresh` | fatigue + profitable | creative | 50 | Concept earning revenue but fatigue signals detected |
| `generate_concepts` | low_diversity | creative | 45 | <3 active healthy concepts OR >50% fatiguing |
| `review_unpushed` | unpushed_concepts | creative | 35 | Concepts generated 3+ days ago, not pushed |

### Landing Pages (new signals)

| action_type | source_signal | category | base_priority | trigger |
|---|---|---|---|---|
| `lp_review` | lp_problem | landing_page | 50 | CTR stable + CPA rising = LP conversion issue |
| `lp_refresh` | stale_lp | landing_page | 35 | LP unchanged 30+ days while CPA trends up |

## Priority Scoring

```
priority = base_priority[action_type]
         + impact_modifier      (0-20, scaled by $/day: $0=0, $50+=20)
         + urgency_modifier     (0/+10/+20 per escalation_level)
         + severity_modifier    (0-15, how far metric exceeds threshold)
         + freshness_bonus      (+5 if created today, +2 if yesterday, 0 otherwise)
```

Max possible: ~100. A critical bleeder wasting $30/day scores ~95. A budget rebalance scores ~45.

## Cron Jobs

### 1. Generate & Update Actions — 06:00 UTC daily

Runs before Telegram brief. Steps:

1. Fetch 14 days of `meta_ad_performance` data (reuse existing morning brief query)
2. Run all signal detectors (reuse existing: fatigue, bleeder, winner, efficiency, LP diagnosis)
3. Run new signal detectors (creative diversity, unpushed concepts, stale LPs)
4. For each signal:
   - Compute `dedup_key`
   - If matching pending action exists: update signal_data, re-compute priority_score, increment days_pending, update escalation_level
   - If no match: insert new action_queue row
5. For existing pending actions where signal disappeared:
   - Ad paused externally? → status = 'expired'
   - Metric recovered (CTR back up, CPA back below target)? → status = 'expired'
6. Un-snooze: actions with `snoozed_until < now()` → status = 'pending'

### 2. Check Outcomes — 12:00 UTC daily

```sql
SELECT * FROM action_queue
WHERE status = 'done'
  AND executed_at < now() - INTERVAL '48 hours'
  AND outcome IS NULL
```

For each:
1. Pull fresh metrics for the affected entity from `meta_ad_performance`
2. Compare to `execution_snapshot`
3. Compute deltas (CPA %, ROAS %, spend %)
4. Classify: positive (improved), neutral (±5%), negative (worsened)
5. Generate `outcome_summary` text
6. Write outcome fields

### 3. Telegram Brief — 06:15 UTC (modified existing)

Reads from `action_queue` instead of computing own signals:

```sql
SELECT * FROM action_queue
WHERE status = 'pending'
ORDER BY priority_score DESC
LIMIT 5
```

Formats top 5 with $ impact. Also includes "Recent outcomes" section:

```sql
SELECT * FROM action_queue
WHERE status = 'done' AND outcome IS NOT NULL
ORDER BY outcome_checked_at DESC
LIMIT 3
```

## API Endpoints

### GET /api/command-center
Returns pending actions, KPIs, and recent outcomes.

Response:
```json
{
  "kpis": { "spend": 1200, "revenue": 5800, "roas": 4.83, "purchases": 45 },
  "stats": { "pending": 8, "total_impact_daily": 142, "done_this_week": 3, "positive_outcomes": 2 },
  "actions": [
    {
      "id": "uuid",
      "action_type": "pause_bleeder",
      "category": "ad_ops",
      "priority_score": 92,
      "estimated_impact_daily": 18.50,
      "title": "Pause bleeder: Summer Sale — Lifestyle v3",
      "description": "CPA $42.30, 38% above target for 5 consecutive days",
      "guidance": "This ad has exceeded CPA threshold...",
      "status": "pending",
      "escalation_level": "critical",
      "days_pending": 5,
      "market": "SE",
      "meta_ad_id": "act_123",
      "signal_data": { "cpa": 42.30, "target_cpa": 30.70, "days": 5, "daily_spend": 48 }
    }
  ],
  "completed": [
    {
      "id": "uuid",
      "title": "Paused bleeder: Product Demo v2",
      "executed_at": "2026-03-03T08:12:00Z",
      "outcome_summary": "Campaign CPA improved 15% in 48h",
      "outcome": { "classification": "positive", "cpa_change": -15.2 }
    }
  ]
}
```

### POST /api/command-center/execute
Execute an action.

Request: `{ "action_id": "uuid" }`

Steps:
1. Load action from DB
2. Snapshot current metrics → `execution_snapshot`
3. Execute via Meta API (reuse existing action handlers from morning-brief actions)
4. Update: `status = 'done'`, `executed_at = now()`
5. Log to `ad_learnings`

### POST /api/command-center/snooze
Snooze an action.

Request: `{ "action_id": "uuid", "duration": "1d" | "3d" | "7d" }`

### POST /api/command-center/dismiss
Dismiss an action.

Request: `{ "action_id": "uuid" }`

## UI Design

### Route: `/command-center`

Replaces `/morning-brief` in sidebar navigation.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Command Center                                    [Refresh]  │
├──────────────────────────────────────────────────────────────┤
│ Spend $1.2k │ Revenue $5.8k │ ROAS 4.83x │ 45 purchases    │
├──────────────────────────────────────────────────────────────┤
│ 8 pending │ $142/day at stake │ 3 done this week (67% ✓)    │
├──────────────────────────────────────────────────────────────┤
│ [All] [Ad Ops] [Creative] [Landing Pages]  Sort: [Priority] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌─ CRITICAL ──────────────────────────────────────────────┐  │
│ │ Pause bleeder: Summer Sale — Lifestyle v3               │  │
│ │ SE · Summer Prospecting · 5 days pending                │  │
│ │ CPA $42.30 (+38%) · ~$18/day waste                      │  │
│ │ ▸ Why should I do this?                                 │  │
│ │ [Pause Ad ▸]  [Snooze ▾]  [Dismiss]                    │  │
│ └─────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌─ ELEVATED ──────────────────────────────────────────────┐  │
│ │ Scale winner: UGC Testimonial — Sarah                   │  │
│ │ SE · 7-day streak · 4.8x ROAS · ~$45/day potential     │  │
│ │ [Scale +20% ▸]  [Snooze ▾]  [Dismiss]                  │  │
│ └─────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌─ NORMAL ────────────────────────────────────────────────┐  │
│ │ Creative refresh: Concept #42 — Sleep Angle             │  │
│ │ SE · Earning $80/day but CTR declining 3 days           │  │
│ │ [Open Iterate ▸]  [Snooze ▾]  [Dismiss]                │  │
│ └─────────────────────────────────────────────────────────┘  │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ ▸ Completed Actions (3 this week)                            │
│   ✅ Paused bleeder: Product Demo v2 — CPA improved 15%     │
│   ✅ Scaled UGC Review — ROAS held at 4.2x                  │
│   ⚪ Budget shift applied — outcome pending                  │
└──────────────────────────────────────────────────────────────┘
```

### Card Components

Each action card shows:
- **Escalation badge**: CRITICAL (red), ELEVATED (amber), NORMAL (gray)
- **Title**: action + entity name
- **Context line**: market, campaign, days pending
- **Impact line**: key metric + deviation + estimated $/day
- **Expandable guidance**: detailed reasoning (collapsed by default)
- **Action buttons**: primary action (Pause/Scale/Open Brainstorm), Snooze dropdown, Dismiss

### Execute actions by type:
- `pause_bleeder` / `pause_fatigued` / `pause_adset` → calls Meta API to pause
- `scale_winner` → calls Meta API to increase budget +20%
- `budget_shift` → calls Meta API to rebalance
- `creative_refresh` → navigates to `/brainstorm?concept_id=X&mode=iterate`
- `generate_concepts` → navigates to `/brainstorm`
- `review_unpushed` → navigates to `/concepts?status=unpushed`
- `lp_review` / `lp_refresh` → navigates to relevant landing page

## Migration

1. Create `action_queue` table
2. New API routes: `/api/command-center`, `/api/command-center/execute`, `/api/command-center/snooze`, `/api/command-center/dismiss`
3. New cron: `/api/cron/generate-actions` (06:00 UTC)
4. New cron: `/api/cron/check-outcomes` (12:00 UTC)
5. Modify Telegram cron to read from `action_queue`
6. New page: `/command-center` with `CommandCenterClient.tsx`
7. Update sidebar: replace "Morning Brief" with "Command Center"
8. Keep `/morning-brief` API working (backward compat) but redirect page to `/command-center`
