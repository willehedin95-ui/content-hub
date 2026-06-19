# Exodus / Genesis → Content Hub: Master Implementation Plan

> Built overnight 2026-06-18 while William slept. Sources: the full Copy Coders "Claude Code
> Accelerator" workshop corpus (transcripts + skill-kit), the **live** Genesis API (validated with
> William's key), the Genesis reference skill (security-audited, clean), and a full source-code map of
> Content Hub. Companion files: [`exodus-genesis-reverse-engineering.md`](./exodus-genesis-reverse-engineering.md)
> (the system) and [`genesis-bot-roster.md`](./genesis-bot-roster.md) (all 146 bots).

---

## 0. The one blocker (decision needed)

I validated the entire Genesis integration end-to-end **except live output**, because the
`ANTHROPIC_API_KEY` in `content-hub/.env.local` is **invalid** - it's rejected directly by Anthropic
(`GET /v1/models` → `authentication_error`), not just by Genesis. It's a stale/rotated local key (your
live key is presumably only in Vercel prod). Genesis needs a working **provider key** because *you* pay
for the model run (Genesis only injects the trained system prompt).

**Decision for the morning - pick the provider key:**
- **Option A - Anthropic key** (`sk-ant-api03-…`): use your real one (from Vercel prod or a fresh one at console.anthropic.com). Genesis bots run on `claude-opus-4-6` / `sonnet-4-6`, so an Anthropic key works natively.
- **Option B - OpenRouter key** (`sk-or-…`): Copy Coders' recommended path ("add $10-20 credits"). Set `GENESIS_PROVIDER_KEY=sk-or-…`. Keeps Genesis spend separate from content-hub's Anthropic billing.

Once one valid key is in `.env.local`, everything below is unblocked and I can run live bot tests + wire in the first integration in one session.

---

## 1. What Exodus/Genesis actually is (and why it matters to us)

Two products, one login (your account shows **Rasmus Hedin**):

- **Genesis** = an **OpenAI-compatible API serving 146 trained bots** (`gas.copycoders.ai/api/v1`). Each bot is an Anthropic model (mostly Opus 4.6 / Sonnet 4.6) carrying a **server-side system prompt** that encodes Copy Coders' copywriting IP. You can't see the prompt - you send user messages, the bot does the rest. **This is the part we cannot reproduce by prompting**, and it's the real asset.
- **Exodus** = a done-for-you **CLI + dashboard** (`xo.copycoders.ai`, Convex backend `good-cod-360.convex.site`) that orchestrates those bots into the full creative-strategy flywheel (primers → briefs → hooks → body → statics). It's essentially **a competitor to Content Hub's ad engine**, but CLI-driven and single-operator.

**Strategic read:** We don't need to adopt Exodus. We need (a) to call the **146 Genesis bots** from inside Content Hub as a premium generation backend, and (b) to steal Exodus's **architecture** (the ideas that make it compounding rather than one-shot). Content Hub already has the harder pieces Exodus lacks: live Meta integration, multi-workspace, bleeder-guards, the pipeline lifecycle, deployment.

### The integration contract (validated tonight)
- `GET /models` (+ `?category=…`) → live roster. **Never hardcode slugs.**
- `POST /chat/completions` `{ "model": "<bot-slug>", "messages": [{role:"user",...}], "stream": false }`
- Headers: `Authorization: Bearer $GENESIS_API_KEY`, `X-Provider-Key: <provider key>`, `Content-Type: application/json`.
- **`system` messages are dropped** - pass all context in user/assistant turns. Chain bots by feeding one bot's output as the next bot's user message.
- `stream:false` returns `choices[0].message.content` (use this server-side - no SSE parsing). `stream:true` is OpenAI SSE (`choices[].delta.content`).
- **Limits: 1 concurrent stream per key, 60 req/min per key.** Sequential per key; parallelize with multiple provider keys. Errors: 400 missing provider key, 401 bad Genesis key, 404 bad slug, 429 rate/concurrency, 500 bad/over-quota provider key.

---

## 2. The 146 bots that matter most (mapped to Content Hub features)

Full list in [`genesis-bot-roster.md`](./genesis-bot-roster.md). The high-value picks per pipeline:

