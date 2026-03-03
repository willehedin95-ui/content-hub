# Tracking & AB Test Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 broken tracking/AB test issues: per-domain Clarity, AB test variant URL bug, conversion matching, auto-sync cron, async IP opt-out.

**Architecture:** All changes are in the existing content-hub Next.js app. Touches cloudflare-pages.ts (analytics injection), shopify.ts (conversion matching), clarity.ts (multi-project fetch), Settings UI (per-language Clarity IDs), and the pipeline cron (auto-sync AB conversions).

**Tech Stack:** Next.js 14 App Router, Supabase, Cloudflare Pages, Shopify API, Clarity API

---

### Task 1: Per-Language Clarity Project IDs — Settings & Types

**Files:**
- Modify: `src/app/settings/components.tsx` (add `clarity_project_ids` to AppSettings type)
- Modify: `src/app/settings/page.tsx` (add default for `clarity_project_ids`)
- Modify: `src/app/settings/tabs/IntegrationsTab.tsx` (replace single input with per-language inputs)

**Step 1: Add `clarity_project_ids` to the AppSettings interface**

In `src/app/settings/components.tsx`, add to the `AppSettings` interface (around line 31):

```typescript
clarity_project_ids: Record<string, string>; // per-language: { sv: "xxx", da: "yyy", no: "zzz" }
```

Keep the existing `clarity_project_id` field for backward compat.

**Step 2: Add default in page.tsx**

In `src/app/settings/page.tsx` (around line 54), add to the defaults object:

```typescript
clarity_project_ids: {},
```

**Step 3: Replace single Clarity input with per-language inputs in IntegrationsTab.tsx**

Replace the single "Clarity Project ID" `<Row>` (lines 191-203) with a per-language loop, mirroring the GA4 pattern (lines 145-189). For each language in `LANGUAGES`:

```tsx
{LANGUAGES.map((lang) => {
  const cid = settings.clarity_project_ids?.[lang.value] || "";
  return (
    <Row
      key={`clarity-${lang.value}`}
      label={`Clarity Project — ${lang.label}`}
      description={cid || "Not configured"}
      descriptionColor={cid ? "text-emerald-600" : undefined}
      action={
        <input
          type="text"
          value={cid}
          onChange={(e) => setSettings((s) => ({
            ...s,
            clarity_project_ids: { ...(s.clarity_project_ids ?? {}), [lang.value]: e.target.value },
          }))}
          placeholder="Project ID"
          className="w-36 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
        />
      }
    />
  );
})}
```

Remove the old single `clarity_project_id` row. Keep the `clarity_api_token` row (token is shared across projects since the JWT is per-account, not per-project).

**Step 4: Verify build**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npm run build 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add src/app/settings/
git commit -m "feat: per-language Clarity project IDs in settings"
```

---

### Task 2: Clarity Injection — Use Per-Language Project ID

**Files:**
- Modify: `src/lib/cloudflare-pages.ts:427-443` (injectPageAnalytics reads clarityProjectId)
- Modify: `src/app/api/ab-tests/[id]/publish/route.ts:76` (pass per-language Clarity ID)
- Modify: `src/app/api/publish/route.ts` (pass per-language Clarity ID — check this file)

**Step 1: Update AB test publish route to use per-language Clarity ID**

In `src/app/api/ab-tests/[id]/publish/route.ts`, line 76, change:

```typescript
// OLD
clarityProjectId: (appSettings.clarity_project_id as string) || undefined,

// NEW — prefer per-language, fall back to global
clarityProjectId:
  (appSettings.clarity_project_ids as Record<string, string>)?.[test.language] ||
  (appSettings.clarity_project_id as string) ||
  undefined,
```

**Step 2: Update regular page publish route similarly**

Find the publish route for regular pages (`src/app/api/publish/route.ts` or wherever it loads `clarity_project_id`). Apply same pattern: prefer `clarity_project_ids[language]`, fall back to `clarity_project_id`.

**Step 3: Verify build**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add src/lib/cloudflare-pages.ts src/app/api/
git commit -m "feat: inject per-language Clarity project ID at publish"
```

---

### Task 3: Clarity API — Fetch From Multiple Projects

**Files:**
- Modify: `src/lib/clarity.ts` (fetch from multiple projects, merge)
- Modify: `src/app/api/analytics/page-metrics/route.ts` (pass clarity_project_ids)

**Step 1: Update fetchClarityInsights to accept multiple project IDs**

In `src/lib/clarity.ts`, change the signature to accept a map of project IDs:

