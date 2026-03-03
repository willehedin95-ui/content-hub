# Ad Performance Data Sync — Design

**Date**: 2026-03-03
**Initiative**: Meta Ads Automation Phase 1 (Data Foundation)
**Inspired by**: Matt Berman's Meta Ads Copilot, Cody Schneider's testing framework

## Purpose

Pull ad-level performance data from Meta Insights API twice daily into Supabase. This is the foundation for the 5 Daily Questions morning brief, fatigue detection, bleeder detection, winner identification, and all downstream automation.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Granularity | Ad-level only | Campaign/ad set metrics computed via aggregation. Single source of truth. |
| Sync frequency | Twice daily (6 AM + 6 PM UTC) | Catches bleeders within ~12h. Daily is too slow for 48h auto-pause rule. |
| Historical backfill | 30 days on first run | Enough for 7-day trend windows and baseline computation. |
| Normal sync window | Last 3 days | Overlap accounts for Meta's late attribution corrections. |
| Architecture | New dedicated cron route | Isolation from existing `daily-snapshot`. Different concerns, different failure modes. |

## Table Schema: `meta_ad_performance`

```sql
CREATE TABLE meta_ad_performance (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date            DATE NOT NULL,
  meta_ad_id      TEXT NOT NULL,
  ad_name         TEXT,
  adset_id        TEXT,
  adset_name      TEXT,
  campaign_id     TEXT,
  campaign_name   TEXT,
  status          TEXT,
  impressions     INTEGER NOT NULL DEFAULT 0,
  clicks          INTEGER NOT NULL DEFAULT 0,
  spend           NUMERIC(10,2) NOT NULL DEFAULT 0,
  ctr             NUMERIC(6,4) DEFAULT 0,
  cpc             NUMERIC(10,2) DEFAULT 0,
  cpm             NUMERIC(10,2) DEFAULT 0,
  frequency       NUMERIC(6,2) DEFAULT 0,
  purchases       INTEGER NOT NULL DEFAULT 0,
  purchase_value  NUMERIC(10,2) DEFAULT 0,
  roas            NUMERIC(8,2) DEFAULT 0,
  cpa             NUMERIC(10,2) DEFAULT 0,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(date, meta_ad_id)
);

CREATE INDEX idx_ad_perf_date ON meta_ad_performance(date DESC);
CREATE INDEX idx_ad_perf_ad ON meta_ad_performance(meta_ad_id, date DESC);
CREATE INDEX idx_ad_perf_campaign ON meta_ad_performance(campaign_id, date DESC);
```

### Key schema decisions

- **UNIQUE(date, meta_ad_id)**: Enables `ON CONFLICT DO UPDATE` — safe to re-run without duplicates.
- **Denormalized names**: ad_name, adset_name, campaign_name stored per row. Names can change over time; this captures what they were at sync time.
- **Pre-computed ROAS/CPA**: Avoids division-by-zero bugs in every downstream query. CPA = NULL when purchases = 0.
- **No separate campaign/ad set rows**: Aggregate with `GROUP BY campaign_id` when needed.

## Cron Route: `/api/cron/ad-performance-sync`

- **Schedule**: 6 AM + 6 PM UTC (added to `vercel.json`)
- **Auth**: Bearer `CRON_SECRET` (same pattern as existing crons)
- **maxDuration**: 120s (ad-level data may be larger than market aggregates)
- **Meta API call**: `getAdInsights()` with `time_increment=1` for daily breakdown
- **First run detection**: If table is empty, pull 30 days. Otherwise, pull 3 days.
- **Upsert**: `ON CONFLICT (date, meta_ad_id) DO UPDATE SET ...`

### Data extraction from Meta response

Meta returns `actions` and `action_values` as arrays:
```json
{
  "actions": [{"action_type": "purchase", "value": "3"}, ...],
  "action_values": [{"action_type": "purchase", "value": "89.97"}, ...]
}
```

Extract `purchase` action type for purchases count and purchase_value. Compute:
- `roas = purchase_value / spend` (0 if spend = 0)
- `cpa = spend / purchases` (NULL if purchases = 0)

## Data Flow

```
Vercel Cron (6 AM + 6 PM UTC)
    ↓
GET /api/cron/ad-performance-sync (Bearer auth)
    ↓
Check if table empty → 30-day backfill or 3-day normal sync
    ↓
meta.ts → getAdInsights(since, until) with time_increment=1
    ↓
Parse actions[] → purchases + purchase_value per ad per day
    ↓
Compute ROAS + CPA
    ↓
Upsert into meta_ad_performance
    ↓
Return { ok, rows_synced, date_range, is_backfill }
```

## What This Enables

With this table populated, the 5 Daily Questions API can query:

1. **Spend pacing**: `SUM(spend) WHERE date = today` vs daily budget
2. **What's running**: `DISTINCT campaign_name, status WHERE date = MAX(date)`
3. **Performance trends**: `GROUP BY campaign_id` over last 7 days, compare week-over-week
4. **Winners/losers**: `ORDER BY roas DESC` or `cpa ASC` for latest date
5. **Fatigue signals**: Day-over-day CTR, frequency, CPC per ad — detect 3+ day trends

Also feeds Phase 2 signal engine: bleeder detection (CPA > 2.5x for 48h+), fatigue severity tiers, LP vs creative fatigue distinction, efficiency scoring (CTR/CPC).
