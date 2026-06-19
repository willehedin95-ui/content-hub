# Exodus / Genesis (Copy Coders) → Content Hub: what to steal

> Reverse-engineered 2026-06-18 from the Copy Coders "Claude Code Accelerator" workshop transcripts
> + skill-kit (the skill-kit literally documents both their APIs and the Exodus CLI). William has
> just logged into Exodus and obtained API access to all their bots.

## TL;DR

Exodus IS basically a competitor to Content Hub's ad engine - same job (turn winning ads + a brief
into new ad creatives at volume), built on Claude + KIE + Meta. Two things to do:

1. **Integrate their trained bots as an option** - we now have API access. The Genesis bots
   (`ad-hook-bot-1`, `mariobot`, etc.) are Anthropic models fine-tuned on Copy Coders' own winning-ad
   corpus. That is copywriting IP we cannot reproduce by prompting. Wire them in as a model choice in
   the concept factory.
2. **Steal the architecture, not just the prompts.** The smartest structural ideas (below) turn our
   "ask the AI for an ad" features into compounding systems.

---

## The two APIs (reverse-engineered from the skill-kit)

### Genesis API - the trained bots
- Base: `https://gas.copycoders.ai/api/v1`
- Headers: `Authorization: Bearer $GENESIS_API_KEY` + `X-Provider-Key: $ANTHROPIC_API_KEY`
  (our own Anthropic key actually runs the model - we pay the inference).
- `GET /models` → live bot roster (IDs + descriptions). **Check this live - roster changes.**
- `POST /chat/completions` with `{"model":"<bot-id>","messages":[...],"stream":true}`. `stream:true` required.
- **Stateless 2-step protocol**: every call replays the whole history.
  1. Prime: send the primer (winning ads) → bot replies "I've absorbed the patterns."
  2. Instruct: `[primer] → [confirmation] → [instruction]`.
  3. (hooks only) double-pass: 10 hooks → sharpen → 10 more = 20 total.
- Sequential per key; parallelize with multiple Anthropic keys (up to ~3 briefs at once).
- Errors: missing `X-Provider-Key`; `stream` not true; not replaying full convo.

**Bot roster (most-used):**

| Stage | Bot ID | Does | Model |
|---|---|---|---|
| Analysis | `media-buying-analysis-1` | Ads Manager CSV → spend/CPA/CTR/ROAS, star ads, budget issues | — |
| Analysis | `cash-analysisvariation-bot` | Deep read of top 5-10 ads, why they work, variation openings | — |
| Analysis | `comment-intel-1` | Ad comments → audience language, objections, buying signals | — |
| Ideation | `insight-vectors-bot` | Hidden patterns inside winners | — |
| Ideation | `75-ads-template-bot` | Winner → mad-lib template | — |
| Copy·hooks | `ad-hook-bot-1` | Hooks, 2-step + double-pass (20) | Opus |
| Copy·body | `mariobot` | 700-1500w body + headlines, same convo | Opus |
| Copy·swipe | `swiping-master-bot` | Faithful competitor swipe | — |
| Video | `infeed-vsl-bot` | In-feed VSL script | — |

### Exodus API - the done-for-you pipeline
- Base: `https://good-cod-360.convex.site` (Convex backend), `Authorization: Bearer $EXODUS_API_KEY`.
- Known endpoint: `GET /api/v2/swipe-library` → scraped competitor ads.
- Needs Anthropic + KIE (renders) + ElevenLabs (video) keys in env.
- CLI surface: `exodus primer`, `exodus genesis run --brief`, `exodus genesis --reel "<url>"`,
  `exodus image --ad "<copy>"`, `exodus image --type template`, `exodus read-doc <runId>`.
