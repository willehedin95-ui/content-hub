# Session: 2026-03-03

## What was done

### Meta Ads Automation — CBO Fix + Telegram Chat ID
- **Winner graduation CBO support**: Fixed `graduateWinners()` in webhook route — when ad sets have no daily budget (CBO campaigns), now increases campaign budget +20% instead of skipping. Deduplicates by both ad set and campaign.
- **`campaign_id` added** to `consistent_winners` output in morning brief API + client type, so graduation logic knows which campaign to target.
- **Telegram chat ID**: Captured user's chat ID (`5432096458`) via `getUpdates`, set `TELEGRAM_NOTIFY_CHAT_ID` in `.env.local` and Vercel production. Restored webhook with `callback_query` support.

### Pipeline — Draft Concepts + Missing Concepts Fix
- **Draft column**: `getPipelineData()` now includes completed/ready image_jobs without `image_job_markets` as "draft" stage concepts (one entry per target market derived from `target_languages`). Added "draft" to visible STAGES in UI.
- **Orphaned campaigns**: Concepts #007, #008, #009 existed in Meta and `meta_campaigns` but had no `image_job_markets` rows (push happened before pipeline tracking was added). Backfilled all 6 missing market rows manually.
- **Auto-repair in sync**: `syncPipelineMetrics()` now detects orphaned `meta_campaigns` (have `image_job_id` but no `image_job_markets`) and auto-creates the missing links on every sync.

### Pipeline Sync — Daily Metrics Fix
- **Bug**: Sync was using `getAdInsights()` (aggregated totals, no `time_increment=1`) instead of `getAdInsightsDaily()` (daily breakdown). All metrics collapsed into 1 row per ad.
- **Fix**: Switched to `getAdInsightsDaily()`, extended range from 30→60 days.
- **Backfill**: Ran full sync — 448 daily metric rows synced (Jan 5 → Feb 28, 55 days of data).

### SE Concept Kill Decisions
- Pulled full Meta performance data for all SE ad sets (Jan 1 → Mar 3) and analyzed ROAS/CPA.
- **Killed 5 underperformers** on Meta (paused ad sets):
  - SE #009 Wake Pain-Free — 770 SEK, 1.0x ROAS
  - SE #016 swipes — 4,754 SEK, 0.9x ROAS
  - SE #005 weird natives — 740 SEK, 0 purchases
  - #114 AI UGC street interview — 2,435 SEK, 1.0x ROAS
  - US#110 adv sleep doctor Copy — 1,710 SEK, 0.5x ROAS
- **SE Winners identified**: #006 hero (4.1x), #106 SoScale (2.8x), #007 neck alarm (2.9x), #101 Snarkadvertorial (3.0x), #014 first night (5.2x), #104 Makeup (4.6x)

### Killed Concept → Meta Pause Verification
- User reported "killed concept not paused in Meta" — verified all 4 killed concepts via Meta API, all show `status: PAUSED`.
- The ad-level `status: ACTIVE` with `effective_status: ADSET_PAUSED` in Ads Manager was misleading — ads inherit pause from their parent ad set.

## Commits (10 ahead of origin, not pushed)
- `d737fcd` fix: winner graduation supports CBO campaigns (campaign-level budget)
- `be3dc25` fix: pipeline shows draft concepts + auto-repairs orphaned campaigns
- `2fc6fa3` fix: pipeline sync uses daily breakdown + kill 5 SE underperformers

## Key files changed
- `src/lib/pipeline.ts` — draft concepts, auto-repair orphaned campaigns, daily sync fix
- `src/app/pipeline/PipelineClient.tsx` — draft column in STAGES, country filter includes draft
- `src/app/api/telegram/webhook/route.ts` — CBO-aware graduation (campaign + ad set level)
- `src/app/api/morning-brief/route.ts` — campaign_id in consistent_winners
- `src/app/morning-brief/MorningBriefClient.tsx` — campaign_id in ConsistentWinner type

## Decisions made
- **No scaling campaign**: User runs CBO only — increasing campaign budget when winners exist (+ auto-pause bleeders) is simpler and equally effective for a solopreneur setup vs maintaining a separate scaling campaign.
- **Draft = unpushed concepts**: Concepts with completed images but no Meta push show as "draft" in pipeline. One entry per target market.
- **60-day sync window**: Enough historical data for trend analysis without excessive API calls.

## Current state
- Pipeline should now show all concepts including drafts, with proper daily metrics
- Telegram bot fully connected (chat ID set, webhook active)
- 10 commits ahead of origin (not pushed)

## Next up
- Push to main when user confirms
- Test pipeline UI with fresh data (sync + draft concepts visible)
- The pipeline still needs the older SE concepts (#101-#115 etc.) tracked — they exist in `meta_campaigns` but many aren't linked to `image_jobs`
