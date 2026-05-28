# <Test name>

**Workspace**: <doginwork | hydro13 | happysleep>
**Surface**: <quiz | landing page | offer page | ad copy | other>
**Variant group ID**: `vg_xxxxxxxxxx`
**Status**: planning | live | paused | declared (winner = X) | inconclusive (killed)

## Hypothesis

<Falsifiable statement, written BEFORE launch. Format: "Doing X will lift metric Y by Z% because <mechanism>.">

Example: "Skipping the landing-hook video and jumping straight into the gender question will lift completion-to-offer rate by 20%+ because we remove a 0-information friction step that gives users no reason to commit."

## Variants

### A (control) - step `step_xxx`
<Describe what's different. Link/embed screenshot. For copy/HTML changes, include the diff.>

### B (treatment) - step `step_yyy`
<Same as above.>

## Sample plan

- **Primary metric**: <one specific measurable thing - e.g. "session_started -> reached_offer_page rate">
- **Target sample**: <n per variant, e.g. "300 sessions per variant or 30 conversions, whichever first">
- **Secondary metrics**: <list, descriptive only>
- **Significance test**: <z-test for two proportions, p < 0.05>
- **Expected run time**: <e.g. "2-3 weeks at current traffic">

## Started

<YYYY-MM-DD>

## Ended

<YYYY-MM-DD or "ongoing">

## Results

### Primary metric

| Variant | n | conversions | rate |
|---|---|---|---|
| A | <n> | <c> | <rate%> |
| B | <n> | <c> | <rate%> |

- Diff: <absolute pp, relative %>
- z-statistic: <z>
- p-value: <p>

### Secondary metrics

<List with same table format.>

### Significance check SQL

```sql
-- Paste the exact SQL used to pull the numbers above so they're reproducible.
```

## Decision

**Shipped**: <A | B | neither>
**Reason**: <1-2 sentences why>
**Action taken**: <e.g. "Set A trafficPct=0, B trafficPct=100. Published 2026-05-28 commit abc1234.">

## Follow-ups

- <Next test this enables, e.g. "Now that skip-landing is baseline, test alternative first-question types (gender vs name vs pain).">
- <Any cleanup needed, e.g. "Remove A-variant HTML once 30 days of no new sessions assigned.">
