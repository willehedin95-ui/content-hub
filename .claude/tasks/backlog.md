# Content Hub — Task Backlog
Updated: 2026-03-27

## Renew Launch
- [x] ~~**Meta infrastructure**~~ — Ad account `act_1356397096506086`, Page "Renew Sverige", Pixel `2023081985301786`, system user access, workspace config updated. (done 2026-03-25)
- [x] ~~**Shopify Pixel + CAPI**~~ — Facebook & Instagram sales channel (Maximum), verified pixel firing on get-renew.com. (done 2026-03-25)
- [x] ~~**Email DNS (SPF/DKIM/DMARC)**~~ — All records configured on Hostinger. Klaviyo branded sending domain `send.get-renew.com` verified. (done 2026-03-25)
- [ ] **GA4 + GTM + GSC** — Set up new GA4 property, GTM container, and verify get-renew.com in GSC. (added 2026-03-25)
- [ ] **Shopify policies** — kontaktformulär + returformulär still missing. (added 2026-03-25)
- [ ] **Klaviyo from-address** — Set `hello@get-renew.com` as sender default. (added 2026-03-25)
- [ ] **Ad account warmup** — Start small campaigns once store has products. Initial limit ~500 SEK/day. (added 2026-03-25)
- [ ] **Update Hydro13 blog product URLs** — blog-writer.ts has "#" placeholder for Hydro13. Update to get-renew.com product URL when store is live. (added 2026-03-27)

## Tier 1 — Revenue & Automation
- [x] ~~**Multi-workspace hardcoding audit**~~ — Full codebase audit (4 parallel agents), fixed 24 files. Removed pausedProducts hiding Hydro13, hardcoded pillow descriptions, `|| "happysleep"` fallbacks, collagen-specific research prompts, HappySleep-specific blog language rules. Commits `69dea06`, `f80afda`. (done 2026-03-27)
- [x] ~~**Workspace-aware language options**~~ — Hydro13 now only shows Swedish. `WorkspaceProvider` + `useWorkspaceLanguages()` hook, 10 components + 8 API routes updated. Commit `907130c`. (done 2026-03-27, by Paperclip CEO agent)
- [ ] **Fix ad-performance-sync multi-workspace** — Cron only syncs env var Meta account. Renew's separate ad account (`act_1356397096506086`) data never synced. Needs to iterate `workspaces.meta_config`. (added 2026-03-27, HIGH priority)
- [ ] **Fix pipeline/concepts approve route** — `POST /api/pipeline/concepts/[id]/approve` references non-existent `/api/image-jobs/[id]/generate-all`. Silently 404s. (added 2026-03-27)

## Tier 2 — Builder & UX Quality
- [x] ~~**Autosave race condition**~~ — Fixed in commit `f382c9b`. (done 2026-03-22)
- [ ] **Tune translation quality review prompt** — monitor Claude Haiku review results for false positives/negatives. Adjust strictness if needed. (added 2026-03-22)
- [ ] **Content Plan: Add Article button** — Let user manually add articles to the content plan from the UI (currently only added via migration script or autopilot). (added 2026-03-25)

## Tier 3 — Housekeeping
- [ ] **Scope meta-ads dashboard by workspace** — `/api/meta-ads/dashboard` not filtering by workspace. (added 2026-03-27)
- [ ] **Scope usage route by workspace** — `/api/usage` not filtering by workspace. (added 2026-03-27)
- [ ] **Storage cleanup tool** — UI to browse/delete old image-jobs (2.5 GB of 3.4 GB total storage). (added 2026-03-10)
- [ ] **Drop `app_settings` table** — fully migrated to `workspaces.settings`, only 2 legacy fallback references left. (added 2026-03-12)
- [ ] **Clean up dead code in shopify.ts** — `getConversionsForTest()` is no longer imported anywhere. (added 2026-03-12)
- [ ] **Replace raw `<img>` with `next/Image`** — 4 locations: images/page.tsx, MorningBriefClient.tsx, ImportProgressPanel.tsx, ImageSwiper.tsx. (added 2026-03-12)
- [ ] **Lazy-load brainstorm tab content** — dynamic imports for HooksContent/LearningsContent to reduce brainstorm bundle. (added 2026-03-12)
- [ ] **Cron workspace iteration** — daily-snapshot still uses env vars for Meta. Low priority (shared Meta account). (added 2026-03-12)
- [ ] **Configure Doginwork workspace** — add products, set up Meta Ad Account when mom is ready. (added 2026-03-12)

