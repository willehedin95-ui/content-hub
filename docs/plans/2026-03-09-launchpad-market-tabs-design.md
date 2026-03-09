# Launch Pad — Market Tabs Redesign

## Problem

The current Launch Pad shows all markets mixed together with a single global push order. This is confusing because:
- Pushing is market-specific (each market has its own budget/capacity)
- You can't tell the push order per market
- Budget cards for all 3 markets compete for attention
- The "+150 NOK/day" budget button fires immediately with no confirmation
- Currency is incorrectly shown as NOK/DKK — all Meta budgets are in SEK (advertiser account currency)

## Design

### Market Tabs

Replace the current "All / Images / Videos" tabs with market tabs: **NO**, **DK**, **SE**.

Each tab shows:
1. **One budget card** for the selected market (not three side-by-side)
2. **That market's push queue** — concepts ordered by per-market priority
3. **Per-market reorder** — arrows reorder within the selected market only

A concept targeting multiple markets appears in each market's tab with independent priority (#1 in NO, #3 in SE).

### Data Model Change

Currently `image_jobs.launchpad_priority` is a single integer. For per-market ordering, move priority to `image_job_markets`:

```sql
ALTER TABLE image_job_markets ADD COLUMN launchpad_priority integer;
```

For video concepts (which don't use `image_job_markets`), add a similar column or use a join table. Video concepts use `video_jobs.target_languages` for market derivation — add `launchpad_market_priorities jsonb` to `video_jobs` as `{"NO": 1, "SE": 2}`.

Migration: copy current `image_jobs.launchpad_priority` to all that concept's `image_job_markets` rows where stage = 'launchpad'.

### Budget Card (Single, Per-Market)

```
┌─────────────────────────────────────────────┐
│ 1550 SEK/day · 1 new concept/day            │
│ 201 SEK compressible from 5 active ad sets  │
│ Images: 1  Videos: 0                        │
│ [+150 SEK/day for 1 more concept]           │
└─────────────────────────────────────────────┘
```

- Color coding stays: green (canPush >= 2), amber (1), red (0)
- **All currency shown as SEK** — remove NOK/DKK references entirely

### Concept List

```
#1 · Trustpilot Reviews  [Image] [Ron R012] [HappySleep]
     ⊕ Ready to push                    [↑] [↓] [Push] [🗑]

#2 · Swipes 4-Other Markets  [Image] [Hub #021] [HappySleep]
     ⊕ Ready to push                    [↑] [↓] [Push] [🗑]
```

- **Numbering prefix**: `#1 ·`, `#2 ·` etc. before the concept name
- **Push button**: just "Push" (no market list — you're already in that market's tab)
- Only show concepts that have this market in "launchpad" stage

### Budget Increase Confirmation

The "+150 SEK/day" button now shows a confirmation dialog:

```
┌─────────────────────────────────────────┐
│  Increase daily budget?                 │
│                                         │
│  This will add 150 SEK/day to your      │
│  SE campaigns (75 SEK/day each across   │
│  2 campaigns).                          │
│                                         │
│  [Cancel]              [Yes, increase]  │
└─────────────────────────────────────────┘
```

### Reorder API Change

Current: `POST /api/launchpad/reorder` with `{ order: [{ conceptId, type }] }` — sets global `launchpad_priority`.

New: `POST /api/launchpad/reorder` with `{ market: "NO", order: [{ conceptId, type }] }` — sets priority on `image_job_markets.launchpad_priority` for that market.

### Files to Modify

| File | Change |
|------|--------|
| `src/app/launchpad/LaunchpadClient.tsx` | Market tabs, per-market state, numbering, SEK currency, confirmation dialog |
| `src/app/api/launchpad/route.ts` | Return per-market priority from `image_job_markets` |
| `src/app/api/launchpad/reorder/route.ts` | Accept `market` param, update `image_job_markets.launchpad_priority` |
| `src/app/api/launchpad/push/route.ts` | Accept single market (already does via languages) |
| `src/lib/pipeline.ts` | `getLaunchpadConcepts()` — join `image_job_markets` for priority; `calculateAvailableBudget()` — always return "SEK" |
| DB migration | Add `launchpad_priority` to `image_job_markets`, `launchpad_market_priorities` to `video_jobs` |
