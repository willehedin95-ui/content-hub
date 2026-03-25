# Content Hub — Task Backlog
Updated: 2026-03-25

## Tier 1 — Revenue & Automation
- [x] ~~**Push `855ffcc` + `6cad110` to deploy**~~ — Blog mobile UX + WebP + author byline + internal linking. Pushed and auto-deploying to Vercel. (done 2026-03-25)
- [x] ~~**Test blog autopilot end-to-end on Vercel**~~ — Tested across 3 templates. Found+fixed 6 HTML/SEO issues (nested tags, relative OG images, duplicate meta, test articles, fabricated quotes). Added anatomy rules to image prompts. Regenerated bad image. Commits `eca4ad8`, `bb6f838`. (done 2026-03-25)
- [x] ~~**Pause ads pointing to dead domains**~~ — Verified: all 480 ads (coolafynd.se + woofie.se) already PAUSED/ADSET_PAUSED. Zero active spend. No action needed. (verified 2026-03-25)
- [x] ~~**Move blog to SEO tab + content plan DB**~~ — Blog consolidated under /seo with 5 tabs. Content plan migrated from hardcoded arrays to `blog_content_plan` table. Blog autopilot rewritten to read from DB. GSC properties configured. Full audit + 6 bug fixes. Commit `a44bbf4`. (done 2026-03-25)

## Tier 2 — Builder & UX Quality
- [x] ~~**Autosave race condition**~~ — Fixed in commit `f382c9b`. (done 2026-03-22)
- [ ] **Tune translation quality review prompt** — monitor Claude Haiku review results for false positives/negatives. Adjust strictness if needed. (added 2026-03-22)
- [ ] **Content Plan: Add Article button** — Let user manually add articles to the content plan from the UI (currently only added via migration script or autopilot). (added 2026-03-25)

## Tier 3 — Housekeeping
- [x] ~~**GetHookd credit usage Settings UI**~~ — Progress bar + color-coded remaining in Settings > Autopilot. Commit `5db744b`. (done 2026-03-23)
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

## Done (recent)
- [x] **Move blog to SEO tab + content plan DB + SEO audit** — Blog under /seo with 5 tabs. `blog_content_plan` table. Autopilot reads from DB. GSC configured. 6 bug fixes (API 500 path, null positions, stats filtering, edit link language, label truncation, setup guide). Commit `a44bbf4`. (done 2026-03-25)
- [x] **Blog mobile UX + WebP images** — Author byline with avatar, mobile table column hiding (first+last), WebP image optimization in blog publish flow (97% size reduction), reduced mobile padding. Republished all 4 articles. Commit `855ffcc`. (done 2026-03-25)
- [x] **Blog autopilot native images + mobile fixes** — blog-images.ts (Haiku prompts → Kie AI → Supabase upload), mobile overflow-x fix, table-wrap CSS, author name, template improvements. Restored 4 missing CF Pages. Full Meta ads audit (47 URLs verified). Commit `91474ac`. (done 2026-03-24)
- [x] **GetHookd credit UI + zombie kill dedup** — Settings > Autopilot credit progress bar. Fix daily re-killing of same ad sets (7-day dedup). Cleaned up failed concept #132 from launchpad. Commit `5db744b`. (done 2026-03-23)
- [x] **7 autopilot pipeline improvements** — Auto-assign landing page on approve, 12h quality gate (was 48h), Telegram alerts for failures, ROAS-based page recommender, angle diversity enforcement, GetHookd credit tracking, dynamic generation count (0-2→3/day, 3-5→2, 6-9→1, 10+→skip). Commit `bc40e23`. (done 2026-03-23)
- [x] **One-Click Ad Pipeline** — Auto-generate images + auto-assign landing page on concept creation. Inline approve in brainstorm UI. 48h translation auto-approve. Activity Feed pending actions. Commit `6aa852f`. (done 2026-03-22)
