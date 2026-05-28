# A/B Test Documentation

Every A/B test we run on quizzes, landing pages, or offer pages MUST be documented here. One markdown file per test. Filename format:

```
YYYY-MM-DD_<workspace>_<surface>_<short-name>.md
```

Example: `2026-05-12_doginwork_quiz-offer-page_stripped-vs-rich.md`

## Why we document every test

- Stops us re-running the same hypothesis we already disproved
- Forces us to write the hypothesis BEFORE looking at results (less p-hacking)
- Creates a record of WHY we shipped the winner so the next dev/LLM doesn't undo it
- Lets us spot patterns across tests (e.g. "stripped variants consistently win on mobile")
- Required reading before touching any variant-related code or quiz `trafficPct`

## Template

Use `_TEMPLATE.md` as starting point. Mandatory sections:

1. **Status** - one of: `planning` / `live` / `paused` / `declared (winner = X)` / `inconclusive (killed)`
2. **Hypothesis** - written BEFORE launch in falsifiable form
3. **Variants** - what differs between A and B (with screenshots or HTML diffs if visual)
4. **Sample plan** - target n per variant + primary success metric
5. **Started / Ended** - dates
6. **Results** - actual numbers + significance test
7. **Decision** - what we shipped and why
8. **Follow-ups** - new tests this spawned

## Significance rules

- **Primary metric** must be pre-declared (top of "Sample plan"). Secondary metrics are descriptive only.
- **z-test for two proportions** for conversion/click-through metrics. p < 0.05 minimum, p < 0.01 preferred for shipping decisions.
- **Minimum sample**: 100 conversions per variant for purchase-based decisions, 30 per variant for upstream funnel metrics.
- If sample is too small after 4 weeks, either kill the test or declare on the strongest available upstream metric (with caveats noted).

## Active tests

Quick index. Detail in each file.

| Test | Workspace | Surface | Status | Last updated |
|---|---|---|---|---|
| Quiz hook (landing vs skip) | doginwork | quiz | **declared (B wins)** | 2026-05-28 |
| Offer page (rich vs stripped) | doginwork | quiz/offer | live | 2026-05-28 |

## How variant routing works (technical)

Variants live on `quizzes.data.nodes[<step_id>]` with:
- `variantGroupId`: groups sibling variants
- `trafficPct`: 0-100, sum should = 100 across group

Runtime picks via `weightedPick` in `runtime/quiz-runtime/src/state.ts`. Assignment is persisted per session in `quiz_sessions.variant_assignments` JSONB.

`trafficPct=0` -> variant is dead (no new assignments). Existing assigned sessions keep using it for navigation continuity (see `state.ts` resolver).

To declare a winner: set winner `trafficPct: 100`, losers `trafficPct: 0`, then run `npx tsx scripts/publish-doginwork-quiz.ts` (or the relevant per-workspace publish script).