## Tier 4 — Big Future Features
- [ ] **Animated Ads Pipeline** — Franky Shaw-style: brainstorm → NanoBananaPro images → Kling 3.0 transitions → ElevenLabs voiceover → Suno music. ~$9-10/ad. Design+plan ready. (added 2026-03-08)
- [ ] **Element dimensions tooltip** — show W×H on hover in builder canvas. (added 2026-03-10)
- [ ] Page builder: upgrade from `document.execCommand()` to Selection/Range API for rich text. (added 2026-03-10)
- [ ] Page builder: multi-select alignment toolbar (flexbox align/distribute selected elements). (added 2026-03-10)
- [ ] **Auto-scheduling** — AI picks optimal publish time based on historical performance. (added 2025-02-25)

## Hydro13 iOS App
- [ ] **App Store screenshots with AI** — Use [app-store-screenshots](https://github.com/ParthJadhav/app-store-screenshots) to generate professional ASO screenshots. Scaffolds a Next.js project, exports all 4 Apple sizes. Swedish locale. `npx skills add ParthJadhav/app-store-screenshots`. (added 2026-03-23)

## Research System Follow-ups
- [ ] **Run seed data import** — `npx tsx scripts/import-research-seed.ts` to backfill existing VOC files into nuggets. (added 2026-03-25)
- [ ] **Wire research into blog-writer.ts** — Inject research context into blog article prompts. (added 2026-03-25)
- [ ] **Add more Trustpilot sources** — User will provide additional brands to monitor. (added 2026-03-25)
- [ ] **Monitor first automated scan** — Check results after 10:00 UTC tomorrow. (added 2026-03-25)

## Done (recent)
- [x] **Workspace-aware language options** — Hydro13 shows only Swedish. WorkspaceProvider, useWorkspaceLanguages(), 22 files. Commit `907130c`. (done 2026-03-27, Paperclip CEO)
- [x] **Multi-workspace hardcoding audit** — 24 files fixed, removed all hardcoded HappySleep/pillow/collagen refs, pausedProducts filter, `|| "happysleep"` fallbacks. Commits `69dea06`, `f80afda`. (done 2026-03-27)
- [x] **Research Intelligence System** — Full Trustpilot scraping + Haiku evaluation + theme detection + brainstorm integration + UI. 7 Nordic collagen sources pre-configured for Hydro13. Commit `6d9e2f4`. (done 2026-03-25)
- [x] **Renew Meta + Shopify + Email infrastructure** — Full Meta setup (ad account, page, pixel, CAPI), Shopify custom app + Facebook & Instagram sales channel, SPF/DKIM/DMARC + Klaviyo branded sending domain. All via API. (done 2026-03-25)
- [x] **Move blog to SEO tab + content plan DB + SEO audit** — Blog under /seo with 5 tabs. `blog_content_plan` table. Autopilot reads from DB. GSC configured. 6 bug fixes. Commit `a44bbf4`. (done 2026-03-25)
- [x] **Blog mobile UX + WebP images** — Author byline with avatar, mobile table column hiding, WebP image optimization (97% size reduction). Republished all 4 articles. Commit `855ffcc`. (done 2026-03-25)
- [x] **7 autopilot pipeline improvements** — Auto-assign landing page, 12h quality gate, Telegram alerts, ROAS-based page recommender, angle diversity, GetHookd credit tracking, dynamic generation count. Commit `bc40e23`. (done 2026-03-23)
- [x] **One-Click Ad Pipeline** — Auto-generate images + auto-assign landing page on concept creation. Inline approve in brainstorm UI. 48h translation auto-approve. Activity Feed pending actions. Commit `6aa852f`. (done 2026-03-22)
