# Content Hub — Task Backlog
Updated: 2026-03-22 (cron fixes + merged daily digest + video albums)

## P0 — Blockers
(none)

## P1 — Do Now
- [ ] **Backfill concept_metrics** — Data stale since 03-07. Trigger ad-performance-sync with `?since=2026-03-07&until=2026-03-21` to backfill. (added 2026-03-22)

## P2 — Visual Cleanup (next week)
- [x] ~~**Concepts card grid redesign**~~ — done, see Done section
- [x] ~~**Sidebar navigation simplification**~~ — Daily Actions removed, Dashboard→Activity. (done 2026-03-22)

## P2 — Important
- [ ] **Discovered ads browser UI** — Show what autopilot found/scored/swiped in a table view. Could live at `/concepts?tab=discovered` or similar. (added 2026-03-18)
- [ ] **Autosave race condition** — manual save can overlap with in-flight autosave. Needs optimistic concurrency or save lock. (added 2026-03-17, audit)
- [ ] **Inline scripts in imported HTML** — `handleIframeLoad` removes `<script src>` but not inline `<script>`. Low risk (builder iframe only), but should sanitize. (added 2026-03-17, audit)
- [ ] **Video generation sequential timeout** — ImportProgressPanel processes videos one-at-a-time with 5min timeout each. Refactor to `Promise.allSettled`. (added 2026-03-17, audit)
- [ ] **No partial retry for failed image generation** — must restart entire batch if some images fail. (added 2026-03-17, audit)
- [ ] **Hover label layout thrashing** — `getBoundingClientRect()` on every mouseover in builder canvas needs throttling. (added 2026-03-17, audit)
- [ ] **Cron workspace iteration** — daily-snapshot still uses env vars for Meta. Most other crons (autopilot-execute, auto-pause-bleeders, pipeline-push, autopilot-concepts) already iterate workspaces. ad-performance-sync already covers all campaigns (shared Meta account). Low priority now.
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
- [x] ~~**Video Ad Swiper**~~ — done, see Done section
- [ ] **Animated Ads Pipeline** — Franky Shaw-style animated ad generation: brainstorm → 18 NanoBananaPro images → 9 Kling 3.0 video transitions → ElevenLabs voiceover → Suno music → download for CapCut editing. ~$9-10/ad. Design + plan ready at `docs/plans/2026-03-08-animated-ads-design.md` and `docs/plans/2026-03-08-animated-ads-plan.md`. 15 tasks, needs `ELEVENLABS_API_KEY` env var. (added 2026-03-08)
- [ ] **Drop `app_settings` table** — fully migrated to `workspaces.settings`, only legacy fallback in settings route. Can be removed once verified in production. (added 2026-03-12)
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
- [ ] **Launch Pad budget reduction button** — add "Reduce to X SEK" button for cold start markets where budget is too high (added 2026-03-19)
- [ ] **Clean up duplicate Meta ad sets** — retry failures created multiple copies of same concepts (e.g. 3x NO #129 [A]). Should pause duplicates. (added 2026-03-20)
- [ ] **Verify Instagram delivery** — check Ads Manager placement breakdown after 24h to confirm ads show on Instagram (page-backed IG, no business account linked to Hälsobladet). (added 2026-03-20)

## Done (recent)
- [x] **Cron fixes + merged daily digest + video albums** — concept_metrics now derived from meta_ad_performance in ad-performance-sync (was stale since 03-07). daily-snapshot cookie bug fixed (getWorkspaceSettings→direct DB query). Morning brief + autopilot-execute merged into single daily digest at 07:00 UTC. Video concept keyframe images sent as Telegram album. editCallbackMessage helper for webhook. Commit `608a182`. (done 2026-03-22)
- [x] **Activity Feed + auto-iterate + Telegram improvements** — Replaced Daily Actions with Activity Feed homepage (queries autopilot_actions). Added auto-iterate fatiguing concepts (frequency/CTR detection → fresh images → Telegram approve/reject). Telegram concept notifications now show ALL images as album + ad copy. Removed 3 redundant morning brief action messages + auto-pause-bleeders notification. Multiple GetHookd board IDs per workspace. Commit `fa70b3c`. (done 2026-03-22)
- [x] **A/B test grouping by page pair** — Tests grouped by (page_a_id, page_b_id) in API/UI. One row per page pair with aggregated metrics + per-concept breakdown (ROAS/CPA/CVR per concept, "Favors A/B" indicator). Winner declaration across all concepts with outlier warnings. Fixed badge inflation. No DB migration. Commit `03fd067`. (done 2026-03-20)
- [x] **Non-DCO + PAC placement routing** — Switched from DCO (`is_dynamic_creative=true`) to non-DCO + Placement Asset Customization rules. 4:5→feed, 9:16→stories/reels. Enabled Instagram placements (removed Facebook-only restriction). One ad per image pair. Commits `668560c`, `7e2542c`. (done 2026-03-20)
- [x] **Launch Pad cold start mode** — When market has 0 active ad sets: push 5 concepts (not 3), 7-day cooldown, blue/purple/green card states, budget recommendation. Cooldown detected from performance data age. Commit `456267b`. (done 2026-03-19)
- [x] **Video Ad Swiper + Manual Upload** — Two-model pipeline: Gemini 2.5 Pro watches actual competitor video (audio + visual) → transcribes script, identifies hook/format/delivery/character/setting → Claude generates adapted UGC concept with shots → Kie AI keyframe images → Telegram approve/reject. GetHookd board shows video ads (purple badge, play icon, duration). Manual upload via file drop or URL paste bypasses GetHookd entirely. DB: `discovered_ads.video_job_id`, `discovered_ads.ad_type`, `video_jobs.swipe_progress/source/delivery_style`. Commits `5477b85`, `90ccf65`. (done 2026-03-19)
- [x] **Concepts card grid + re-roll UX + processing poll** — Replaced table-based concepts list with responsive card grid (2-5 columns, 4:5 thumbnails, concept number + market flag overlays, status badges). Moved re-roll button from preview modal to thumbnail hover overlay. Fixed missing polling for server-side `after()` pipeline (Finish & Queue showed "0/0"). Commit `4d28b94`. (done 2026-03-19)
- [x] **9:16 safe zone overlay + display bug fixes** — Safe zone overlay on thumbnails/preview (top 14%, bottom 20%). Fixed 9:16 display on All tab (was showing 4:5 originals). Fixed progress count double-counting ratios. Trimmed competitor swipe image count. Updated Rule 11 text placement for safe zone. E2E tested with Kie AI. Commit `8836834`. (done 2026-03-19)
- [x] **Concept detail redesign + Meta placement fix** — Replaced wizard with collapsible sections, status-driven CTA, overflow menu, 4:5/9:16 ratio toggle. Fixed Meta push: per-image-pair creatives with `asset_customization_rules` routing 4:5→feed and 9:16→stories/reels. Also fixed campaign builder push route. Commit `7eea009`. (done 2026-03-19)
- [x] **Phase 1 Pipeline Unblock** — Finish & Queue button, relaxed translation scoring, default Page B setting. Commit `3d1e466`. (done 2026-03-19)
- [x] **P1 backlog blitz** — Tested all autopilot flows E2E (from-scratch, competitor-swipe, execute dry-run, execute live — killed 5 zombie ad sets). Verified workspace isolation (all core routes filter by workspace_id). Verified page testing code. Built market-specific iterations feature (target_market on source_images, scoped translations). Added push-to-existing UI indicator (pre-push notice + result label). Fixed morning brief diagnostic cards missing market. Commit `9482f1d`. (done 2026-03-19)
- [x] **Builder save bug fix + API error transparency** — Root cause: `.select("..., updated_at")` on `pages` table which has no `updated_at` column. Also: removed redundant cheerio+DOMPurify from save path, exposed real errors in `safeError()`, added autosave retry, fixed source page editing path. 8 commits (`db2a50f`→`85141fb`). (done 2026-03-18)
