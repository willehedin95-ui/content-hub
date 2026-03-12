# Content Hub — Task Backlog
Updated: 2026-03-12 (cleanup session)

## P0 — Blockers
(none)

## P1 — Do Next
- [ ] **Push to deploy** — 4 commits on main (up to `ec44fd4`), not pushed. After push: verify sidebar restructure, merged tabs, old URL redirects all work correctly
- [ ] Live-test competitor swipe end-to-end: import real page → generate images/videos → apply → publish (added 2026-03-09, updated 2026-03-10)
- [ ] Push iteration images to existing Meta ad set — add new batch ads to existing ad set instead of creating new one (added 2026-03-04)
- [ ] Market-specific iterations — generate only for the flagged market when Daily Actions suggests iterate for e.g. NO (added 2026-03-04)
- [ ] Test template brainstorm mode end-to-end (added 2026-02-28)

## P2 — Important
- [ ] **Replace raw `<img>` with `next/Image`** — key locations: images/page.tsx:471, MorningBriefClient.tsx:496, ImportProgressPanel.tsx:850-866, ImageSwiper.tsx. Skip builder canvas. (added 2026-03-12)
- [ ] **Tune Strategy Guide thresholds** — after seeing real data, adjust constants in strategy-engine.ts (BUDGET_COOLDOWN_DAYS, MIN_BUDGET_PER_ADSET, etc.) (added 2026-03-11)
- [ ] **Per-breakpoint responsive styles** — mobile vs desktop style editing via media queries (viewMode toggle exists, needs to write @media rules) (added 2026-03-10)
- [ ] Landing Page Recommender — data-driven page selection (added 2025-02-25)
- [ ] Telegram notifications — Hub messages when concepts ready for review (added 2025-02-25)

## P2.5 — Meta Ads Automation (new initiative, 2026-03-03)
Inspired by: Cody Schneider's testing framework, Matt Berman's Meta Ads Copilot (OpenClaw)

### Phase 1-4: All complete (see Done section)

## P3 — Backlog
- [ ] **Animated Ads Pipeline** — Franky Shaw-style animated ad generation: brainstorm → 18 NanoBananaPro images → 9 Kling 3.0 video transitions → ElevenLabs voiceover → Suno music → download for CapCut editing. ~$9-10/ad. Design + plan ready at `docs/plans/2026-03-08-animated-ads-design.md` and `docs/plans/2026-03-08-animated-ads-plan.md`. 15 tasks, needs `ELEVENLABS_API_KEY` env var. (added 2026-03-08)
- [ ] **Section templates / blocks** — quick-insert pre-built landing page sections into builder (added 2026-03-10)
- [ ] **Element dimensions tooltip** — show W×H on hover in builder canvas (added 2026-03-10)
- [ ] **Storage cleanup tool** — UI to browse/delete old image-jobs (2.5 GB of 3.4 GB total storage) (added 2026-03-10)
- [ ] **Lazy-load brainstorm tab content** — dynamic imports for HooksContent/LearningsContent to reduce brainstorm bundle (added 2026-03-12)
- [ ] Page builder: upgrade from `document.execCommand()` to Selection/Range API for rich text (future-proof)
- [ ] Page builder: multi-select alignment toolbar (flexbox align/distribute selected elements)
- [ ] Auto-scheduling — AI picks optimal publish time (added 2025-02-25)
- [ ] Google Ads integration (added 2025-02-25)
- [ ] Verify nano-banana-2 actual credit cost at 1K resolution from usage logs (added 2026-02-27)
- [ ] Wire untracked `src/app/api/pipeline/import/` route (added 2026-02-28)

## Done (recent)
- [x] **Hub cleanup & restructure** — Dead code removal (-2.8K lines), sidebar 15→10 items (hooks/learnings→brainstorm tabs, A/B tests/swiper→landing pages tabs, inventory→products tab), perf fixes (polling, singleton supabase, middleware auth, SELECT *). Image swiper: save modal, no-logo fix, edit instructions. Commit `ec44fd4`. (done 2026-03-12)
- [x] **Asset tags + cancel buttons + builder/swiper fixes** — tag management on Assets page, cancel buttons on all generation flows (AbortController), builder image panel stays open after gen, swiper copy length constraints. Commit `f318bee`. (done 2026-03-12)
- [x] **Strategy Guide for Morning Brief** — 5-phase feature: data infra (2 new tables + cron sync), strategy engine (4 rule sets, anti-panic), API integration, UI (5 components in MorningBriefClient), Telegram (strategy summary + kill button). Commits `79d8b89`, `4172d81`. (done 2026-03-11)
- [x] **Builder image gen rewrite** — Replaced GPT-4o with Claude Vision structured extraction (same as Assets Image Swiper). Fixes headlines being copied into images. Product hero images now passed as Nano Banana references. Commit `b85813c`. (done 2026-03-11)
- [x] **Assets Hub overhaul** — Video uploads, sidebar nav, URL import, Image Swiper, Video Swiper moved to tab, new categories, product filter, search, storage bar. DB migration + 12-task implementation. Commits `10afb94`, `be92416`, `874e569`. (done 2026-03-10 session 5)
- [x] **Supabase Pro upgrade** — Guided user through upgrade from Free to Pro ($35/mo). Storage 100 GB, bandwidth 250 GB. (done 2026-03-10 session 5)
- [x] **Swiper image generation polish** — video thumbnails, dedup fix, aspect ratio fix, video gen via Kling, smart product prompts, text-only fallback. (done 2026-03-10 session 4)
- [x] **Swiper image selection step** — after rewrite, image grid with checkboxes for bulk product-adapted generation. (done 2026-03-10)
- [x] **Context-aware image generation** — one-click "Generate for HappySleep" in builder. (done 2026-03-10)
