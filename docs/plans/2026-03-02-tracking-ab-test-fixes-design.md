# Tracking & AB Test Fixes — Design

## Problem

Multiple tracking and AB testing issues identified:

1. **Clarity not collecting data** — single project ID used for 4 domains; Clarity requires one project per domain
2. **GA4 conversions always 0** — cross-domain purchase attribution is fragile; Shopify is the reliable conversion source
3. **AB test conversion matching broken** — variant `published_url` stores standalone page URL instead of AB test variant path (`/slug/b/`), so Shopify `landing_site` never matches
4. **No automatic conversion sync** — `sync-conversions` must be triggered manually per test
5. **Sync IP opt-out blocks page load** — synchronous XMLHttpRequest for IP check

## Fix 1: Clarity — Per-Domain Projects

**Current**: `app_settings.clarity_project_id` = `"uni5kmk5fj"` (single string)

**New**: `app_settings.clarity_project_ids` = per-language map:
```json
{
  "sv": "<halsobladet-project>",
  "da": "<smarthelse-project>",
  "no": "<helseguiden-project>"
}
```

4 domains need 4 Clarity projects (blog.halsobladet.com has its own):
- sv → blog.halsobladet.com
- da → smarthelse.dk
- no → helseguiden.com

### Changes

- `cloudflare-pages.ts` `injectClarityScript()` — accept language param, look up per-language project ID
- `cloudflare-pages.ts` `publishPage()` / `publishABTest()` — pass language to Clarity injection
- `clarity.ts` `fetchClarityInsights()` — accept map of project IDs, fetch from each, merge results
- Settings UI — per-language Clarity project ID inputs (same pattern as GA4 measurement IDs)
- Backward compat: fall back to `clarity_project_id` if `clarity_project_ids` not set

**User action required**: Create 3-4 Clarity projects in dashboard (one per domain), enter project IDs in Settings.

## Fix 2: Shopify as Conversion Source of Truth

GA4 conversion tracking across domains is fragile (ad blockers, ITP, consent). Shopify `landing_site` already captures which page drove the sale.

**Decision**: Shopify orders = conversion source of truth everywhere. GA4 remains useful for engagement metrics (bounce, scroll, time) but not conversions.

No code changes needed — the hub already uses Shopify attribution on the Performance page. This is a confirmation of the existing approach.

## Fix 3: AB Test Variant URL Bug

### Problem
- AB test publishes variant B to `/{slug}/b/`
- Translation `published_url` still points to standalone URL (e.g., `/min-dotter`)
- Shopify `landing_site` = `/{slug}/b/` → conversion matching fails (compares against `/min-dotter`)

### Fix
1. **Publish route** (`/api/ab-tests/[id]/publish`): After publishing, update both translations' `published_url` to their AB test variant paths:
   - Control: `https://{domain}/{slug}/a/`
   - Variant: `https://{domain}/{slug}/b/`

2. **Winner route** (`/api/ab-tests/[id]/winner`): When declaring winner and republishing as standalone, update winner's `published_url` back to root slug.

3. **Conversion matching** (`shopify.ts` `getConversionsForTest()`): Match against AB test slug paths (`/{slug}/a/` and `/{slug}/b/`) directly from the `ab_tests` record, not just translation `published_url`. Resilient even if URLs get out of sync.

## Fix 4: Automatic Conversion Sync

Add AB test conversion sync to the existing pipeline cron (`/api/cron/pipeline-push`, runs daily 03:00 UTC).

For each active AB test:
1. Fetch Shopify orders since test `created_at`
2. Match `landing_site` to variant paths
3. Upsert into `ab_conversions`

Lightweight loop — reuses existing `getConversionsForTest()` logic.

## Fix 5: Async IP Opt-Out

### Problem
Synchronous `XMLHttpRequest` to `/api/tracking-optout` blocks page load on first visit when `excluded_ips` is configured.

### Fix
Switch to async check. On first visit without `_ch_optout` cookie:
1. Let tracking scripts fire normally
2. Fire async request to `/api/tracking-optout`
3. If response says opt-out, set cookie for next visit
4. First visit from excluded IP gets tracked once (acceptable trade-off for not blocking page load)

Alternative: bake excluded IPs directly into the page HTML at publish time and check client-side (no API call at all). Already partially done — `ips` array is embedded. Just need to do the comparison client-side.

**Recommended**: Client-side IP comparison using the already-embedded `ips` array, remove the sync API call entirely. For the edge case where the visitor's IP changes, the existing cookie handles it.

Wait — actually the client can't know its own IP without an API call. Keep the async approach: fire tracking, then async check, set cookie for future visits.
