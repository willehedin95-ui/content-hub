# Quiz hook: landing-screen vs skip-to-first-question

**Workspace**: doginwork
**Surface**: quiz (entry / first node)
**Variant group ID**: `vg_1777927539254_hmbq67ds`
**Status**: **declared (winner = B, skip-landing)**

## Hypothesis

Showing a "Landing - hook" intro screen (Marie video + Start button) before the first quiz question adds friction without information value. Skipping it and starting the user directly on the first question (Block 1 - Kön) will lift completion-to-offer-page rate by 20%+ because users are mid-action immediately rather than evaluating whether to start.

## Variants

### A (control) - `step_1777927539258_mozihnes` "Landing - hook (A control)"
Landing screen with Marie video + Start CTA, THEN navigates to Block 1 (Kön / gender question).

### B (treatment) - `step_1778181262965_i6wseryw` "Block 1 - Kön (B variant)"
Skips landing entirely. Session lands directly on the gender question with no intro screen.

## Sample plan

- **Primary metric**: % of sessions that reach Block 3 (Valpens namn) - first commit-step after the entry. Chosen because it's the first comparable downstream point between the two arms (B replaces Block 1 itself, so we measure from Block 3 onward).
- **Target sample**: 250+ sessions per variant
- **Secondary metrics**: % reaching Block 12 (Pattern Reveal), Block 24 (Profil), offer page; purchase rate
- **Significance test**: z-test for two proportions, p < 0.05 minimum
- **Expected run time**: 2-3 weeks at ~30-100 sessions/day

## Started

2026-05-08 (first session with `vg_1777927539254_hmbq67ds` assignment seen)

## Ended

2026-05-28 (declared)

## Results

### Primary metric: Block 3 (Valpens namn) reach rate

| Variant | sessions assigned | reached Block 3 | rate |
|---|---|---|---|
| A (landing) | 285 | 77 | **27.0%** |
| B (skip) | 335 | 132 | **39.4%** |

- Diff: +12.4 percentage points (+46% relative lift)
- z-statistic: 3.24
- **p-value: < 0.001**

Highly significant. B wins.

### Secondary metrics (sessions since 2026-05-12)

| Funnel stage | A rate | B rate | Relative lift |
|---|---|---|---|
| Reached Block 12 (Pattern Reveal) | 23.9% (68/285) | 28.7% (96/335) | +20% |
| Reached Block 24 (Profil) | 16.5% (47/285) | 19.7% (66/335) | +19% |
| Reached offer page | 14.4% (41/285) | 18.8% (63/335) | **+31%** |
| Purchased | 0.70% (2/285) | 0.30% (1/335) | -57% (n=3, not significant) |

Purchase rate diverges from upstream rates but n=3 across both variants - far below 30 conversions/variant minimum. Treating this as noise; primary upstream metric is the reliable signal.

### Significance check SQL

```sql
with v as (
  select id,
    variant_assignments->>'vg_1777927539254_hmbq67ds' as hook_v,
    purchased
  from quiz_sessions
  where quiz_id = '29dd6398-51b7-46aa-8f3a-92b455d18cb7'
    and started_at >= '2026-05-12'
    and variant_assignments ? 'vg_1777927539254_hmbq67ds'
),
steps as (
  select session_id, step_id from quiz_events
  where quiz_id = '29dd6398-51b7-46aa-8f3a-92b455d18cb7'
    and created_at >= '2026-05-12'
    and event_type = 'step_view'
)
select
  case when v.hook_v = 'step_1777927539258_mozihnes' then 'A_landing'
       else 'B_skip' end as variant,
  count(distinct v.id) as sessions,
  count(distinct case when s.step_id = 'step_1777927539486_ecvzox3x' then v.id end) as reached_block3,
  count(distinct case when s.step_id in ('step_1777927539583_lhvtzvnx','step_1778588267757_offerb') then v.id end) as reached_offer
from v
left join steps s on s.session_id = v.id
group by 1
order by 1;
```

## Decision

**Shipped**: B (skip landing)
**Reason**: +46% lift on primary metric at p < 0.001. Upstream lifts of +19% to +31% confirm the effect through the funnel. Purchase noise is too small a sample to override.
**Action taken**: 2026-05-28 - Set `step_1777927539258_mozihnes` trafficPct=0, `step_1778181262965_i6wseryw` trafficPct=100. Patched via PostgREST PATCH on `quizzes.data`. Published via `npx tsx scripts/publish-doginwork-quiz.ts` (commit TBD).

## Follow-ups

- **Next hook test**: Now that skip-landing is baseline, test alternative first-questions. Candidates: gender (current) vs valpens namn (commit-first) vs primary-pain (qualifier-first). New test should reuse the same variant group infrastructure.
- **Cleanup**: After 30 days with no new sessions on A, archive `step_1777927539258_mozihnes` HTML (don't delete - keep for historical reference in case we want to re-test).
- **Track purchase impact**: Continue monitoring purchase rate weekly. If the +31% offer-page lift doesn't translate to a +20%+ purchase lift after 60 days, we have a leak between offer-view and purchase that needs its own investigation.
