# Resilience Audit 2026-04-16

**Triggered by**: Halsobladet manifest wipe incident (commit `b941f88`).

Root cause of incident: `loadManifest()` silently swallowed Supabase errors + non-atomic read-modify-write in `saveManifest()` = any transient DB error during concurrent deploys permanently wiped manifest from ~200 entries to 1.

This audit searched the codebase for the same class of bugs. 5 parallel agents covered: silent error swallowing, non-atomic RMW, cron race conditions, destructive writes, and missing post-action verification.

Below is the synthesized, deduped, prioritized action list. Individual agent findings are preserved below as appendices.

---

## P0 - Fix NOW (same class of bug, could cause another outage)

### P0-1. `/api/settings` PUT overwrites entire `workspaces.settings` JSONB
**File**: `src/app/api/settings/route.ts`
**Pattern**: Client sends full settings object, server writes it raw. Two tabs open = last writer wins, all other changes lost.
**Similar to manifest bug?** Yes - same "whole-object RMW" pattern, just on a different JSONB column.
**Fix**: Either (a) switch to PATCH with explicit allowed keys merged server-side, or (b) add a Postgres RPC `merge_workspace_settings(p_workspace_id, p_settings JSONB)` that does `settings || EXCLUDED.settings`.

### P0-2. `ad_copy_translations` JSONB RMW in 2 places
**Files**: `src/lib/approval-actions.ts:327-348`, `src/lib/autopilot-translations.ts:251+389`
**Pattern**: Both read whole `ad_copy_translations` JSONB, modify one key, write it back. If autopilot-translate runs while user approves translations, they overwrite each other.
**Fix**: Postgres RPC `merge_ad_copy_translations(p_job_id, p_patch JSONB)` or JSONB `jsonb_set()` via RPC.

### P0-3. Sitemap/homepage/RSS deploys are fire-and-forget `.catch(() => {})`
**File**: `src/app/api/publish/route.ts:245-258`, `src/lib/blog-autopilot.ts:374-379`
**Pattern**: `deployBlogHomepage(language).catch(...)` - if these fail, user gets "published successfully" but blog homepage/RSS/sitemap are stale. No alert fires.
**Fix**: Await them inside the `after()` block. On failure, log to a `deploy_failures` table + Telegram alert. User needs to know if the homepage doesn't regenerate.

### P0-4. Auto-kill cron has no real-time Telegram alert ✅ FIXED
**File**: `src/app/api/cron/autopilot-execute/route.ts`, `src/lib/meta.ts:318-360`
**Pattern**: `pauseAdSetAndAds()` pauses up to 10 adsets/day unattended. Errors inside the pause flow are silently logged and continue. Only summary Telegram fires at end.
**Fix applied**:
- `pauseAdSetAndAds` now collects per-ad errors and throws if any ad failed to pause OR if `listAdsInAdSet` failed after the primary pause. Caller's existing try/catch records the failure in `autopilot_actions` with the error message.
- After each kill (success OR failure) a real-time Telegram message fires immediately with: ad set name, reason + reasoning from strategy engine, urgency, 7d spend/purchases, days running, and (on failure) the error. User learns about each kill when it happens instead of at the next daily digest. Implemented via new `formatKillAlert()` helper using parse_mode=HTML for safe escaping. No undo button (would need a webhook callback route — skipped for now since the kill is already logged to `autopilot_actions` and user can un-pause directly in Ads Manager).

---

## P1 - Prevent Silent Production Failures (high impact, next batch)

### P1-1. No post-deploy HTTP verification in `publishPage()`
**File**: `src/lib/cloudflare-pages.ts`
**Pattern**: CF API returns 200, we update DB `published_url`, fire Telegram "published". But the URL might 404 (manifest corruption, edge propagation lag, etc).
**Fix**: After `createDeployment()`, fetch the returned URL. Check `status === 200` + `body > 500 bytes` + contains `</html>`. Retry 3x with 2s backoff. Only then update DB + notify.
**Would have caught the halsobladet incident on first deploy instead of after ~200 wipes.**

### P1-2. No pre-Meta-push URL check in `pushConceptToMeta()`
**File**: `src/lib/meta-push.ts:272`
**Pattern**: We pass `landingUrl` from DB to Meta without verifying the URL responds. Ad can serve impressions pointing to a dead page.
**Fix**: Before creating Meta ads, HEAD the landing URL with 5s timeout. If non-2xx or <500 bytes, skip that language and record error. User sees which languages failed.

### P1-3. `loadWorkspaces()` returns `[]` on DB error
**File**: `src/lib/workspace.ts:20-28`
**Pattern**: Identical to the manifest bug. If Supabase has a transient hiccup, the app renders "no workspaces" and user is locked out.
**Fix**: Throw instead of returning `[]`. Let the error bubble to a proper error boundary.

### P1-4. `pauseAdSetAndAds()` double-swallows errors
**File**: `src/lib/meta.ts:318-338`
**Pattern**: Inner try/catch ignores per-ad failures, outer try/catch ignores list-ads failure. Result: adset paused but ads still active, no one knows.
**Fix**: Collect errors into an array. If non-empty, throw after the loop with `{paused: [...], failed: [...]}`.

### P1-5. `scale_winner` budget +20% has no upper bound
**File**: `src/app/api/morning-brief/actions/route.ts:146-152`
**Pattern**: Click "Scale +20%" five times → budget +149%. No max check.
**Fix**: Hard cap at `max_campaign_budget` from workspace settings. Also cooldown: refuse if budget changed <24h ago.