- Gotchas: long server-side runs (`--no-wait` then poll); "no documents yet" message contains the word
  "failed" (don't grep for it); Genesis VPS ~1-concurrent; KIE drops 1-2 renders/batch (429, re-fire).

**Opportunity:** `GET /api/v2/swipe-library` is a ready-made competitor-ad feed we could pull into our
swipers. And the Genesis bots are callable directly from `src/lib/` as a new generation backend.

---

## The structural ideas worth stealing (ranked by leverage)

### 1. Writer + Judge + Formatter rubric pipeline
Cheap writer model (Sonnet) drafts → stronger model (Opus) **grades against a rubric and bounces
failures back before any human sees them** → formatter → output. Only surface pre-vetted copy. Mario
wrote a 20-email sequence on ~9% of a Max plan because only the small judge burns expensive tokens.
**→ Content Hub:** insert a judge pass between the concept factory and William's review. Our Swedish hard
rules (no English words, no en/em dashes) are *perfect* binary judge criteria - currently enforced by hand.

### 2. Standards Ladder + after-session capture loop
Taste → Note → Rule → Tool → Skill. Every time William rejects/edits a concept, bank *why* as a rule the
generator reads every run; when the rule is binary, auto-build a lint that enforces it 100%.
**→ Content Hub:** a per-workspace `rules.md`/rubric the concept factory reads; a "promote to rule" path on
reject; an after-session job that appends banked dos/don'ts. This is what makes #1 self-improving.

### 3. CASH concept model (the spine of the factory)
`Creative Diversity = Concepts × Angles × Styles × Hooks` - four independent libraries multiplied, with a
sampler. (190×55×29 ≈ 300k ideas.) Decompose every swiped winner into `{concept, angle, style, hook}`
("DNA tagging") and write each part back into the libraries.
**→ Content Hub:** replace the flat concept list with four tables + a sampler; add a DNA-tagger to the swiper.

### 4. Primer = winning-ads-only, per workspace + fixed gate order
Feed 8-12 **full winning ads as examples**, NOT a brand/persona info-dump ("the primer is your taste,
written down"). Generation gate is fixed: **hooks first (×2-3, double-pass) → body (2-4 parallel variants)
→ headlines from finished bodies**. Generate-N-then-select, never one-shot. Auto-add every new winner.
**→ Content Hub:** primer per workspace from our Meta winners; enforce hooks→body→headlines; the
"examples > descriptions" rule argues *against* stuffing prompts with brand-context.

### 5. Strategy / Coverage map (the missing primitive)
A segment × awareness grid; overlay existing ads; empty cells = blue-ocean gaps, ranked by "chad logic"
(gap size · urgency · TAM · competitors · zeitgeist). Segment = Outcome × Demographic/Condition × Belief.
**→ Content Hub:** a coverage view that aims the concept factory at untargeted segments using our ad history.

### 6. Vector Expansion (iterate on winning images)
Decompose a winning image into ranked vectors (feature list), generate N variants along the strongest
ones, dial intensity, stack vectors. ~20% hit rate is normal → generate 5×.
**→ Content Hub:** on winner ingestion, extract a ranked vector list; feed the before/after + UGC generators.

### 7. Pre-generation prompt lint (kills our recurring image failures)
Mario lints animation/image prompts *before* spending a generation call. **→ Content Hub:** a Nano-Banana
prompt validator that blocks before render unless: bottle correct (white, "HYDRO13"), glass 30ml not a
shot glass, liquid golden, **all visible text Swedish**, no ice/nature. Stops the exact failures in memory.

### 8. CASHED variation taxonomy + CAST video matrix
**CASHED** (iterate a winner by turning exactly one knob: Concept/Angle/Style/Hook/Edit/Demographic;
D+S = reach knobs, C/A/H/E = conversion knobs). **CAST** video = Conceit × Actor × Style × Terrain.
**→ Content Hub:** a structured "iterate on a winner" generator + a video-variant knob-picker.

---

## Encodable copywriting rubrics (drop-in as judge prompts / lints)

- **Anti-AI slop banned words:** hurdles, harnessing, unveil, realm, delve, dive in, embark, navigate,
  tapestry, craft, dazzle, evoke, transform, profound, game-changing, insights, synergy, leverage. Banned
  structures: "This isn't X, it's Y", three-part lists, However/Moreover/Furthermore/Additionally.
- **Hook quality (all must hit):** 10-20 words before fold · tangible/specific · unresolved curiosity ·
  reads like news not an ad · Level-3 emotional viciousness ("flinch, gasp, or feel called out").
  Techniques: Transfer / Reframe / Promote ("it's not low T, it's high cortisol").
- **Anti-Sycophancy judge** (full prompt in skill-kit) - drop-in skeptical LLM critic for ad-copy QA.
- **CRAVES** (strengthen a block): Clear · Relevant · Accurate · Visual · Expressive · Specific.
- **13 Reptile Triggers** (concept classifier): Ultra-Real, Bizarre, Voyeur, Suffering, Gory, Sexual,
  Primal-Fear, Inside-Joke, Old/Vintage, Visceral-Positive, Selfie, Uncanny-Object, Wildcard.
- **RMBC** (Research → Mechanism → Brief → Copy): shared `{research, mechanism, brief}` object all
  generators consume instead of free-writing. Mechanism 4-line: other solutions fail because [wrong
  reason] → you need [X] → proof [study] → our product does [X].
- **Zebra Ads** (4 selectable ad modes): Emotional-story / Topical-news / Curiosity / Contrarian.
- **Advertorial** body-flow + 4 types (ecom-disruptor / story / social-proof / listicle / comparison).
- **7 Elements of Addictive Copy** (ranked critic, fix high-leverage first): Curiosity → Vivid pain →
  Vivid benefits → Credibility/proof → Specificity → Even-if/without → warmth.

---

## Media-buyer numeric rules (independently confirm our memory)
- Kill rule: spend **3× target CPA over 4-7 days** before judging; relaunch killed ads (bad audience pocket).
- **80% budget on winners / 20% testing.** Creative volume scales with spend, not constant.
- **Turn OFF Meta "recommended enhancements"** (all 4 buyers agreed → confirms `meta-auto-applies-enhancements.md`).
- **Verify tracking before scaling**, don't trust in-platform data (confirms `feedback_verify_meta_metrics_against_db.md`).

---

## Next steps
1. Enumerate the **live** Genesis roster (`GET /models`) + test one bot end-to-end with William's keys.
2. Confirm Exodus endpoints via the live app (Chrome network inspection) - look for undocumented endpoints
   beyond `/api/v2/swipe-library`.
3. Decide build order. Highest ROI first: (a) Genesis bots as a concept-factory backend, (b) Writer+Judge
   rubric pipeline with our Swedish lints, (c) CASH four-table model + DNA-tagger on the swiper.