| Content Hub feature | Genesis bots to call | Note |
|---|---|---|
| **Ad body copy** (`brainstorm/route.ts`) | `mariobot`, `mario-bot-`, `write-like-luke-bot`, `infinite-adcbwriter-bot`, `narrative-bot`, `marcio-narrative-ads-bot-` | Opus-grade, trained on winning ads |
| **Hooks / headlines** | `ad-hook-bot-1` (Opus), `headline-bot-`, `new-hook-bot`, `click-drivers-aem` | feed the hook stage before body |
| **Static image PROMPTS** (`static-ad-prompt.ts`, `swipe-competitor.ts`) | `universal-static-idea-generator`, `product-breakdown-static-generator`, `carousel-static-ads`, `static-ad-sign`, `1.1-image-gen`, `hero-bot-`, `meme-style-ad-concept-generator-bot`, `branded-ads-image-prompt-generator`, `reptile-triggers`, `unaware-static-image-ads-bot` | **45 Image-Prompt bots** - our biggest single alignment; they output the prompt that feeds KIE/Nano-Banana |
| **Native-ad transformers** (before/after + UGC) | `commentreview-transformer-bot-`, `handwrittennote-transformer-bot-`, `screenshotchatnotification-transformer-bot`, `breakingauthority-transformer-bot-` | turn copy/comments into native static concepts |
| **Landing pages / funnels** (page builder, advertorials) | `advertorial-architect`, `advertorial-bot`, `the-listicle-lab-master-bot`, `caveman-page-master-bot`, `hybrid-pdp-master-bot`, `proof-page-master-bot`, `bridge-page-bot`, `checkout-page-bot`, `quiz-bot-master-bot` | maps to Page Builder + quiz funnels |
| **VSL / video scripts** (video pipeline) | `microvsl`, `microscript`, `vsl-bot`, `direct-response-talking-head-script-bot-`, `video-adscript-bot`, `video-brief-bot`, `unhinged-ad-bot-` | for the video-UGC + pixar pipelines |
| **Research / buyer** (`research-context.ts`, learnings) | `build-a-buyer-elite-`, `copy-blocks-extract`, `pain-matrix-core-wound-bot-copy`, `social-proof-deep-research-bot`, `market-analyzer-bot` | feed `buildResearchContext` / segments |
| **Strategy / segments** (`strategy-engine.ts`, coverage map) | `storm-bot`, `segment-surgeon-bot`, `strategic-allocation-bot`, `belief-analyst-bot`, `belief-alchemist-bot`, `outcome-engineer-` | power a coverage/gap planner |
| **Swipe DNA-tagging** (swiper → CASH) | `ad-tagging-bot-`, `cash-analysisvariation-bot`, `insight-vectors-bot` | decompose a swipe into concept/angle/style/hook |
| **Upsell / email** (future) | `upsell-bot`, `downsell-bot`, `universal-email-bot`, `subject-line-bot`, `promo-bot` | post-purchase + lifecycle |

---

## 3. Where Content Hub stands today (from the source map)

Verified facts that shape the plan:
- **No shared LLM client** - every call site does `new Anthropic({apiKey})` inline. Models in `src/lib/constants.ts` (`CLAUDE_MODEL=claude-sonnet-4-5`, `OPENAI_MODEL=gpt-5.2`, `KIE_MODEL=nano-banana-2`). → A new `src/lib/genesis.ts` client slots in cleanly as a parallel backend.
- **Generation is one-shot** ("ask the AI for ads"). The single `client.messages.create` calls are at `src/app/api/brainstorm/route.ts:715` (standard), `:200` (from-competitor vision), and `src/lib/swipe-competitor.ts:204`. **No writer→judge loop, no pre-publish quality gate.**
- **CASH already half-exists**: the central concept record is `image_jobs` with a `cash_dna` JSONB column. `brainstorm.ts` (1962 lines) already embeds the CASH framework, Copy Blocks, STORMING, reptile triggers as prompt strings - but as a monolithic one-shot, not as composable stages.
- **A feedback loop already exists**: `concept_learnings` (win/loss by angle/awareness/style), written by `generateConceptLearning` (`pipeline.ts:2081`, Haiku) and read back by `buildLearningsContext` (`brainstorm.ts:593`). This is the seed for the Standards-Ladder idea.
- **A judge already exists but isn't wired into generation**: `src/lib/meta-compliance.ts` returns `{verdict: PASS|WARNING|REJECT, issues[]}` - a Claude rubric judge - but it's only called manually from the compliance-check route. **Generalizing this is our writer→judge layer.**
- **No prompt-lint anywhere** (`grep lint|validatePrompt` = 0). Product-visual rules live only in `src/lib/product-appearance.ts` (`getProductAppearance`) and are *hoped* honored - this is exactly why the Hydro13 shot-glass / English-text image failures recur.
- **No per-brand design system** in the Page Builder (pages are raw HTML strings; template colors hardcoded). Brand context is fragmented across 3 unwired stores: `getProductAppearance` (images), `PRODUCT_URLS`/`getCompetitorProducts` (blog), `product-angles.ts` (swiper).

