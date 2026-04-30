# Post-Quiz Email Retargeting

Quiz funnels generate the highest-quality zero-party data in DTC. Every answer is first-person testimony — pain, goal, demographic, behavior — that an email platform like Klaviyo can segment and merge-tag against. Brands report email revenue lifts of 200%+ when post-quiz flows reference quiz answers directly.

This document is the playbook.

---

## The core mechanic

A quiz captures answers + email. Those answers flow into Klaviyo (or equivalent ESP) as profile properties. You then:

1. **Segment** by quiz answer (back-pain vs neck-pain, weight-loss vs strength, etc.)
2. **Merge-tag** answers into email copy (`{{age}}`, `{{primary_pain}}`, `{{desired_outcome}}`)
3. **Sequence** different content per segment so the message matches the user's exact problem

Generic post-quiz email: "Here's our product." Conversion: meh.
Personalized post-quiz email: "The fastest path for women {{age}} who struggle with {{primary_pain}}." Conversion: dramatically higher.

---

## Connecting the quiz to Klaviyo

### 1. Capture the email

Add an email-input node in the quiz. Frame it as "Where should we send your personalized results?" — not "Give us your email." Endowed-progress effect: by this point users have invested 3-5 minutes earning their result, so email opt-in feels like the natural reward, not a tax.

### 2. Wire answers to Klaviyo profile properties

Every quiz answer should map to a profile property on the Klaviyo record. Examples:

- `quiz_age_bracket` = "30-39"
- `quiz_primary_pain` = "biting"
- `quiz_dog_breed_cluster` = "labrador"
- `quiz_severity` = "high"
- `quiz_completion_date` = "2026-04-28"
- `quiz_completed` = true

These properties become the basis for both segmentation and merge tags.

### 3. Trigger a segment-aware welcome flow

The email flow that fires on quiz completion should branch on the answers, not be a single linear sequence. Use Klaviyo's conditional splits (or your ESP's equivalent) to send different content per segment.

---

## Segmentation patterns

### Pattern A: Pain-based segments

Different pains need different emails. Don't merge them.

Example for puppy training:
- Segment 1: `quiz_primary_pain = leash_pulling` → emails about leash drag, calm walking
- Segment 2: `quiz_primary_pain = biting` → emails about bite-period, recovery stories
- Segment 3: `quiz_primary_pain = potty_regression` → emails about potty regression, real-house management

Each segment gets a 3-7 email sequence laser-focused on that pain. Same product at the end, but the path getting there is custom.

### Pattern B: Goal-based segments

When the quiz captures aspirational answers (the "what do you want?" question), segment by goal-cluster. Useful when one product serves multiple goals.

Example: a sleep supplement
- "Fall asleep faster" → emails about sleep onset, racing thoughts
- "Stay asleep through the night" → emails about wake-ups, deep sleep architecture
- "Wake up refreshed" → emails about morning energy, REM quality

### Pattern C: Severity-based segments

Use quiz severity ratings to route low-severity vs high-severity differently.

- Low severity → educational content, lower-priced entry product, longer nurture
- High severity → faster pitch, urgency around action, premium tier

### Pattern D: Demographic-cross-pain segments

Stack two profile properties for the highest specificity. Examples:
- Women 40+ with weight-loss goal → menopause-aware messaging
- First-time dog owners with biting pain → "you're not failing, this is normal" messaging
- Hair type curly + severity high → product variant that suits curly hair

The more specific the segment, the higher the conversion of that segment, even though the segment is smaller.

---

## Merge-tagging quiz answers into email copy

Subject lines and headlines that reference the user's actual answers feel like a personal note from the brand.

### Subject line patterns

- `The fastest fix for {{age}}-year-olds with {{primary_pain}}`
- `{{first_name}}, your {{breed}} sounds exactly like Mervi's first dog`
- `Why "more training" isn't working for your {{primary_pain}}`
- `{{first_name}}, your assessment is ready`

### Headline patterns

- `The perfect plan for women {{age}} who want to {{desired_outcome}}`
- `Here's how 20,000+ owners with {{breed}}-type dogs solved {{primary_pain}}`
- `Based on your quiz: a {{duration}}-week protocol tailored to your situation`

### Body patterns

Reference the specific symptoms or pains the user selected:

> Hi {{first_name}}, you mentioned that {{primary_pain}} has been the hardest part. That's the most common pain we see in {{age}}-year-old owners with {{breed_cluster}} dogs. Here's exactly what we recommend...

The user reads this and thinks "the brand actually paid attention." That feeling alone bumps open rates and click rates measurably.

---

## Recommended sequences per segment

### The 3-email post-quiz sequence (minimum viable)

**Email 1 (immediately):** "Here are your results" — repeat the personalized diagnosis from the quiz, drop the offer link.

**Email 2 (24 hours later):** Story-based proof — testimonial from someone matching their segment ("Anna, also a {{age}}-year-old with {{primary_pain}}, here's what changed for her"). Soft CTA.

**Email 3 (72 hours later):** Last-call urgency — "Your quiz-completer discount expires in 24 hours." Hard CTA.

### The 7-email sequence (for higher-consideration products)

Add these between emails 2 and 3:

- Email 3: Objection-handling email tied to the user's specific objection (price, time, "I've tried everything")
- Email 4: Mechanism deep-dive — why your product solves THEIR specific pain
- Email 5: Live success story matching their demographic
- Email 6: FAQ specific to their segment
- Email 7: Final urgency

### Post-purchase sequences

Once they buy, KEEP using the quiz answers for upsells and cross-sells.

> "{{first_name}}, you mentioned {{secondary_pain}} on your quiz. That's exactly what our [companion product] addresses. Most users add it after 30 days — here's why..."

The merge-tagged callback to a quiz answer they barely remember giving feels like high-end concierge service. Massive upsell lift.

---

## What to avoid

- **Don't ignore the quiz answers.** Sending the same generic welcome email to every quiz-completer wastes the most expensive lead-data you'll ever collect.
- **Don't over-personalize creepily.** Referencing 6 quiz answers in one paragraph reads like surveillance. Pick 1-2 strongest answers per email.
- **Don't merge-tag without fallbacks.** If `{{primary_pain}}` is null, the email shouldn't say "your problem with ." Always set a default in your ESP (e.g. fallback to "puppy training" or omit the sentence entirely).
- **Don't treat quiz-completers as one segment.** That's the single biggest revenue leak. Branch the flow.

---

## Reported lift

DTC_Quizbuilder reports +243% email revenue after switching from a generic post-quiz flow to segmented + merge-tagged sequences. The mechanic is simple but most brands collect quiz data and then never use it.

Quiz answers are the cheapest segmentation data on the planet. Use them.
