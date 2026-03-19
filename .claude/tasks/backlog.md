# Content Hub — Task Backlog
Updated: 2026-03-19 (P1 items tested + 2 features shipped)

## P0 — Blockers
(none)

## P1 — Do Next
- [ ] **Test page testing live** — push a concept with 2 landing pages to Meta, verify 2 ad sets created with [A]/[B] suffixes (code verified, needs live push)
- [ ] **Live-test competitor swipe E2E** — import real page → generate images/videos → apply → publish (requires manual UI testing)

## P2 — Important
- [ ] **Discovered ads browser UI** — Show what autopilot found/scored/swiped in a table view. Could live at `/concepts?tab=discovered` or similar. (added 2026-03-18)
- [ ] **Autosave race condition** — manual save can overlap with in-flight autosave. Needs optimistic concurrency or save lock. (added 2026-03-17, audit)
- [ ] **Inline scripts in imported HTML** — `handleIframeLoad` removes `<script src>` but not inline `<script>`. Low risk (builder iframe only), but should sanitize. (added 2026-03-17, audit)
- [ ] **Video generation sequential timeout** — ImportProgressPanel processes videos one-at-a-time with 5min timeout each. Refactor to `Promise.allSettled`. (added 2026-03-17, audit)
- [ ] **No partial retry for failed image generation** — must restart entire batch if some images fail. (added 2026-03-17, audit)
- [ ] **Hover label layout thrashing** — `getBoundingClientRect()` on every mouseover in builder canvas needs throttling. (added 2026-03-17, audit)
- [ ] **Cron workspace iteration** — loop over workspaces in cron jobs (ad-performance-sync, auto-pause-bleeders, daily-snapshot) for multi-workspace Meta support. Currently hardcoded to env vars.
- [ ] **Configure Doginwork workspace** — add products, set up Meta Ad Account when mom is ready
- [ ] **Replace raw `<img>` with `next/Image`** — key locations: images/page.tsx:471, MorningBriefClient.tsx:496, ImportProgressPanel.tsx:850-866, ImageSwiper.tsx. Skip builder canvas. (added 2026-03-12)
- [ ] **Tune Strategy Guide thresholds** — after seeing real data, adjust constants in strategy-engine.ts (BUDGET_COOLDOWN_DAYS, MIN_BUDGET_PER_ADSET, etc.) (added 2026-03-11)
- [ ] **Per-breakpoint responsive styles** — mobile vs desktop style editing via media queries (viewMode toggle exists, needs to write @media rules) (added 2026-03-10)
- [ ] Landing Page Recommender — data-driven page selection (added 2025-02-25)
- [ ] Test template brainstorm mode end-to-end (added 2026-02-28)

## P2.5 — Meta Ads Automation (new initiative, 2026-03-03)
Inspired by: Cody Schneider's testing framework, Matt Berman's Meta Ads Copilot (OpenClaw)

### Phase 1-4: All complete (see Done section)

## P3 — Backlog
- [ ] **Animated Ads Pipeline** — Franky Shaw-style animated ad generation: brainstorm → 18 NanoBananaPro images → 9 Kling 3.0 video transitions → ElevenLabs voiceover → Suno music → download for CapCut editing. ~$9-10/ad. Design + plan ready at `docs/plans/2026-03-08-animated-ads-design.md` and `docs/plans/2026-03-08-animated-ads-plan.md`. 15 tasks, needs `ELEVENLABS_API_KEY` env var. (added 2026-03-08)
- [ ] **Drop `app_settings` table** — fully migrated to `workspaces.settings`, only legacy fallback in settings route. Can be removed once verified in production. (added 2026-03-12)
- [ ] **Telegram/Morning Brief workspace context** — these routes don't have workspace context, will need it for multi-workspace support (added 2026-03-12)
- [ ] **Section templates / blocks** — quick-insert pre-built landing page sections into builder (added 2026-03-10)
- [ ] **Element dimensions tooltip** — show W×H on hover in builder canvas (added 2026-03-10)
- [ ] **Storage cleanup tool** — UI to browse/delete old image-jobs (2.5 GB of 3.4 GB total storage) (added 2026-03-10)
- [ ] **Lazy-load brainstorm tab content** — dynamic imports for HooksContent/LearningsContent to reduce brainstorm bundle (added 2026-03-12)
- [ ] Page builder: upgrade from `document.execCommand()` to Selection/Range API for rich text (future-proof)
- [ ] Page builder: multi-select alignment toolbar (flexbox align/distribute selected elements)
- [ ] Auto-scheduling — AI picks optimal publish time (added 2025-02-25)
- [ ] Google Ads integration (added 2025-02-25)
- [ ] **Gemini Embedding 2 integration** — use Google's multimodal embedding model to embed ad creatives, landing pages, and competitor ads into a shared vector space. Enables: ad creative similarity search, landing page ↔ ad matching, concept learnings search by image, competitor ad clustering, video ad semantic analysis. API in public preview. (added 2026-03-12)
- [ ] Verify nano-banana-2 actual credit cost at 1K resolution from usage logs (added 2026-02-27)
- [ ] Wire untracked `src/app/api/pipeline/import/` route (added 2026-02-28)
- [ ] **Clean up dead code in shopify.ts** — `getConversionsForTest()` is no longer imported anywhere after AB test removal (added 2026-03-12)