```typescript
export async function fetchClarityInsights(
  apiToken: string,
  clarityProjectIds: Record<string, string>, // { sv: "xxx", da: "yyy" }
  numDays: number = 3
): Promise<ClarityInsight[]> {
```

For each project ID, make a separate API call and merge all results. Cache key should include all project IDs (or just use `numDays` as before since we always fetch all).

The Clarity export API is per-account (the JWT `sub` identifies the account), not per-project. But the response only includes data for the project the token was generated for. We need to check if one token works across projects. If not, we'll need per-project tokens.

**Important**: First test if the existing JWT token works for all projects by checking the `sub` claim. If the token is account-scoped, one token should work for all projects under the same account.

If the token IS per-project (likely based on the Clarity docs), then we need per-language API tokens too. For now, assume the token is account-level and test.

**Step 2: Update the analytics page-metrics route to pass the map**

In the route that calls `fetchClarityInsights`, pass `clarity_project_ids` from app_settings instead of a single ID.

**Step 3: Verify build**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add src/lib/clarity.ts src/app/api/analytics/
git commit -m "feat: fetch Clarity insights from multiple projects"
```

---

### Task 4: Fix AB Test Conversion Matching

This is the critical bug — conversions never match because the code relies on translation `published_url` which can be overwritten by standalone publishing.

**Files:**
- Modify: `src/lib/shopify.ts:276-334` (getConversionsForTest)

**Step 1: Rewrite getConversionsForTest to use AB test slug**

Replace the current implementation that fetches translation `published_url` with one that uses the AB test's own `slug` and `router_url` to derive variant paths. The URL pattern is always `/{slug}/a/` and `/{slug}/b/`.

```typescript
export async function getConversionsForTest(
  testId: string,
  since: string
): Promise<Array<{ variant: string; shopifyOrderId: string; revenue: number; currency: string }>> {
  const { createServerSupabase } = await import("./supabase");
  const db = createServerSupabase();

  // Get the AB test slug — paths are always /{slug}/a/ and /{slug}/b/
  const { data: test } = await db
    .from("ab_tests")
    .select("slug")
    .eq("id", testId)
    .single();

  if (!test?.slug) return [];

  const controlPath = `/${test.slug}/a`;
  const variantPath = `/${test.slug}/b`;

  // Fetch orders and match landing_site path to variant
  const orders = await fetchOrdersSince(since);
  const conversions: Array<{ variant: string; shopifyOrderId: string; revenue: number; currency: string }> = [];

  for (const order of orders) {
    if (!order.landing_site) continue;
    try {
      const url = new URL(order.landing_site, "https://placeholder.com");
      const orderPath = url.pathname.replace(/\/$/, "");

      let variant: string | null = null;
      if (orderPath === controlPath) variant = "a";
      else if (orderPath === variantPath) variant = "b";

      // Also check UTM params as fallback (utm_campaign=testId, utm_content=a|b)
      if (!variant) {
        const utmCampaign = url.searchParams.get("utm_campaign");
        const utmContent = url.searchParams.get("utm_content");
        if (utmCampaign === testId && (utmContent === "a" || utmContent === "b")) {
          variant = utmContent;
        }
      }

      if (variant) {
        conversions.push({
          variant,
          shopifyOrderId: order.id,
          revenue: parseFloat(order.total_price) || 0,
          currency: order.currency,
        });
      }
    } catch {
      // Skip malformed URLs
    }
  }

  return conversions;
}
```

Key changes:
1. Uses AB test `slug` directly instead of translation `published_url`
2. Adds UTM fallback matching (`utm_campaign=testId`, `utm_content=a|b`)
3. Simpler, more resilient — doesn't break when translations are re-published

**Step 2: Verify build**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add src/lib/shopify.ts
git commit -m "fix: AB test conversion matching uses test slug instead of translation URL"
```

---

### Task 5: Auto-Sync AB Test Conversions in Pipeline Cron

**Files:**
- Modify: `src/app/api/cron/pipeline-push/route.ts` (add AB conversion sync step)

**Step 1: Add AB test conversion sync after pipeline metrics sync**

After the existing Step 1 (sync pipeline metrics) and before Step 2 (push queued concepts), add a new step that syncs conversions for all active AB tests:

