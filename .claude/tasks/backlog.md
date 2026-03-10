# Content Hub — Task Backlog
Updated: 2026-03-10 (session 4)

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

### Phase 1: Data Foundation (start here)
- [x] Performance data sync — cron job pulling Meta Insights into `meta_ad_performance` table twice daily (done 2026-03-03)
- [x] 5 Daily Questions API — endpoint that answers: on-track spend? what's running? performance trends? winners/losers? fatigue signals? (done 2026-03-03)
- [x] Morning brief page in Hub — dashboard view of the 5 daily questions (done 2026-03-03)

### Phase 2: Signal Engine
- [x] Fatigue detection — CTR dropping 3+ days (>20% from peak = Critical), frequency > 3.5 (Warning), CPC rising 3+ days >15% (Warning), impressions declining (Monitor) (done 2026-03-03)
- [x] Bleeder detection — ads with high spend + low CTR + CPA > 2.5x target for 48h+ (done 2026-03-03)
- [x] Winner detection — ads at/below target CPA for 5-7 days, ROAS above breakeven, CTR > 1% (done 2026-03-03)
- [x] LP vs creative fatigue distinction — if CTR stable but CPA rising, flag as landing page issue, not creative (done 2026-03-03)
- [x] Efficiency scoring per campaign — CTR/CPC ratio for ranking and budget shift recommendations (done 2026-03-03)

### Phase 3: Notifications & Actions
- [x] Morning brief via Telegram — cron at 6:15 UTC, formats and sends daily summary (done 2026-03-03)
- [x] Auto-pause bleeders — cron at 6:30 UTC, pauses ads at 2.5x CPA for 48h+ (done 2026-03-03)
- [x] Approval-based budget shifts — inline keyboard buttons in Telegram, re-fetches data on approval (done 2026-03-03)
- [x] Winner graduation — inline keyboard, increases ad set budget by 20% for 5+ day consistent winners (done 2026-03-03)
- [x] Set TELEGRAM_NOTIFY_CHAT_ID — captured chat ID 5432096458 (done 2026-03-03)

### Phase 4: Close the Loop
- [x] Auto-suggest creative refresh — Telegram brief shows "Creative Refresh Needed" section with link to brainstorm when fatigue detected (done 2026-03-03)
- [x] Budget consolidation — covered by existing efficiency scoring + budget shift approval flow (dynamic approach is better than fixed tiers) (done 2026-03-03)
- [x] Learning documentation — `ad_learnings` table + API, auto-populated on bleeder pause, winner graduation, and budget shifts. Dashboard shows "Recent Actions" section (done 2026-03-03)
- [x] Creative Testing Learnings — concept_learnings table, AI-generated learnings on kill/promotion, /learnings page, brainstorm injection, backfill script (done 2026-03-05)

## P3 — Backlog
- [ ] **Animated Ads Pipeline** — Franky Shaw-style animated ad generation: brainstorm → 18 NanoBananaPro images → 9 Kling 3.0 video transitions → ElevenLabs voiceover → Suno music → download for CapCut editing. ~$9-10/ad. Design + plan ready at `docs/plans/2026-03-08-animated-ads-design.md` and `docs/plans/2026-03-08-animated-ads-plan.md`. 15 tasks, needs `ELEVENLABS_API_KEY` env var. (added 2026-03-08)
- [ ] **Section templates / blocks** — quick-insert pre-built landing page sections into builder (added 2026-03-10)
- [ ] **Element dimensions tooltip** — show W×H on hover in builder canvas (added 2026-03-10)
- [ ] Page builder: upgrade from `document.execCommand()` to Selection/Range API for rich text (future-proof)
- [ ] Page builder: multi-select alignment toolbar (flexbox align/distribute selected elements) (idea from session 7)
- [ ] Auto-scheduling — AI picks optimal publish time (added 2025-02-25)
- [ ] Google Ads integration (added 2025-02-25)
- [ ] Verify nano-banana-2 actual credit cost at 1K resolution from usage logs (added 2026-02-27)
- [ ] Wire untracked `src/app/api/pipeline/import/` route (added 2026-02-28)

## Done (recent)
- [x] **Swiper image generation polish** — video thumbnails, dedup fix (URL normalization), aspect ratio fix (CSS parsing), video gen via Kling, smart product prompts, text-only fallback. Commits `e6c03b5`→`0f2070f`. (done 2026-03-10 session 4)
- [x] **Swiper image selection step** — after rewrite, image grid with checkboxes for bulk product-adapted generation. Commit `cb52afe`. (done 2026-03-10)
- [x] **Context-aware image generation** — one-click "Generate for HappySleep" in builder, GPT-4o Vision + surrounding text → Nano Banana Pro. Commits `d6f2184`, `89aada1`. (done 2026-03-10)
- [x] **Video→image replace + placeholder clicks** — VideoPanel accepts image uploads; placeholder images now clickable. Commit `cb52afe`. (done 2026-03-10)
- [x] **General / Listicle swiper angle** — neutral advertising angle for page swiper, broad multi-benefit approach inspired by competitor listicles. Commit `3201205`. (done 2026-03-10)
- [x] **Video Swiper** — new feature committed (`b593346`), sidebar link added. (done 2026-03-10)
- [x] **Builder Sidebar Redesign + Container-First Selection** — Replo/Figma-style LayoutControl (3×3 alignment grid), SpacingControl (nested margin+padding box), SizeControl (Fill/Wrap/Fixed presets), DesignTab reorder, container-first hover/selection, Figma-style hidden layers. Commit `316caed`. (done 2026-03-10)
- [x] **Page Builder Polish** — breadcrumb bar (ancestry path, click-to-navigate), reusable color picker (presets, recent colors, opacity), multi-select (shift/cmd+click, batch delete/copy/paste/duplicate/group), drag-to-insert, position control, save feedback, layers depth fix, shared constants. Commit `239e210`. (done 2026-03-09)
- [x] **Page Builder Saved Components + Context Menu** — right-click context menu, save as component, drag-to-insert, keyboard shortcuts, thumbnail generation. (done 2026-03-09)
- [x] **Page Builder Link Modal + Viewport Selector** — replaced window.prompt with proper Link Modal (URL validation, ESC/backdrop close, selection preservation), added viewport selector dropdown (Desktop/iPhone 13/iPad/Custom), iframe resizes dynamically. 6 commits, browser-tested. (done 2026-03-09)
- [x] **Page Builder UX Overhaul** — 8 improvements: no confirm on delete, backspace key, font size bug fix, Freshchat script stripping, image selection fix, Figma-like layers panel, AI image panel fix, rich text editor in Design tab. (done 2026-03-09)
- [x] **Competitor Swipe Multi-Image + Variations** — upload multiple competitor images, pick 1-10 variations per image, `source_index` for per-image Nano Banana reference. Backward compatible. (done 2026-03-09)
- [x] **Launchpad Market Tabs** — per-market NO/DK/SE tabs, independent priority ordering, SEK currency, budget confirmation dialog, per-market reorder/push. Branch: `feat/launchpad-market-tabs`. (done 2026-03-09)
- [x] **Page Builder Redesign (Replo-inspired)** — full-screen builder, BuilderContext (React Context), 4-zone layout, left sidebar (Layers/Components/Settings), right panel (Design/Config/AI), 7 design controls, QualityPanel, zoom, collapsible panels. 21 files, 5,355 lines. Branch: `feat/page-builder-redesign`. (done 2026-03-09)
