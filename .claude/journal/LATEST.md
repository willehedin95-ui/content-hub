# Session: 2026-04-07 15:44

## What was done

**Continuation of earlier session - executed all 4 backlog tasks added today (2026-04-07).**

### 1. Verified cleanup-empty-adsets first scheduled run (07:15 UTC)
- Cron fired on schedule. **11 zombie ad sets paused** between 10:37-10:52 UTC.
- Reasons logged: "All N ads in ad set were paused/not delivering" + "Ad set had 0 ads at all"
- Throttling held (250ms between Meta API list calls) - no rate-limit hits
- `auto_paused_ads` table populated correctly
- Conclusion: source-of-truth zombie killer is working as designed

### 2. Verified pipeline-push pushed Hydro13 #12-#18 (03:00 UTC)
- **#18 already in `testing` stage** (pushed to Meta at 13:31 UTC)
- Others (#12, #14, #15, #16, #17) queued in launchpad with priorities 0 to -4
- Pipeline-push respected cold-start cooldown for the Hydro13 cold campaign - pushed only what the campaign could absorb
- Will continue rolling out at next 03:00 UTC cron

### 3. Fixed HappySleep autopilot failure streak (commit `8b33087`)

**Root cause investigation:**
Queried `image_jobs` for HappySleep concepts last 14 days and found a clear pattern:
- #146/151/152/154/157: 0-2/3 images, status `draft` or `processing`, never recovered
- #156: 3/3 images BUT one translation stuck `processing` for 99 min
- #155: 3/3 images, completed (the only success in the streak)

The same pattern showed up on Hydro13 (#5, #7, #11, #13 - all 0-1 images, archived).

**Why this kept happening:**
1. `swipeCompetitorAd()` ran 3 image generations **sequentially** in a `for` loop (30-90s each = 90-270s per concept)
2. Each cron run processes up to 3 concepts (`MAX_PER_CRON_RUN = 3`)
3. Plus discovery (~30-60s) + Claude Vision (~10-20s) per concept
4. Total: **390-1050s** for a full run, vs `maxDuration = 300`
5. Vercel killed the cron mid-image-loop, leaving `source_images` partially populated and the job stuck in `draft`
6. Reconcile added in last session would later catch them, but by then most were unsalvageable

**Two fixes (both required):**
1. **Parallelized image gen** in `src/lib/swipe-competitor.ts` - converted sequential `for` loop to `Promise.allSettled`. Retry loop preserved per-image. Cuts 3-image gen from 90-270s to 30-90s.
2. **Bumped maxDuration** in `src/app/api/cron/autopilot-concepts/route.ts` from 300 to **800** (Vercel fluid compute max).

Build verified clean (`npx tsc --noEmit` + `npm run build`).

### 4. Decided NOT to deprecate finish-and-queue
Read `src/lib/approval-actions.ts` and traced both flows:
- **finish-and-queue**: For DRAFT concepts (manual brainstorm) - promotes draft to ready, calls `approveConceptAction`, then triggers translations
- **/review approve**: For READY concepts - only does approval (no translations because draft to ready transition already triggered them upstream)

These are NOT redundant. They handle different concept lifecycle states. Keep both.

### 5. Recovered the stuck HappySleep concepts
- **#156 "The Pillow Paradox"**: 17/18 translations done, one stuck in `processing`. Marked translation as `failed`, marked concept as `completed`. The missing translation is a 9:16 outpaint, which is optional per existing policy.
- **#153 "The Morning Stiffness Lie"**: 2/3 images, 0 translations - unsalvageable. `archived` with `archived_at` set.
- **#157 "The Pain Chain"**: 2/3 images, 0 translations - same. `archived` with `archived_at` set.

## Decisions made

- **Both fixes are required, not "either/or"**: Parallelization alone could still hit timeout on slow Kie runs (a single image can take 90s in worst case = 270s for one concept on its own). Timeout bump alone wastes ~2 min per concept and burns Vercel compute. Together they leave a comfortable safety margin.
- **800s = the Vercel fluid compute ceiling**, not an arbitrary bump. No higher option without infra changes.
- **Recovery over re-generation**: For #153 and #157 (2/3 images, 0 translations), starting over would mean burning 2 GetHookd credits + 6 Kie generations + Claude vision for concepts that are already half-broken. Archive is cheaper. Tomorrow's cron will generate fresh ones.
- **#156 marked completed not archived**: It has 17/18 translations + all images. The one missing translation is an optional 9:16 outpaint, which `image_translations.retry_count` policy already treats as non-blocking. Treating it as completed is consistent with that policy.
- **Keep finish-and-queue**: Even though it looks like a wrapper, it's the only path that drives draft to full pipeline including translations for manual brainstorm. /review approve doesn't fit because it expects already-translated concepts.

## Current state

**Working:**
- Autopilot concepts cron will run tomorrow at 08:00 UTC with the fix in place - should produce 3/3 successful concepts instead of the 0-1 we've been getting
- cleanup-empty-adsets paused 11 zombies this morning, shared `auto_paused_ads` table populated
- Hydro13 #18 pushed, others rolling out on cold-start schedule
- Reconcile (added last session) is the safety net for any remaining edge cases - runs at the top of every pipeline-push

**Cleaned up:**
- HappySleep #156 -> completed
- HappySleep #153, #157 -> archived
- Stuck translation `7d3e2c2f-d81f-445c-a3af-c5a52e9ed439` -> failed

**Deployed locally (NOT pushed):**
- Commit `8b33087` (root cause fix) - on local main, awaiting push
- Commit `8e0e2bd` (journal + backlog) - on local main, awaiting push

## Blockers / Open questions

- **Will tomorrow's autopilot cron actually succeed?** Need to verify post-deploy. Both crons fire at 08:00 / 08:30 UTC. Check `image_jobs` table around 09:00 UTC.
- **Should we monitor the parallelization vs Kie rate limits?** 3 parallel image gens to Kie AI might trigger rate limiting we haven't seen before. Watch for partial-success logs (`X/3 images failed for job Y`).
- **The 9:16 outpainting on #156** never finished. Probably fine to ignore, but worth a sanity check next time we look at translation success rates.

## Next up

1. **Push to deploy** - the 4 local commits (47e8a04, e7c668d, 82c287a, 8b33087, 8e0e2bd) need to be pushed for the autopilot fix to actually take effect tomorrow.
2. **Verify tomorrow's autopilot run (08:00 / 08:30 UTC)** - check that the parallelization fix works in production. Look for:
   - 3/3 concepts successfully created (not 0-1)
   - All 3 source_images per concept
   - No "X/3 images failed" warnings in logs
3. **Monitor pipeline-push for Hydro13 #12-#17** - cold start should keep rolling these out over the next few days.
4. **Consider monitoring the partial-success log** I added (`[swipe-competitor] X/3 images failed for job Y`). If this pattern shows up, Kie rate limiting is the next root cause to investigate.
5. **Check `auto_paused_ads` table tomorrow morning** - confirm cleanup-empty-adsets runs daily without rate-limit issues.
