# Ad Diagnostics: Structural Performance Classification

## Problem

The morning brief detects performance *deteriorating over time* (Q8: LP vs Creative Fatigue), but misses **steady-state mismatches** — an ad that has always had great CTR but terrible conversion. The classic diagnostic framework:

- High CTR + low conversion = landing page problem
- Low CTR + any conversion = hook/creative problem
- High CTR + high conversion + no scale = audience too narrow (deferred)

Without this, the default instinct is "test more ads" when the real fix might be swapping the landing page.

## Design

### Classification Logic

Every ad with enough data (last 7 days, min $10 spend, min 500 impressions) gets classified into a diagnostic bucket.

**Threshold calculation** — dynamic percentile benchmarks from own data:
- **High CTR**: above 75th percentile of qualifying ads (fallback >1.5% if <8 ads)
- **Low CTR**: below 25th percentile (fallback <0.8%)
- **Good conversion**: CPA <= `target_cpa` from `pipeline_settings`
- **Bad conversion**: CPA > `target_cpa` OR zero purchases

**Buckets**:

| CTR | Conversion | Diagnosis | Action |
|-----|-----------|-----------|--------|
| High | Bad | Landing page problem | Flag for LP swap |
| Low | Any | Hook/creative problem | Need better creative |
| High | Good | Winner | Already caught by existing detection |
| Low-mid | Bad | Everything problem | Concept likely not viable |

### Integration

**Morning brief API** — New "Q10: Ad Diagnostics" section in `/api/morning-brief/route.ts`. Returns array of diagnosed ads with bucket, metrics, and context.

**Action cards** — Two new types:
- `swap_landing_page` (priority 2): High CTR + bad conversion. "The ad works, the page doesn't convert. Try a different page."
- `replace_creative` (priority 3): Low CTR. "The hook isn't stopping the scroll. Need a new creative angle."

**Morning brief UI** — New section in MorningBriefClient with color-coded diagnostic table.

**Telegram brief** — Diagnostic summary included, LP problems highlighted prominently.

### Edge Cases

- **New ads (<3 days)**: Excluded — not enough signal.
- **<8 qualifying ads**: Fall back to fixed thresholds (high >1.5%, low <0.8%).
- **Zero purchases**: Classified as bad conversion. High CTR + zero purchases = strong LP signal.
- **Overlap with Q8**: Both can flag the same ad. Q8 = "getting worse", Q10 = "structural problem". Both firing = stronger confidence.
- **Missing pipeline_settings**: Skip conversion classification for that ad, log warning.
- **Multi-market**: Resolve product/market via `meta_campaigns` table (same as bleeder detection).

### What It Does NOT Do

- No automatic page swapping — just flags + manual pick
- No page recommendation engine — future feature
- No "audience too narrow" detection — deferred
- Doesn't duplicate existing winner/bleeder detection — adds the *why*
