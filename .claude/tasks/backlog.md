# Content Hub — Task Backlog
Updated: 2026-03-09 (evening)

## P0 — Blockers
- [ ] Merge `feat/page-builder-redesign` to main and push — 21 new builder files, full Replo-inspired redesign. Build passes, TypeScript clean. (added 2026-03-09)

## P1 — Do Next
- [ ] Test competitor ad flow end-to-end — upload real competitor image, verify Claude analysis + Nano Banana generation (added 2026-03-04)
- [ ] Push iteration images to existing Meta ad set — add new batch ads to existing ad set instead of creating new one (added 2026-03-04)
- [ ] Market-specific iterations — generate only for the flagged market when Daily Actions suggests iterate for e.g. NO (added 2026-03-04)
- [ ] Test template brainstorm mode end-to-end (added 2026-02-28)

## P2 — Important
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
- [ ] Auto-scheduling — AI picks optimal publish time (added 2025-02-25)
- [ ] Google Ads integration (added 2025-02-25)
- [ ] Verify nano-banana-2 actual credit cost at 1K resolution from usage logs (added 2026-02-27)
- [ ] Wire untracked `src/app/api/pipeline/import/` route (added 2026-02-28)

## Done (recent)
- [x] **Page Builder Redesign (Replo-inspired)** — full-screen builder, BuilderContext (React Context), 4-zone layout, left sidebar (Layers/Components/Settings), right panel (Design/Config/AI), 7 design controls, QualityPanel, zoom, collapsible panels. 21 files, 5,355 lines. Branch: `feat/page-builder-redesign`. (done 2026-03-09)
- [x] Page builder enhancements — extracted components, text styling, layers panel, asset bank, content blocks, undo/redo, duplicate, link editor, video/media support (done 2026-03-09)
- [x] Fixed AB tests build blocker — missing route modules for /ab-tests and /api/ab-tests/[id]/winner (done 2026-03-09)
- [x] Source page editor + swiper language detection (done 2026-03-09)
- [x] Real-time progress checklists — NDJSON streaming for brainstorm, step-based progress for swiper + publish modal, deferred competitor image gen with polling (done 2026-03-05)
- [x] Competitor ad text adaptation — Nano Banana prompts now adapt in-image text for target product (done 2026-03-05)
- [x] Creative Testing Learnings feedback loop — AI auto-generates structured learnings on ad kill/promotion, feeds back into brainstorm prompts (done 2026-03-05)
- [x] "From Competitor Ad" brainstorm mode — upload competitor ad image, Claude Vision analyzes, generates adapted concepts + images (done 2026-03-04)
- [x] Competitor ad upload UX — click/drag/paste/URL input with preview (done 2026-03-04)
- [x] Market-aware Smart Iterate — pass market param to iteration suggestions (done 2026-03-04)
- [x] V3.4 Iteration System — Smart Iterate with AI suggestions + batch-based generation within same concept (done 2026-03-04)
- [x] Daily Actions iterate flow — profitable fatigue cards link to concept with auto-open iterate modal (done 2026-03-04)
- [x] Rename Static Ads → Concepts everywhere (done 2026-03-04)
- [x] Template-based brainstorm mode — 14 ad templates from Copy Blocks (done 2026-02-28)
- [x] Wire deep Copy Blocks framework into brainstorm prompts (done 2026-02-28)
