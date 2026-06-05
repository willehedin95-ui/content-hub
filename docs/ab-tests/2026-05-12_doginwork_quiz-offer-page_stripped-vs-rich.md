# Offer page: stripped/personalised vs rich/visual

**Workspace**: doginwork
**Surface**: quiz (offer page node)
**Variant group ID**: `vg_1778588267757_offerab`
**Status**: **live** (CTR direction favors B but not yet significant)

## Hypothesis

A stripped, mobile-minimalist offer page with personalisation ("Valpakademin för {hunden}") and a module-breakdown of what the course covers will convert at least as well as the rich/visual control. Hypothesis is that on mobile, removing visual noise (bonus-stack, social-proof comparison, urgency block, gold guarantee badge) and replacing it with clear modular value-prop + name personalisation reduces cognitive load and improves CTA-click and purchase rates.

Stretch: B will outperform A by 15%+ on CTA click-through.

## Variants

### A (control) - `step_1777927539583_lhvtzvnx` "Offer page"
Rich visual layout. Includes:
- Hero with large product image + "VALPAKADEMIN" badge
- "Vad du lär dig" + Marie Hedin section with story
- Before/after photo cards (Bella, Loke, Sigge)
- 4 bonuses with product imagery (Lulu's Vagga, FB group, Diplom, Ljudbok) - value 2 188 kr
- "Hur ligger Valpakademin till?" competitor comparison (87% stat)
- "Varför just nu?" urgency block
- Pricing box: 1 999 kr struck-through -> 999 kr
- 30 dagars pengarna tillbaka gold badge

Screenshot: `/tmp/ab-review/offer-A-original.png`
HTML: `data.nodes.step_1777927539583_lhvtzvnx.subEls[0].html` (~44 KB)

### B (treatment) - `step_1778588267757_offerb` "Offer page (B variant)"
Stripped minimalist layout. Includes:
- Personalised H1: "Valpakademin för {hunden_namn}"
- 997 kr price inline in hero (no struck-through anchor)
- "Vad du får / Vad du undviker / Praktiken" bullet structure
- Module breakdown: Trygg start / De 4 grunderna / Ute i världen / Framtiden
- Compact Marie Hedin section
- Before/after photo cards (Bella, Loke, Sigge - same as A)
- FAQ section
- "Specialpris 997 kr" final box (no struck-through anchor)
- 30 dagars garanti as text line (no gold badge)

Screenshot: `/tmp/ab-review/offer-B-stripped.png`
HTML: `data.nodes.step_1778588267757_offerb.subEls[0].html` (~30 KB)

### What B intentionally removes vs A

- Bonus-stack (4 bonuses + 2 188 kr value frame)
- Competitor comparison / 87% social-proof block
- Urgency / "Varför just nu?" section
- Struck-through 1 999 kr anchor pricing
- Gold-badge guarantee visual

These removals are the test, not bugs.

## Sample plan

- **Primary metric**: CTA click-through rate (cta_click event / step_view event on offer page). Chosen over purchase because volume is far higher (50-100x), enabling significance in weeks rather than months.
- **Secondary metric**: Purchase rate (quiz_sessions.purchased=true for sessions assigned to this variant)
- **Target sample**: 300 step_views per variant for CTA-CTR significance, 50 purchases per variant for purchase-rate significance
- **Significance test**: z-test for two proportions, p < 0.05 minimum
- **Expected run time**: 4-6 weeks for CTR significance, 4-6 months for purchase significance at current volume

## Started

2026-05-12

## Ended

ongoing

## Results (as of 2026-05-28)

### Primary metric: CTA click-through rate

| Variant | step_views | cta_clicks | CTR |
|---|---|---|---|
| A (rich) | 56 | 4 | **7.1%** |
| B (stripped) | 49 | 6 | **12.2%** |

- Diff: +5.1 percentage points (+72% relative lift)
- z-statistic: 0.89
- p-value: **~0.37** (NOT significant)
- Sample is 35% of target (105 of 300 needed). Direction favors B but well within noise band.

### Secondary metric: Purchase rate

| Variant | sessions assigned | purchases | rate |
|---|---|---|---|
| A | 288 | 2 | 0.69% |
| B | 307 | 1 | 0.33% |

n=3 total purchases. Cannot draw any conclusion.

### Other observations

- B has 7 `back` events vs A's 1. Could indicate confusion about whether B is actually the offer page (missing visual cues users expect) - or just longer page = more scroll-back. Watch as sample grows.
- Both variants have offer-page-reach rates affected by Test 1 (landing hook) overlap. Since Test 1 was declared 2026-05-28, the offer-reach rates will normalize from here.

### Significance check SQL

```sql
with offer_events as (
  select
    session_id,
    step_id,
    event_type
  from quiz_events
  where quiz_id = '29dd6398-51b7-46aa-8f3a-92b455d18cb7'
    and created_at >= '2026-05-12'
    and step_id in ('step_1777927539583_lhvtzvnx', 'step_1778588267757_offerb')
)
select
  case when step_id = 'step_1777927539583_lhvtzvnx' then 'A_rich' else 'B_stripped' end as variant,
  count(*) filter (where event_type = 'step_view') as step_views,
  count(*) filter (where event_type = 'cta_click') as cta_clicks_new,
  -- Backward-compat: pre-2026-05-28 CTA clicks were logged as answer/offer_cta_click
  count(*) filter (where event_type = 'answer' and option_id = 'offer_cta_click') as cta_clicks_legacy,
  count(*) filter (where event_type = 'back') as backs
from offer_events
join quiz_events qe using (session_id, step_id, event_type)
group by 1
order by 1;
```

## Decision

**Not yet shipped.** Test continues. Will revisit at one of:
- 300 step_views per variant (CTR significance check)
- 50 purchases per variant (purchase significance check)
- 2026-07-01 (calendar checkpoint - if neither threshold hit, declare on best available metric)

## Update 2026-06-05

Re-pulled at day 24. Still NOT significant - signals now conflict (classic small-sample noise):

| Variant | step_views | CTA clicks (legacy) | CTR | sessions | purchases | purch rate |
|---|---|---|---|---|---|---|
| A (rich) | 82 | 8 | 9.8% | 393 | 5 | 1.27% |
| B (stripped) | 67 | 8 | 11.9% | 428 | 2 | 0.47% |

CTR still favors B (+21%), but purchase rate now favors A. Total 7 purchases - far below threshold. z-test on CTR p > 0.3. Keep running.

**Tracking bug found + fixed 2026-06-05**: The `cta_click` event added 2026-05-28 never actually shipped - the runtime source changed in commit `aefe2ce2` but the compiled `dist/` bundle was never rebuilt, so live quiz kept serving the 2026-05-12 bundle (`p8obqWBz`). All CTA data above still comes via the legacy `answer/offer_cta_click` path. Rebuilt bundle (`BHAwBklo`) + republished 2026-06-05T07:33Z. Verified live quiz now serves the new bundle and it contains the `cta_click` logic. Going forward `cta_click` events will populate; queries should read BOTH new + legacy until enough new-path data accumulates.

## Follow-ups

- 2026-05-28: Added dedicated `cta_click` event_type in runtime (was previously logged only as `answer/offer_cta_click`). Both signals now fire in parallel - the new event is the primary path going forward, legacy field stays for historical query compat. **NOTE: did not actually ship until 2026-06-05 (bundle rebuild) - see Update above.**
- **Build gotcha for next dev**: editing `runtime/quiz-runtime/src/*` requires `cd runtime/quiz-runtime && npm run build` BEFORE republishing the quiz, or the change silently never reaches production. The publish script reads the compiled `dist/` bundle, not the source.
- After this test concludes regardless of winner, next iteration ideas:
  - Hybrid C variant: B's personalisation + module-breakdown + A's bonus-stack and pricing anchor
  - Pricing test: 997 kr (current) vs 1 497 kr with stronger anchor
  - Urgency variant: hard deadline timer vs no timer
- If B wins, remove rejected-design narrative from 2026-05-12 session journal (it biased follow-up analyses).
