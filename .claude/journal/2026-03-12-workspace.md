# Session: 2026-03-12 (Multi-Workspace Architecture)

## What was done
- Completed all 7 phases of the multi-workspace architecture:
  - **Phase 1**: Created `workspaces` table, added `workspace_id` UUID column to ~20 tables, seeded 3 workspaces (HappySleep, Hydro13, Dog Coaching), backfilled existing data
  - **Phase 2**: Created `src/lib/workspace.ts` with cookie-based workspace resolution (`ch-workspace` cookie), updated middleware to set cookie, widened `Product` type from union to `string`
  - **Phase 3**: Added workspace switcher dropdown to Sidebar, passed workspaces from server layout
  - **Phase 4**: Migrated ~100+ API routes to filter by `workspace_id` on reads and set it on writes (used 5 parallel agents)
  - **Phase 5**: Removed hardcoded `PRODUCTS` constant, created `useProducts()` hook that fetches from API, updated 13 component files
  - **Phase 6**: Per-workspace Meta Ads credentials — `setMetaConfig()` override in meta.ts, updated meta-push/meta-video-push and 10 API routes, added "Workspace Credentials" UI in Settings > Meta Ads, created `/api/workspace` PATCH endpoint
  - **Phase 7**: Migrated settings from `app_settings` singleton to `workspaces.settings` JSONB, added `getWorkspaceSettings()` helper, updated 11 files that read settings

## Decisions made
- **Cookie-based workspace context** (`ch-workspace`) — no URL rewrites needed, all existing routes/links work unchanged
- **1 workspace = 1 brand** — simplest model for single-user app
- **Module-level config override for Meta API** (`setMetaConfig`) — avoids passing config through every function call. Workspace config overrides env vars when set.
- **Cron jobs stay on env vars** — no cookie context available, they'll need workspace iteration later if multiple workspaces have Meta accounts
- **Server/client boundary**: `workspace.ts` uses `next/headers` (server-only). Files imported by client components (brainstorm.ts, video-brainstorm.ts, shopify.ts) pass `workspaceId` as a parameter instead of importing workspace.ts.
- **Legacy fallback**: settings route falls back to `app_settings` table if workspace settings are empty (migration safety)

## Current state
- Build passes, commit `f13c301` on main (NOT pushed — will auto-deploy to Vercel when pushed)
- All workspace data isolation is in place for API routes
- Workspace switcher visible in sidebar
- Per-workspace Meta credentials configurable in Settings > Meta Ads
- Settings stored per-workspace in `workspaces.settings` JSONB
- Workspace IDs: happysleep=`c40221e2-96fb-4774-92db-74ec0227b262`, hydro13=`6a18a542-4e8a-4d51-bc56-afd49fd1d9b7`, dog-coaching=`0150243c-c33c-40d9-a780-dc41291d18f9`

## Blockers / Open questions
- Cron jobs (ad-performance-sync, auto-pause-bleeders, daily-snapshot) don't have workspace context — they use env vars and will need workspace iteration if mom's dog coaching gets its own Meta account
- Telegram webhook doesn't have workspace context — hardcoded to env vars
- Morning brief doesn't have workspace context — same issue
- `app_settings` table still exists as fallback — can be dropped once verified

## Next up
1. **Push to deploy** when ready to go live (will auto-deploy to Vercel)
2. **Test workspace switching** end-to-end — verify data isolation between HappySleep and Hydro13
3. **Configure Dog Coaching workspace** — add products, set up Meta Ad Account when mom is ready
4. **Cron workspace iteration** — loop over workspaces in cron jobs for multi-workspace Meta support
5. Resume normal feature work from backlog