---

## 4. The build plan (phased, by ROI ÷ effort)

### Phase 0 - Unblock + Genesis client (½ day)
1. Add a valid provider key to `.env.local` (§0).
2. **`src/lib/genesis.ts`** - the client. Functions:
   - `listGenesisBots(category?)` → cached `GET /models`.
   - `callGenesisBot(slug, messages, {temperature, maxTokens})` → `stream:false` POST, returns `content`. Handle 429 (retry w/ backoff, respect `Retry-After`), enforce 1-concurrent-per-key via a simple mutex/queue.
   - `chainGenesisBots([{slug,buildInput}])` → sequential chain helper.
   - Keys from `process.env.GENESIS_API_KEY` + `GENESIS_PROVIDER_KEY || ANTHROPIC_API_KEY`.
3. Live smoke test: run `build-a-buyer-elite-` → `ad-hook-bot-1` → `mariobot` on a Hydro13 brief; confirm output quality vs our current Sonnet output.

### Phase 1 - Genesis as a generation backend (highest ROI) (2-3 days)
A per-workspace **toggle**: `generation_backend = "native" | "genesis"`, stored in `pipeline_settings` or `workspaces.settings`.
- **Hooks/body**: in `brainstorm/route.ts`, when backend=genesis, replace the `:715` call with a chain: hooks (`ad-hook-bot-1`, double-pass for 20) → body (`mariobot`) → headlines. Keep `parseConceptProposals` as the output contract (have a thin adapter map Genesis prose → our `proposals[]` shape, or add a `formatter` step).
- **Static image prompts**: in `static-ad-prompt.ts` `generateImageBriefs`, optionally source briefs from the Image-Prompt bots (`universal-static-idea-generator` etc.) instead of our inline Sonnet prompt - they're purpose-trained and we have 45 of them. Still pass output through `getProductAppearance` + the new lint (Phase 2).
- **Swipe**: in `swipe-competitor.ts`, add a path that calls `ad-tagging-bot-` to DNA-tag the competitor ad, then a matching Image-Prompt bot to regenerate - richer than our single vision call.
- Keep native as default until live A/B shows Genesis wins; log both to `usage_logs` for comparison.

### Phase 2 - Pre-generation prompt lint (cheap, kills recurring failures) (1 day)
**`src/lib/prompt-lint.ts`** → `lintImagePrompt(prompt, {productSlug, language})`:
- Parse stringified-JSON prompts (our native/messy styles emit JSON).
- Assert `getProductAppearance` rules per product (flag "amber"/"glass bottle"/"shot glass"/"drinking glass" for hydro13; flag bare-foam for happysleep).
- Flag English tokens (COLLAGEN/HYALURONIC/BEFORE/AFTER) when `language !== "en"`.
- Return `{pass, violations[]}`; on fail, auto-rewrite via one cheap Claude/Genesis pass, re-lint, then render.
Wire **before every KIE render**: `generate-static-images.ts:~152`, `static-ad-prompt.ts` `parseBriefs:874`, `swipe-competitor.ts buildFullPrompt:549`, `before-after/route.ts:855`, and a context-free safety net in `kie.ts createImageTask:38`. Also inject `getProductAppearance` into the **video** path (`video-brainstorm.ts loadVideoUgcContext:407`) - currently a gap.
This is the Standards-Ladder "Tool" rung: binary, recurring, currently manual.

