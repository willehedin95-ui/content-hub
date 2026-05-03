# Funnel Professor: 3-Pillar Framework + KPI Targets

Source: The Funnel Professor newsletter, "Building, testing, iterating quiz funnels" (2026).

## Main thesis

Quiz success comes from **three pillars working together**: positioning, graduality, and personalization. Master all three and the quiz becomes "a money printer." Miss any one and you have a fancy form with a discount code.

---

## Pillar 1: Positioning

Two components, both required:

### A. Ad-to-quiz congruency

The ad and the quiz must promise the SAME thing in the SAME language. Mismatch = drop-off at the first step because user thinks "this isn't what I clicked for."

Formula: `ad-topic = quiz-topic`

Example: *"ads speaking about the gut → gut profile / gut health diagnosis"* (NOT "general health quiz").

### B. Clear completion incentive

Why should they finish? The reward must be obvious BEFORE they start.

WEAK: *"Take the 2-minute survival quiz"* (vague reward)
STRONG: *"Take the 2-minute test to find out whether you'd survive WW3"* (specific outcome revelation)

The strong version PROMISES a specific revelation. The weak version promises just "a quiz."

---

## Pillar 2: Graduality

Modeled on doctor's interrogation pattern. Start with micro-commitments, escalate to deeper personalization. Each "yes" makes the next question easier to answer.

Example sequence (energy/sleep niche):
1. *"Do you wake up feeling tired?"* (low friction, easy yes)
2. *"How often does this happen?"* (slight escalation)
3. *"Do you wish you had more energy throughout the day?"* (commitment to outcome)

The "yes-yes-yes effect" makes prospects admit problems themselves rather than being told they have problems.

---

## Pillar 3: Personalization (results page)

Use zero-party data captured in the quiz. Specific template:

- **Eyebrow:** *"Based on your results"*
- **Headline:** *"[product] is the perfect solution for {gender} between {age} that struggle with {problem}"*
- **Subhead:** *"100,000+ {gender plural} like you achieved {desired solution} within 12 weeks"*

The headline has 3 zero-party variables (gender, age, problem). The subhead has 1 (desired solution) plus a social-proof number.

---

## KPI targets (with the only-real-KPI caveat)

| KPI | Target |
|---|---|
| Q1 start rate | 50-70% |
| Quiz completion | 20-30% |
| Completion → purchase | 10%+ |

**The ONLY KPI that matters is profit.** Sub-20% completion quizzes can be highly profitable. Don't optimize metrics for their own sake.

---

## Iteration playbook

### Q1 = highest drop-off, fix it FIRST

The first question (initiation slide) determines whether prospects proceed. Once Q1 engagement increases, "other questions become substantially easier" because the user is already invested.

Implication: every optimization sprint should start by testing Q1 (positioning + opening question) before touching anything else.

### Workflow

1. Use granular per-question drop-off analytics (Funnel Professor recommends ClarFlow)
2. Identify the highest drop-off question
3. A/B test variants of THAT question
4. When that one normalizes, move to the next-worst
5. Test completion-to-purchase separately (different problem than completion itself)

### Counter-intuitive notes

- Lower completion rate doesn't mean broken quiz - if profit-positive, ignore the metric
- Some sub-20% completion quizzes "are printing"
- Optimize for incremental wins, not metric obsession

---

## Application checklist

When auditing a quiz against this framework:

- [ ] **Positioning**: Does the ad promise = quiz promise? Are they using the same word for the same thing?
- [ ] **Completion incentive**: Does the entry slide promise a SPECIFIC revelation, or a generic "quiz"?
- [ ] **Graduality**: Does Q1 require minimum cognitive load? Are subsequent questions stacking yes-commitments?
- [ ] **Personalization template**: Does the offer page use the eyebrow + 3-variable-headline + social-proof-subhead pattern?
- [ ] **KPI instrumentation**: Are Q1 start rate, completion rate, and completion-to-purchase tracked?
- [ ] **Q1 testing**: Has Q1 been A/B tested first before touching downstream questions?

---

## Doginwork-specific findings (2026-05-03)

When this framework was first applied to Maries Valpakademin quiz:

**Positioning gap identified**: Maries ads pitch the COURSE ("Valpakademin"). Quiz promises a PLAN ("personlig träningsplan"). Plan ≠ course = potential ad-to-quiz mismatch. Either ads need to pivot to "diagnosis" framing, or quiz needs to pivot to "course recommendation" framing.

**Q1 unmeasured**: Quiz analytics broken (CORS error on `/api/quiz/session`). Cannot run Q1 optimization until this is fixed. Audit v58 noted this as console error but not as analytics blocker.

**Personalization template partially applied**: Offer hero uses eyebrow + headline + variable-mirror sub. Missing the explicit "X+ others like you achieved Y within Z weeks" social-proof formulation.

**First A/B test**: Landing slide (the actual "initiation slide" before Q1 Kön). Variants test FP's "specific revelation" framing vs current "generic plan" framing.