```typescript
// Step 1.5: Sync AB test conversions from Shopify
if (isShopifyConfigured()) {
  console.log("[Pipeline Cron] Syncing AB test conversions...");
  const { data: activeTests } = await db
    .from("ab_tests")
    .select("id, created_at")
    .eq("status", "active");

  for (const test of activeTests ?? []) {
    try {
      const conversions = await getConversionsForTest(test.id, test.created_at);
      if (conversions.length > 0) {
        await db
          .from("ab_conversions")
          .upsert(
            conversions.map((c) => ({
              test_id: test.id,
              variant: c.variant,
              shopify_order_id: c.shopifyOrderId,
              revenue: c.revenue,
              currency: c.currency,
            })),
            { onConflict: "test_id,shopify_order_id", ignoreDuplicates: true }
          );
        console.log(`[Pipeline Cron] AB test ${test.id}: synced ${conversions.length} conversions`);
      }
    } catch (err) {
      console.error(`[Pipeline Cron] AB test ${test.id} sync failed:`, err);
    }
  }
}
```

Add imports at the top:
```typescript
import { getConversionsForTest, isShopifyConfigured } from "@/lib/shopify";
```

**Step 2: Verify build**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add src/app/api/cron/pipeline-push/route.ts
git commit -m "feat: auto-sync AB test conversions in daily pipeline cron"
```

---

### Task 6: Async IP Opt-Out (Non-Blocking)

**Files:**
- Modify: `src/lib/cloudflare-pages.ts:381-421` (injectOptOutScript)

**Step 1: Replace synchronous XMLHttpRequest with async fetch**

Change the opt-out script to use async fetch. On first visit without cookie, let tracking fire immediately, then check IP async and set cookie for future visits. One tracked visit from an excluded IP is acceptable.

```typescript
function injectOptOutScript(html: string, hubUrl?: string, excludedIps?: string[]): string {
  if (html.includes('data-cc-optout="true"')) return html;
  const ips = JSON.stringify(excludedIps ?? []);
  const apiUrl = hubUrl ? JSON.stringify(hubUrl + "/api/tracking-optout") : "null";
  const script = `<script data-cc-optout="true">
(function(){
  var c=document.cookie;
  if(c.indexOf('_ch_optout=1')!==-1){window.__chOptout=true;return}
  if(c.indexOf('_ch_optout=0')!==-1){return}
  var p=new URLSearchParams(location.search);
  if(p.get('_ch_optout')==='1'){
    document.cookie='_ch_optout=1;path=/;max-age=31536000;SameSite=Lax';
    window.__chOptout=true;return;
  }else if(p.get('_ch_optout')==='0'){
    document.cookie='_ch_optout=0;path=/;max-age=31536000;SameSite=Lax';
    return;
  }
  var ips=${ips};var api=${apiUrl};
  if(ips.length>0&&api){
    fetch(api).then(function(r){return r.json()}).then(function(d){
      if(d.optout){
        document.cookie='_ch_optout=1;path=/;max-age=31536000;SameSite=Lax';
      }else{
        document.cookie='_ch_optout=0;path=/;max-age=31536000;SameSite=Lax';
      }
    }).catch(function(){});
  }
})();
</script>`;
  return html.replace(/<\/head>/i, script + "</head>");
}
```

Key change: `fetch()` is async — page doesn't block. Cookie is set for future visits. First visit from excluded IP gets tracked once (negligible impact).

**Step 2: Verify build**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add src/lib/cloudflare-pages.ts
git commit -m "perf: async IP opt-out check (no longer blocks page load)"
```

---

### Task 7: Verify & Manual Test

**Step 1: Run the dev server**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npm run dev
```

**Step 2: Verify Settings page**

- Go to Settings → Integrations
- Confirm per-language Clarity project ID inputs appear (sv, da, no)
- Confirm GA4 per-language inputs still work
- Enter test Clarity project IDs and save

**Step 3: Test AB test conversion sync manually**

Call the sync-conversions endpoint for the existing snarkning test:
```bash
curl -X POST "http://localhost:3000/api/ab-tests/aeea952e-3d83-4e2e-814d-852499e5cc30/sync-conversions"
```

Verify it finds conversions (if any Shopify orders have `landing_site` matching `/snarkning/a` or `/snarkning/b`).

**Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix: address any issues found during manual testing"
```

---

## Execution Notes

- **Tasks 1-3** (Clarity per-language) are related and should be done together
- **Task 4** (conversion matching) is the highest-impact fix — can be done independently
- **Task 5** (cron sync) depends on Task 4
- **Task 6** (async opt-out) is independent
- **User action**: After deployment, create Clarity projects for each domain and enter IDs in Settings
- **Republish pages**: After Clarity IDs are configured, republish active pages to inject the correct per-domain Clarity tags
