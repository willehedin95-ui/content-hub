# Morning Brief Overhaul — Priority Tiers + Sync Fix

## Problem
The morning brief page is overwhelming: too many action cards, stale/duplicate actions (already handled by automation but still showing), and no clear sense of what matters most. User is new to Meta Ads and needs guidance, not a wall of equally-weighted cards.

## Root Cause
The morning brief API generates action cards from `meta_ad_performance` data but never checks `auto_paused_ads` or `concept_lifecycle` tables. So ads that the auto-pause cron already killed, or concepts the pipeline already marked as dead, still appear as "pause this" action cards.

## Design

### 1. Fix the sync bug (backend)
- Before generating bleeder/pause cards, query `auto_paused_ads` and exclude those ad IDs
- Before generating any cards, query `concept_lifecycle` where `stage = 'killed'` and exclude ads belonging to those concepts
- No new tables needed — just reading existing data the morning brief currently ignores

### 2. "Automation handled" banner
- At the top of the page, before action cards
- Queries recent `auto_paused_ads` entries (last 24h) and recent `concept_lifecycle` kills
- Shows: "While you were away: Auto-paused X bleeding ads (saved ~$Y/day). Killed Z concepts."
- Collapsed details expandable to see individual items
- Calm, reassuring tone — builds trust that automation is working

### 3. Priority tiers
Replace flat card list with 3 sections:

**Tier 1: "Do Now"** (red accent, expanded)
- Max 3 cards. Only things actively losing money right now
- Bleeding ads the auto-pause hasn't caught, dying ad sets
- Shows estimated daily waste per card
- If >3 critical items, auto-handle the obvious ones, surface ambiguous ones

**Tier 2: "Review Today"** (amber accent, expanded)
- Winners to scale, creative fatigue on profitable concepts, budget rebalancing
- Each card notes urgency level: "No rush — can wait until tomorrow"

**Tier 3: "FYI"** (gray accent, collapsed by default)
- Save winning copy, landing page suggestions, diagnostics
- Counter badge: "FYI (4)"

### 4. Educational card text
Each card gets enhanced copy:

- `why` text always visible (not behind a toggle)
- New `what_happens` field: plain-language explanation of what the button does ("The ad set stops spending immediately. Budget redistributes to other active ad sets.")
- New `cost_of_inaction` field: what you lose by not acting ("~$60/day continues to be spent with very low chance of converting")
- Written for someone new to Meta Ads — no jargon

### Card type → educational patterns:
- **Pause**: stops spending, budget redistributes, what it means for the concept
- **Scale**: increases daily budget by 20%, Meta needs ~2 days to adjust, watch CPA after
- **Budget shift**: moves money from underperformers to winners, no ads paused
- **Refresh**: concept works but is getting stale, time to make new creative variations

## Changes Required

### Backend (API route: `/api/morning-brief/route.ts`)
1. Query `auto_paused_ads` (last 7 days) at start of card generation
2. Query `concept_lifecycle` where stage = 'killed' at start
3. Filter both sets out before generating any action cards
4. Build `automation_summary` object from these queries (counts, savings, details)
5. Assign `tier` field to each card: `"do_now"` / `"review_today"` / `"fyi"`
6. Cap `do_now` at 3 cards
7. Add `what_happens` and `cost_of_inaction` text to each card type
8. Return `automation_summary` alongside `action_cards` in response

### Frontend (`MorningBriefClient.tsx`)
1. New `AutomationSummary` component at top of page
2. Replace flat card list with 3 `TierSection` components
3. Tier headers with count badges and color accents
4. FYI section collapsed by default
5. Cards render `why` always visible, plus `what_happens` and `cost_of_inaction`
6. Remove old toggle for guidance text

## No new tables needed
All data already exists in `auto_paused_ads` and `concept_lifecycle`.
