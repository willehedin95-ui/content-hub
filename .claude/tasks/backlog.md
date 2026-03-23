# Content Hub — Task Backlog
Updated: 2026-03-22

## Tier 1 — Revenue & Automation
(all completed)

## Tier 2 — Builder & UX Quality
- [x] ~~**Autosave race condition**~~ — Fixed in commit `f382c9b`. (done 2026-03-22)
- [ ] **Tune translation quality review prompt** — monitor Claude Haiku review results for false positives/negatives. Adjust strictness if needed. (added 2026-03-22)

## Tier 3 — Housekeeping
- [ ] **Storage cleanup tool** — UI to browse/delete old image-jobs (2.5 GB of 3.4 GB total storage). (added 2026-03-10)
- [ ] **Drop `app_settings` table** — fully migrated to `workspaces.settings`, only 2 legacy fallback references left. (added 2026-03-12)
- [ ] **Clean up dead code in shopify.ts** — `getConversionsForTest()` is no longer imported anywhere. (added 2026-03-12)
- [ ] **Replace raw `<img>` with `next/Image`** — 4 locations: images/page.tsx, MorningBriefClient.tsx, ImportProgressPanel.tsx, ImageSwiper.tsx. (added 2026-03-12)
- [ ] **Lazy-load brainstorm tab content** — dynamic imports for HooksContent/LearningsContent to reduce brainstorm bundle. (added 2026-03-12)
- [ ] **Cron workspace iteration** — daily-snapshot still uses env vars for Meta. Low priority (shared Meta account). (added 2026-03-12)
- [ ] **Configure Doginwork workspace** — add products, set up Meta Ad Account when mom is ready. (added 2026-03-12)

## Tier 4 — Big Future Features
- [ ] **Animated Ads Pipeline** — Franky Shaw-style: brainstorm → NanoBananaPro images → Kling 3.0 transitions → ElevenLabs voiceover → Suno music. ~$9-10/ad. Design+plan ready. (added 2026-03-08)
- [ ] **Section templates / blocks** — quick-insert pre-built landing page sections into builder. (added 2026-03-10)
- [ ] **Element dimensions tooltip** — show W×H on hover in builder canvas. (added 2026-03-10)
- [ ] Page builder: upgrade from `document.execCommand()` to Selection/Range API for rich text. (added 2026-03-10)
- [ ] Page builder: multi-select alignment toolbar (flexbox align/distribute selected elements). (added 2026-03-10)
- [ ] **Gemini Embedding 2 integration** — multimodal embeddings for ad/page similarity search, concept clustering, semantic analysis. (added 2026-03-12)
- [ ] **Auto-scheduling** — AI picks optimal publish time based on historical performance. (added 2025-02-25)
- [ ] **Google Ads integration** — second ad platform. (added 2025-02-25)

## Done (recent)
- [x] **One-Click Ad Pipeline** — Auto-generate images + auto-assign landing page on concept creation. Inline approve in brainstorm UI. 48h translation auto-approve. Activity Feed pending actions. Commit `6aa852f`. (done 2026-03-22)
- [x] **Per-breakpoint responsive styles** — All 9 design controls now write @media (max-width: 768px) rules when editing in mobile viewMode. `data-cc-rid` per-element selectors, `<style data-cc-responsive>` tag, re-hydration on load. (done 2026-03-22)
- [x] **Hover label layout thrashing** — mouseover handler now batches `getBoundingClientRect()` + label positioning via `requestAnimationFrame`. (done 2026-03-22)
- [x] **Video generation parallel** — ImportProgressPanel now runs all videos concurrently via `Promise.allSettled` instead of sequential for-loop. (done 2026-03-22)
- [x] **Image generation partial retry** — Each failed image retries up to 2x before marking error. "Retrying..." status in UI. `Promise.allSettled` for worker pool. (done 2026-03-22)
- [x] **Landing Page Recommender** — API at `/api/pages/recommendations` aggregates 30-day concept_metrics per page. Modal shows ROAS, conversions, concept count badges. Top pick badge. Sorted by performance. (done 2026-03-22)
- [x] **Tune Strategy Guide thresholds** — `PROFITABLE_ROAS_MULTIPLIER` 1.3→1.2, `MAX_AVG_AGE_DAYS` 21→14 based on real ad set data analysis. (done 2026-03-22)
- [x] **Discovered ads browser UI** — Already existed at `/ad-spy?tab=discovered` with DiscoveredFeed.tsx. (done 2026-03-22)
- [x] **Launch Pad budget reduction button** — "Reduce to X SEK" button in cold start warning. New `reduce_budget` + `increase_budget` actions in morning-brief API. (done 2026-03-22)
- [x] **Verify Instagram delivery** — Confirmed via Meta API placement breakdown: ~8.6% of spend on Instagram with purchases. (done 2026-03-22)
- [x] **Clean up duplicate Meta ad sets** — Archived 61 duplicate ad sets (60 dupes + 1 test). 23 were actively spending. (done 2026-03-22)
- [x] **Translation quality gate with auto-retry** — Claude Haiku native reader review replaces GPT-4o. Auto-retries 3x. Blocks launchpad+push on failure. Telegram approve/hold. Commit `bbd1b63`. (done 2026-03-22)
- [x] **Narrative archetypes for ad copy** — 4 story-driven frameworks (Confession, Rage, Double Standard, Witness) embedded in brainstorm system prompts. UI selector + autopilot integration. Commit `d0ab2db`. (done 2026-03-22)
- [x] **Cron fixes + merged daily digest + video albums** — concept_metrics derived from meta_ad_performance. daily-snapshot cookie bug fixed. Morning brief + autopilot-execute merged into single digest. Commit `608a182`. (done 2026-03-22)
- [x] **Activity Feed + auto-iterate + Telegram improvements** — Replaced Daily Actions with Activity Feed. Auto-iterate fatiguing concepts. Telegram album notifications. Commit `fa70b3c`. (done 2026-03-22)
- [x] **A/B test grouping by page pair** — Grouped by (page_a_id, page_b_id) with aggregated metrics + per-concept breakdown. Commit `03fd067`. (done 2026-03-20)
- [x] **Non-DCO + PAC placement routing** — 4:5→feed, 9:16→stories/reels. Instagram enabled. Commits `668560c`, `7e2542c`. (done 2026-03-20)
- [x] **Launch Pad cold start mode** — Push 5 concepts, 7-day cooldown, blue/purple/green cards. Commit `456267b`. (done 2026-03-19)
- [x] **Video Ad Swiper + Manual Upload** — Gemini 2.5 Pro + Claude pipeline. Commits `5477b85`, `90ccf65`. (done 2026-03-19)
- [x] **Concepts card grid + re-roll UX + processing poll** — Card grid, hover re-roll, after() polling fix. Commit `4d28b94`. (done 2026-03-19)
- [x] **Concept detail redesign + Meta placement fix** — Collapsible sections, PAC routing. Commit `7eea009`. (done 2026-03-19)
- [x] **Phase 1 Pipeline Unblock** — Finish & Queue, relaxed scoring, default Page B. Commit `3d1e466`. (done 2026-03-19)
- [x] **Builder save bug fix** — `updated_at` column bug, error transparency. Commits `db2a50f`→`85141fb`. (done 2026-03-18)
