# Content Hub — Task Backlog
Updated: 2026-03-11 (session 1)

## P0 — Blockers
(none)

## P1 — Do Next
- [ ] Live-test competitor swipe end-to-end: import real page → generate images/videos → apply → publish (added 2026-03-09, updated 2026-03-10)
- [ ] Push iteration images to existing Meta ad set — add new batch ads to existing ad set instead of creating new one (added 2026-03-04)
- [ ] Market-specific iterations — generate only for the flagged market when Daily Actions suggests iterate for e.g. NO (added 2026-03-04)
- [ ] Test template brainstorm mode end-to-end (added 2026-02-28)

## P2 — Important
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
- [ ] Page builder: upgrade from `document.execCommand()` to Selection/Range API for rich text (future-proof)
- [ ] Page builder: multi-select alignment toolbar (flexbox align/distribute selected elements)
- [ ] Auto-scheduling — AI picks optimal publish time (added 2025-02-25)
- [ ] Google Ads integration (added 2025-02-25)
- [ ] Verify nano-banana-2 actual credit cost at 1K resolution from usage logs (added 2026-02-27)
- [ ] Wire untracked `src/app/api/pipeline/import/` route (added 2026-02-28)

## Done (recent)
- [x] **Builder image gen rewrite** — Replaced GPT-4o with Claude Vision structured extraction (same as Assets Image Swiper). Fixes headlines being copied into images. Product hero images now passed as Nano Banana references. Commit `b85813c`. (done 2026-03-11)
- [x] **Assets Hub overhaul** — Video uploads, sidebar nav, URL import, Image Swiper, Video Swiper moved to tab, new categories, product filter, search, storage bar. DB migration + 12-task implementation. Commits `10afb94`, `be92416`, `874e569`. (done 2026-03-10 session 5)
- [x] **Supabase Pro upgrade** — Guided user through upgrade from Free to Pro ($35/mo). Storage 100 GB, bandwidth 250 GB. (done 2026-03-10 session 5)
- [x] **Swiper image generation polish** — video thumbnails, dedup fix, aspect ratio fix, video gen via Kling, smart product prompts, text-only fallback. (done 2026-03-10 session 4)
- [x] **Swiper image selection step** — after rewrite, image grid with checkboxes for bulk product-adapted generation. (done 2026-03-10)
- [x] **Context-aware image generation** — one-click "Generate for HappySleep" in builder. (done 2026-03-10)
- [x] **Builder Sidebar Redesign + Container-First Selection** — Replo/Figma-style controls. (done 2026-03-10)
- [x] **Page Builder Polish** — breadcrumb bar, color picker, multi-select, drag-to-insert, position control. (done 2026-03-09)
