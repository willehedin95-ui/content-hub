# Meta Ads Redesign — Design Document

**Date:** 2026-03-04
**Status:** Approved
**Inspired by:** Atria (creative breakdown), Madgicx (AI actions, learning phase, goals), Admigo (automation flywheel)

## Problem

The hub has strong Meta Ads backend infrastructure (push pipeline, insights fetching, signal detection, action APIs) but the user-facing experience is fragmented:

- **Performance page** (3 tabs) — never used, being removed
- **Morning Brief** — has good signals + actions but buries them under walls of data
- **No dedicated Meta Ads dashboard** — no place to see campaign health at a glance
- **No creative component breakdown** — can't see which headlines/copy/images perform best independently
- **No learning phase tracking** — missing critical Meta optimization signal

## Solution: Two-Page Split (Approach A)

### Page 1: Daily Actions (`/morning-brief`, renamed "Daily Actions" in sidebar)

The page you open every morning. Actions first, data second.

**Layout:**

1. **Header bar** — "Good morning" + date, refresh button
2. **Compact KPI strip** (single row, not big cards) — Today's spend | ROAS | Purchases | Active ads
3. **AI Action Cards** (3-7 cards, the main event):
   - Icon + category badge (Budget, Creative, Audience)
   - Action title: "Pause underperforming ad set SE #016"
   - Why: 1-2 sentence reasoning with data
   - Expected impact: "Save ~kr150/day, improve account ROAS"
   - Apply button (primary) + Dismiss button (secondary)
   - Inline success/failure feedback after applying
4. **Collapsible detail sections** (below the fold, collapsed by default):
   - Campaign Trends (7d vs previous 7d)
   - Winners & Losers (top/bottom 5)
   - Recent Actions (audit trail from `ad_learnings`)

**Action types** (generated from existing signal engine):
- Pause bleeders (from bleeder detection)
- Scale winners +20% (from consistent winner detection)
- Creative refresh needed (from fatigue detection)
- Budget rebalance (from efficiency scoring)
- Landing page issue (from LP vs creative diagnosis)
- Test forgotten creatives (concepts in draft stage never pushed)
- Kill learning-limited ads (stuck in learning phase 7+ days)

**Key change:** Instead of showing raw signal sections (Bleeders, Winners, Fatigue, etc.) and letting the user figure out what to do, the AI synthesizes all signals into specific actionable cards.

**Reuses:** Existing signal engine in `/api/morning-brief/route.ts`, existing action handlers in `/api/morning-brief/actions/route.ts`.

### Page 2: Meta Ads Dashboard (`/meta-ads`, replaces `/performance`)

The analysis workbench for understanding how things are going.

**Layout:**

1. **Header bar** — "Meta Ads" title, period selector (7d/14d/30d), country filter (All/SE/NO/DK)
2. **KPI Cards row** (5 cards with sparklines + % change):
   - Ad Spend, Revenue, ROAS (color-coded), CPA, Purchases
3. **Campaign Table** (sortable, the main workhorse):
   - Columns: Name, Status, Learning Phase, Spend, Impressions, Clicks, CTR, CPC, Purchases, Revenue, ROAS, CPA, Frequency
   - Learning phase badge: green "Active" / yellow "Learning" / red "Limited"
   - Action buttons per row: Pause/Resume, Scale +20%/-20%, link to Meta Ads Manager
   - Expandable rows showing individual ads
4. **Creative Breakdown** (Atria-inspired, tabbed):
   - Tabs: Headlines / Copy / Images
   - Cards sorted by ROAS, filterable by min spend threshold (e.g. kr100)
   - Headlines: headline text + ROAS + Spend + Purchases
   - Copy: ad copy text (truncated) + ROAS + Spend
   - Images: thumbnail + ROAS + Spend + CTR
   - Toggle: card view / table view
5. **Trend Chart** (below the fold):
   - Spend vs Revenue line chart over selected period

### Learning Phase Tracking

Badge in the campaign table on `/meta-ads`. Fetched via `effective_status` + `learning_stage` fields from Meta API (no extra API call — added to existing fetch).

- Green dot + "Active" — exited learning
- Yellow dot + "Learning" — still learning
- Red dot + "Limited" — learning limited

Learning Limited for 7+ days generates an AI Action card on Daily Actions page.

### Meta Ads MCP (Post-build)

Install pipeboard-co/meta-ads-mcp for conversational Meta queries during Claude Code sessions. Config only, no hub code changes.

## Navigation Changes

- **Remove:** "Performance" from sidebar
- **Add:** "Meta Ads" in sidebar (under Ads group or top-level)
- **Rename:** "Morning Brief" → "Daily Actions" in sidebar

## Data Sources

| Feature | Source | Existing? |
|---------|--------|-----------|
| Daily Actions signals | `meta_ad_performance` table + signal engine | Yes — reuse `/api/morning-brief` |
| Daily Actions actions | Meta API (pause/scale/budget) | Yes — reuse `/api/morning-brief/actions` |
| Dashboard KPIs | Meta API insights | Partially — extend existing routes |
| Campaign table | Meta API campaign/adset/ad hierarchy | Partially — extend `meta.ts` |
| Learning phase | Meta API `effective_status` field | New — small addition |
| Creative breakdown | `meta_ad_performance` JOIN `meta_ads` | New API route |
| Trend chart | `meta_ad_performance` daily data | Exists in DB |

## Files to Delete

- `src/app/performance/` — entire directory (page.tsx, PerformanceClient.tsx, PageAnalyticsClient.tsx, TrackingClient.tsx, AttributionClient.tsx)
- Related API routes can stay (some reused by other features)

## Files to Create/Modify

- `src/app/meta-ads/page.tsx` — new dashboard page
- `src/app/meta-ads/MetaAdsDashboardClient.tsx` — new dashboard client component
- `src/app/morning-brief/MorningBriefClient.tsx` — major restructure (AI action cards)
- `src/app/api/morning-brief/route.ts` — add action card generation logic
- `src/app/api/meta/insights/route.ts` — new route for dashboard KPIs + creative breakdown
- `src/lib/meta.ts` — add learning phase fields to fetches
- `src/components/layout/Sidebar.tsx` — navigation changes