### P1-6. `loadManifest()` only tolerates PGRST116, other errors still throw (GOOD) but no retry
**File**: `src/lib/cloudflare-pages.ts:182-202`
**Pattern**: Already fixed to throw on real errors. But a single transient DB hiccup fails the whole deploy.
**Fix**: Wrap in `withRetry()` for transient errors (network, timeout, 5xx from Supabase).

### P1-7. `blog-autopilot` spawns `after()` work that extends past response
**File**: `src/app/api/cron/blog-autopilot/route.ts:86-92`
**Pattern**: `after()` callback writes to `cf_pages_manifests` 200-300s after response. Next language variant (HS-da at 09:10) can start before HS-sv's after() finishes.
**Fix**: (a) Serialize language runs (HS-da only starts if HS-sv's after() is done, via DB lock row), OR (b) rely on the new atomic `mergeManifest()` and accept overlap (already safe now).
**Status**: Arguably resolved by the manifest fix. Verify no other `after()` writes have similar races.

---

## P2 - Hardening (non-urgent, do as time permits)

### P2-1. Meta ad creation has no readback verification
After `createAdCreative` + `createAd`, we trust the 200 response. Add a 30s delayed fetch to verify the ad appears with correct status/adset/creative.

### P2-2. No "ad served impressions" health check
If ad is pushed but shows 0 impressions after 2-6h, nobody knows until manual review. Add hourly cron that queries insights for ads pushed 2-6h ago.

### P2-3. Silent error swallowing in API wrappers
- `src/lib/apify.ts:118-130` - no `response.ok` check before `.json()`
- `src/lib/gethookd.ts:46` - same pattern
- `src/lib/shopify.ts:131-143` - `data.orders ?? []` silently drops pages on malformed response

### P2-4. `pulse-cache.ts:13` fire-and-forget delete
`db.delete()...then(() => {})` - if deletion fails, expired rows accumulate forever.

### P2-5. `createDeployment()` not wrapped in `withRetry()`
Single network hiccup fails the deploy. Use the existing `withRetry` helper.

### P2-6. Auto-kill lacks before-state snapshot
If strategy engine bugs out and kills wrong adsets, there's no DB log of what was running. Add `adset_state_before` JSONB to `autopilot_actions`.

### P2-7. Concept metrics upsert nullifies on partial payload
`src/lib/pipeline.ts:836` - if Meta truncates response, missing fields become NULL, zeroing historical spend. Validate required fields before upsert.

### P2-8. `approval-actions.ts:52` swallows landing page assignment error
Update to `image_jobs.landing_page_id` fails silently, in-memory state drifts from DB.

### P2-9. Soft-delete instead of hard-delete
- `src/lib/pipeline.ts:2037` unqueueConcept deletes lifecycle row
- `src/lib/blog-autopilot.ts:291` deletes page on translation error
- `src/lib/autopilot-iterate.ts:461` deletes source_images
All lose audit trail. Prefer `archived_at` + `archived_reason`.

### P2-10. `workspace.ts` fallback-to-default silently casts undefined
Lines 56-74: if both queries fail, `fallback as Workspace` = undefined, cascades downstream. Check and throw.

---

## Proactive Improvements (not bugs, but would harden system)

### H-1. Post-deploy sanity check cron
Every 30min, fetch all active Meta ad landing URLs + top 10 blog URLs. Alert if any fails. Would have caught halsobladet within 30min instead of when Claude noticed.

### H-2. Deploy audit log
New table `cf_pages_deploy_log`: project, deploy_id, manifest_size_before, manifest_size_after, files_uploaded, verified_url_status. Query when things go wrong.

### H-3. "Destructive write" linting
ESLint rule or grep pre-commit hook that flags:
- `catch (e) {}` without comment explaining why
- `.catch(() => {})` fire-and-forget patterns
- `.single()` / `.maybeSingle()` without error destructure
- `.update(`/`.delete(` without a WHERE that includes id or workspace_id

### H-4. Advisory locks for `cf_pages_manifests`
Wrap manifest mutations in `pg_advisory_xact_lock(project_hash)` so concurrent deploys serialize.

### H-5. Idempotency keys for ad pushes
Generate UUID per (concept, market, language). Meta push checks DB before creating. Prevents duplicate adsets from retry storms.

---

## GOOD patterns (already in codebase - replicate these)

1. **`mergeManifest()` via Postgres RPC** - the fix we just shipped. Template for all JSONB merges.
2. **`landing-page-health` cron** (`src/app/api/cron/landing-page-health/route.ts`) - the verification pattern P1-1 should replicate.
3. **`withRetry()` helper** (`src/lib/retry.ts`) - apply more widely.
4. **`pushing` lock with auto-expire** (`src/lib/meta-push.ts:114-134`) - good concurrent-push protection, template for advisory locks.
5. **`saveManifest()` shrink-guard** - template for sanity checks on destructive writes.

---

## Execution Plan

**Session 1 (P0)**: ~2-3h
- Fix settings PUT → add merge_workspace_settings RPC + convert callsite
- Fix ad_copy_translations RMW → same pattern
- Unwrap sitemap/homepage/RSS fire-and-forget → await + error table + Telegram
- Add real-time Telegram alert for auto-kill

**Session 2 (P1)**: ~3-4h
- Post-deploy HTTP verification in publishPage
- Pre-push landing URL check in pushConceptToMeta
- Fix loadWorkspaces to throw
- Fix pauseAdSetAndAds error collection
- Add budget cap to scale_winner

**Session 3 (P2 + hardening)**: Incremental.
