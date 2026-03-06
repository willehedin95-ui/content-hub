# Launch Pad & Pipeline Redesign

**Date**: 2026-03-06
**Status**: Approved

## Problem

The current pipeline uses a slot-based model (X testing slots per market) that doesn't reflect how Meta's CBO + Andromeda actually allocates budget. This causes:
- Concepts queued unnecessarily when "slots are full" even though Meta has budget
- No clear staging area for push-ready concepts vs test data / in-progress work
- Ron's external concepts conflict with hub auto-numbering (#021 vs #021)
- Legacy pre-hub SE ads are orphaned — no thumbnails, no data, not merged with their NO/DK counterparts

## Design

### 1. Launch Pad — Push-Ready Staging Area

**New concept stage**: `"launchpad"` in the lifecycle. Only concepts explicitly moved here by the user are candidates for auto-push.

**Simplified lifecycle** (drop "ready" status):
```
draft → [user clicks "Add to Launch Pad"] → launchpad → testing → review → active
                                                                     ↓
                                                                   killed
```

**Validation gate** — when adding to launch pad, check:
- All target market images exist (4:5 + 9:16 per language)
- Ad copy exists for all target languages
- Landing page or AB test selected
- Product is set

Block with specific error if incomplete.

**`/launchpad` page**:
- Single page, all concepts, per-market status columns
- Each concept shows: `NO: ✅ Live · DK: ⏳ Waiting · SE: ✅ Live`
- Drag-to-reorder priority (or up/down)
- "Push Now" button for immediate push (bypasses cron)
- "Remove" button to pull back to draft
- Budget indicator at top per market: "NO: ~350 kr available · can push 2 concepts"
- Once all markets pushed, concept graduates off the launch pad

**New fields on `image_jobs`**:
- `source`: `"hub" | "external" | "legacy"` (default `"hub"`)
- `launchpad_priority`: `integer | null` (lower = first, null = not on launch pad)

### 2. Concept Sources & Naming

**Hub concepts** (`source: "hub"`):
- Created via Brainstorm or competitor-swipe
- Auto-numbered: #001, #002, #003...
- Ad set name: `SE #017 | statics | concept-name`

**External concepts** (`source: "external"`):
- Created via "New Ad Concept" button (Ron's Google Drive import flow)
- Auto-numbered: R001, R002, R003... (separate sequence)
- Ad set name: `SE R021 | statics | concept-name`

**Legacy concepts** (`source: "legacy"`):
- Imported from Meta (pre-hub ads)
- Keep original ad set name/number
- Tagged for visibility, no new number assigned

Existing "New Ad Concept" flow (Google Drive images + auto-match copy from doc) stays exactly as-is. Only change: sets `source: "external"` and uses R-prefix numbering.

### 3. Legacy SE Import & Merge

One-time operation to merge orphaned SE ad sets with existing NO/DK concepts:

1. Scan Meta for SE ad sets not tracked in hub
2. Match by concept name to existing `image_jobs` (e.g., "bold text" SE → "bold text" NO/DK)
3. Add SE as a market: create `image_job_market` entry under existing concept
4. Link Meta ad set: create `meta_campaigns` record
5. Pull thumbnail from Meta Graph API (ad creative image)
6. Tag `source: "legacy"`

After merge: unified concept card showing SE + NO + DK with performance data from all markets.

Edge case: SE ads with no matching NO/DK concept → create new `image_job` with `source: "legacy"`.

### 4. Budget-Aware Auto-Push (Replacing Slots)

**Core formula** (evaluated per market independently):
```
winner_spend = avg daily spend on established concepts (last 3 days)
testing_spend = count(concepts pushed in last 3 days) × 150 kr
available = campaign_daily_budget - winner_spend - testing_spend

if available > 150:
    push next concept from launch pad for this market
```

**Per-market independence**: NO might push today while DK waits. Each market evaluated separately by the cron.

**Concept-level kill rules**:
| Condition | Action |
|-----------|--------|
| All ads in ad set paused | Kill ad set (zombie cleanup) |
| Spend < 1 kr/day for 5+ consecutive days AND 0 conversions | Kill (Meta abandoned it) |
| CPA > 2x target for 7+ days | Kill (consistent bleeder) |
| 1 ad left but profitable | **Keep alive** |
| Low spend but good CPA | **Keep alive** |

**What gets removed**:
- `testing_slots` from `pipeline_settings`
- `getTestingSlots()` function
- `availableSlots = testingSlots - liveConceptCount` logic
- The queue concept ("queued" stage) — launch pad replaces it

**Cron behavior** (daily):
1. Sync metrics from Meta (existing)
2. Detect kills based on new rules (modified)
3. Per market: calculate available budget → push from launch pad if room (new)
4. Telegram: "Pushed X to NO · DK waiting (120 kr available, need 150)"

**Launch pad budget indicator** uses same formula for real-time display.

## Data Model Changes

### New/modified columns on `image_jobs`:
- `source TEXT DEFAULT 'hub'` — "hub", "external", "legacy"
- `launchpad_priority INTEGER` — null = not on launch pad

### New stage value:
- `"launchpad"` added to concept_lifecycle stages

### Removed:
- `testing_slots` column from `pipeline_settings` (after migration)
- `"queued"` stage (deprecated, existing records kept for history)
- `"ready"` status on image_jobs (merge with "draft")

### New RPC or helper:
- `assign_next_external_concept_number(product)` — returns next R-number
- `calculate_available_budget(market)` — returns available testing budget