## Done (recent)
- [x] **P1 backlog blitz** — Tested all autopilot flows E2E (from-scratch, competitor-swipe, execute dry-run, execute live — killed 5 zombie ad sets). Verified workspace isolation (all core routes filter by workspace_id). Verified page testing code. Built market-specific iterations feature (target_market on source_images, scoped translations). Added push-to-existing UI indicator (pre-push notice + result label). Fixed morning brief diagnostic cards missing market. Commit `9482f1d`. (done 2026-03-19)
- [x] **Builder save bug fix + API error transparency** — Root cause: `.select("..., updated_at")` on `pages` table which has no `updated_at` column. Also: removed redundant cheerio+DOMPurify from save path, exposed real errors in `safeError()`, added autosave retry, fixed source page editing path. 8 commits (`db2a50f`→`85141fb`). (done 2026-03-18)
- [x] **Builder countdown timer support** — ConfigTab "Interactive" section with countdown toggle (evergreen/fixed), auto-inject JS on publish via `injectCountdownScript()` in cloudflare-pages.ts, orange dashed outline in editor, Timer badge in Layers. Save error tooltip + dual response checking. Commit `e123f46`. (done 2026-03-18)
- [x] **Text overlay detection + ad copy sync** — AI detects whether competitor ad has text overlays (clean native → no text). Ad copy now syncs into UI when background pipeline finishes. JSON parse robustness improved. Commit `4e291ae`. (done 2026-03-18)
- [x] **Pain Point Selector + Ad Copy Adaptation** — Pill selector (5 options) in Ad Spy + Brainstorm competitor mode. System prompt constrains to single pain point. Ad copy adaptation instructions (structure/tone/length matching). Angle-aware landing page auto-assignment. `discovered_ads.pain_point` column. Commits `ea1fd74`, `0026530`, `31b18ba`. (done 2026-03-18)
- [x] **Autopilot Competitor Swiping + Auto-Execute** — GetHookd API wrapper (`src/lib/gethookd.ts`), dual-mode autopilot-concepts cron (from_scratch + competitor_swipe), autopilot-execute cron (auto-kill + auto-budget at 07:00 UTC), Settings > Autopilot tab, DB tables (discovered_ads, autopilot_actions), Vercel env var. Commit `39047b3`. (done 2026-03-18)
- [x] **Full audit: Page Swiper + Builder** — 15 issues found, 10 fixed: cheerio data-attr parsing, autosave error state, placeholder nonce, copy/paste styles expansion, link detection, SEO validation, image src-based matching, publish error surfacing, decompact warnings. 5 lower-priority items added to P2. Commits `a036d1a`, `0a1b318`. (done 2026-03-17)
- [x] **Builder improvements** — Inline element text editing (STRONG, EM, etc.), object-fit/position controls, image selection UX fix (standard blue outline + explicit edit buttons), AI Edit sidekick (free-form instruction, scope selector, quick actions). Commits `3a1f6df`, `c6530ac`. (done 2026-03-17)
- [x] **Autopilot translation pipeline** — Wired translation pipeline to autopilot approve flow. Created `src/lib/autopilot-translations.ts` shared library. Both Hub UI and Telegram approve handlers now trigger full pipeline (create translations, translate copy, process images, outpaint 9:16) via `after()`. Commits `3c79f21`. (done 2026-03-17)
- [x] **Autopilot Concept Factory** — Daily cron generates concepts via Claude brainstorm, generates images via Kie AI, sends Telegram notification with approve/reject. Hub UI in Brainstorm > Queue tab. English language rule for image generation. Commits `ce3258b`, `815d33f`, `276d887`. (done 2026-03-16/17)
- [x] **Invoice Tracker — manual forwarding flow** — Changed from auto-forward to two-phase flow: scan stores as "ready", user manually sends to Juni via UI buttons. Fixed overly broad matching rules (Klaviyo, Vercel, Meta). Cleaned up 102 bad Shopify logs. Added forward-all endpoint, bulk upload, export, insights APIs. Commit `3ca08ea`. (done 2026-03-14)
- [x] **Invoice Tracker — initial build** — IMAP scanning, SMTP forwarding, PDF detection, billing cycle awareness, cron job, full dashboard UI. Commits `3b3682f`, `7b9471f`. (done 2026-03-13)
- [x] **Workspace isolation + Doginwork rename** — Added workspace_id filtering to 10 API routes (pages, assets, ad-learnings, pipeline-settings, page-tests). Renamed Dog Coaching → Doginwork. Fixed Settings page Dropdown crash (Radix SelectItem empty value). Added workspace_id column to ad_learnings table. Commit `6b9a286`. (done 2026-03-12)
- [x] **Ad-level landing page A/B testing** — Replaced old router-based AB test system (cloaking risk per Mark's advice) with ad-level page testing: 2 ad sets per market with same creatives, different landing URLs. New tables: `page_tests`, `page_test_adsets`. New API routes: `/api/page-tests` (list/stats/winner). UI: "Test against another page" in concept push, comparison view with metrics table + statistical significance, winner declaration pauses losing ad sets, win/loss badges on Pages list. Old system fully removed (-2,694 lines, 13 files deleted). Commit `a1bc6c8`. (done 2026-03-12)
- [x] **Multi-workspace architecture** — 7-phase implementation: workspaces table + workspace_id on ~20 tables, cookie-based resolution, sidebar switcher, ~100+ API routes migrated, dynamic product type (removed PRODUCTS constant), per-workspace Meta creds (setMetaConfig), per-workspace settings (migrated from app_settings). 3 workspaces: HappySleep, Hydro13, Doginwork. Commit `f13c301`. (done 2026-03-12)
- [x] **Hub cleanup & restructure** — Dead code removal (-2.8K lines), sidebar 15→10 items (hooks/learnings→brainstorm tabs, A/B tests/swiper→landing pages tabs, inventory→products tab), perf fixes (polling, singleton supabase, middleware auth, SELECT *). Image swiper: save modal, no-logo fix, edit instructions. Commit `ec44fd4`. (done 2026-03-12)
