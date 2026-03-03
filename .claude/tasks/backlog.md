# Content Hub — Task Backlog
Updated: 2026-03-03

## P1 — Do Next
- [ ] Test template brainstorm mode end-to-end (added 2026-02-28)
- [ ] V3.4 Iteration System on Winners — segment swap, mechanism swap, C.A.S.H. swap (added 2026-02-28)

## P2 — Important
- [ ] Ad Spy — monitor competitors, AI suggests new concepts (added 2025-02-25)
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
- [ ] **BLOCKED**: Set TELEGRAM_NOTIFY_CHAT_ID — need user to message bot, then capture chat ID

### Phase 4: Close the Loop
- [x] Auto-suggest creative refresh — Telegram brief shows "Creative Refresh Needed" section with link to brainstorm when fatigue detected (done 2026-03-03)
- [x] Budget consolidation — covered by existing efficiency scoring + budget shift approval flow (dynamic approach is better than fixed tiers) (done 2026-03-03)
- [x] Learning documentation — `ad_learnings` table + API, auto-populated on bleeder pause, winner graduation, and budget shifts. Dashboard shows "Recent Actions" section (done 2026-03-03)

## P3 — Backlog
- [ ] Auto-scheduling — AI picks optimal publish time (added 2025-02-25)
- [ ] Google Ads integration (added 2025-02-25)
- [ ] Verify nano-banana-2 actual credit cost at 1K resolution from usage logs (added 2026-02-27)
- [ ] Wire untracked `src/app/api/pipeline/import/` route (added 2026-02-28)

## Done (recent)
- [x] Template-based brainstorm mode — 14 ad templates from Copy Blocks (done 2026-02-28)
- [x] Wire deep Copy Blocks framework into brainstorm prompts (done 2026-02-28)
- [x] Write copy-blocks-deep.md — unified framework document (done 2026-02-28)
- [x] Poll-based streaming — images appear in grid as they complete (done 2026-02-27)
- [x] Switch to nano-banana-2 at 1K resolution for faster/cheaper generation (done 2026-02-27)
- [x] Parallel image generation via Promise.allSettled (done 2026-02-27)
- [x] Error feedback — show full summary when images fail (done 2026-02-27)
- [x] Regenerate missing styles after partial failure (done 2026-02-27)
- [x] Per-image skip/translate toggle for source images (done 2026-02-26)
- [x] Skeleton loading placeholders during static ad generation (done 2026-02-26)
- [x] Anthropic prompt caching on brainstorm API (done 2026-02-26)
- [x] Collapsible "Ads" sidebar group (Brainstorm, Ad Concepts, Ad Spy) (done 2026-02-26)
- [x] Fix style selector resetting on unaware concepts (done 2026-02-26)
- [x] Fix brainstorm generating identical concepts (anti-copying instructions) (done 2026-02-26)
- [x] Populate HappySleep product data + Hydro13 audience segments (done 2026-02-26)
- [x] Preview thumbnails on style chips (done 2026-02-26)
- [x] Re-roll individual briefs with diversity protection (done 2026-02-26)
- [x] Concept diversity / dislike feature — reject concepts to avoid similar ones (done 2025-02-25)
- [x] Style picker for static ad generation (done 2025-02-25)
- [x] Prompt visibility — show Kie AI prompts per image (done 2025-02-25)
- [x] Phase 12: Native/ugly ads pipeline — 3 native styles (done 2025-02-25)