### Phase 3 - Writer→Judge rubric layer (turns one-shot into vetted) (2-3 days)
Generalize `meta-compliance.ts` into **`src/lib/creative-judge.ts`** → `judgeConcept(concept, {rubric})` returning `{score, verdict, issues[]}`.
- Rubric = the encodable rubrics from the transcripts (anti-AI-slop banned words, hook-quality 11-point checklist, 7-Elements ranked critic, **+ the Swedish hard rules** as binary criteria). Seed scoring criteria from `concept_learnings` (data-driven).
- Use a strong judge model (Opus, or a Genesis judge bot) over a cheap writer; bounce fails back to regenerate before persistence.
- **Insert points**: `brainstorm/route.ts` after `parseConceptProposals:739` and before `done:777`; for swipes, `swipe-competitor.ts` after parse (~`:345`) **before** the `image_jobs` insert + KIE spend (highest-leverage gate - image gen is the cost).
- Stream judge/iterate steps through the existing NDJSON progress channel.

### Phase 4 - CASH coverage map + Standards-Ladder loop (compounding) (3-5 days)
- **Formalize CASH**: turn `cash_dna` into four queryable libraries (Concepts/Angles/Styles/Hooks) + a sampler. Add a **DNA-tagger** (`ad-tagging-bot-`) on every swipe so winners become modular parts.
- **Coverage map**: a segment × awareness grid view overlaying existing ads (we have the history), flagging untargeted cells, ranked by "chad logic". Powered by `segment-surgeon-bot` / `strategic-allocation-bot`. This is the missing primitive that *aims* the concept factory.
- **Standards-Ladder loop**: on every reject/edit from William, bank the *why* into a per-workspace rules file the generator reads (extend `concept_learnings`); when a rule is binary, auto-promote it to a `prompt-lint` rule. An after-session job appends banked dos/don'ts. This makes Phases 1-3 self-improving rather than static.

### Phase 5 - Per-brand design.md + landing-page bots (parallelizable) (2-3 days)
- One **per-brand `design.md`** (new table or `workspaces.settings`) unifying the 3 brand-context stores. Inject into `builder/ai-edit/route.ts:18` system prompt, blog `buildWriterSystemPrompt`, quiz `buildAdaptSystemPrompt`, and image `getProductAppearance`.
- Route landing-page / advertorial generation through `advertorial-architect`, `the-listicle-lab-master-bot`, `caveman-page-master-bot`, `proof-page-master-bot` for on-brand, trained funnel copy.

---

## 5. Risks & guardrails
- **Genesis dependency/cost**: bots run on *our* provider key (we pay per call) + Genesis access fee. Keep native generation as fallback; cache aggressively; respect the 60/min + 1-concurrent limits (build the queue in `genesis.ts`).
- **Output contract drift**: Genesis returns prose, not our JSON `proposals[]`. Need an adapter/formatter step - don't let it break `parseConceptProposals` validation, `sanitizePrices`, or the price tripwire.
- **Don't bypass existing guards**: the bleeder-guards, `meta-auto-applies-enhancements` (keep enhancements OFF), and the verify-metrics-against-DB rule all stay. The media-buyer numeric rules from the workshop *independently confirmed* these - don't regress them.
- **Account**: Genesis/Exodus is on Rasmus's login - fine (shared SB/Renew business), just noting whose key is billed.
- **Exodus CLI / convex API**: NOT touched tonight (would require handling the `EXODUS_API_KEY` + running their code). If you want their swipe-library feed (`GET /api/v2/swipe-library`) or a static audit of the CLI package, say so and I'll do it with your OK.

---

## 6. Recommended first session when you wake up
1. Drop a valid provider key in `.env.local` (Anthropic prod key or a new OpenRouter key).
2. I build `src/lib/genesis.ts` + run a live `build-a-buyer → hooks → mariobot` chain on Hydro13 so you can *see* the trained-bot output next to our current output.
3. If the quality gap is real (I expect it is for hooks/body), we ship **Phase 1** (Genesis backend toggle) + **Phase 2** (prompt lint) first - biggest, fastest wins.

Everything above is grounded in real source (file:line) and the live API - not the transcripts alone. Ready to execute on your word.
