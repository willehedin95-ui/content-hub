# Launch Pad Market Tabs — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the global launch pad queue with per-market tabs, each with independent priority ordering, SEK currency, concept numbering, and budget increase confirmation.

**Architecture:** Add `launchpad_priority` column to `image_job_markets` table for per-market ordering of image concepts. Add `launchpad_market_priorities` JSONB column to `video_jobs` for video concepts. Replace the "All/Images/Videos" tabs with NO/DK/SE market tabs. Show one budget card per selected market. All currency displayed as SEK.

**Tech Stack:** Next.js (App Router), Supabase (PostgREST + Management API for DDL), React state, Meta Marketing API

---

### Task 1: Database Migration — Add per-market priority columns

**Files:**
- DDL via Supabase Management API (no file)

**Step 1: Add `launchpad_priority` column to `image_job_markets`**

Run via Supabase Management API:
```sql
ALTER TABLE image_job_markets ADD COLUMN launchpad_priority integer;
```

**Step 2: Add `launchpad_market_priorities` column to `video_jobs`**

```sql
ALTER TABLE video_jobs ADD COLUMN launchpad_market_priorities jsonb;
```

**Step 3: Migrate existing image concept priorities**

Copy current global `image_jobs.launchpad_priority` to all `image_job_markets` rows for that concept that are in "launchpad" stage:

```sql
UPDATE image_job_markets ijm
SET launchpad_priority = ij.launchpad_priority
FROM image_jobs ij
WHERE ijm.image_job_id = ij.id
  AND ij.launchpad_priority IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM concept_lifecycle cl
    WHERE cl.image_job_market_id = ijm.id
      AND cl.stage = 'launchpad'
      AND cl.exited_at IS NULL
  );
```

**Step 4: Migrate existing video concept priorities**

For video concepts on the launchpad, build per-market priorities from current global priority and target_languages:

```sql
UPDATE video_jobs
SET launchpad_market_priorities = (
  SELECT jsonb_object_agg(
    CASE lang
      WHEN 'sv' THEN 'SE'
      WHEN 'da' THEN 'DK'
      WHEN 'no' THEN 'NO'
      WHEN 'de' THEN 'DE'
    END,
    launchpad_priority
  )
  FROM jsonb_array_elements_text(to_jsonb(target_languages)) AS lang
)
WHERE launchpad_priority IS NOT NULL
  AND target_languages IS NOT NULL;
```

**Step 5: Verify migration**

Query to confirm data migrated correctly:
```sql
SELECT ij.id, ij.name, ij.launchpad_priority AS global_priority,
       ijm.market, ijm.launchpad_priority AS market_priority
FROM image_jobs ij
JOIN image_job_markets ijm ON ijm.image_job_id = ij.id
WHERE ij.launchpad_priority IS NOT NULL
ORDER BY ij.launchpad_priority;
```

---

### Task 2: Fix currency — always return SEK

**Files:**
- Modify: `src/lib/pipeline.ts:1551-1570` (calcForFormat function)
- Modify: `src/lib/pipeline.ts:1606-1616` (result assembly)

**Step 1: Hardcode SEK currency in `calculateAvailableBudget()`**

In `src/lib/pipeline.ts`, in the `calcForFormat` function (line ~1562), change:
```typescript
currency: currencyMap.get(country) ?? "SEK",
```
to:
```typescript
currency: "SEK",
```

Do the same in the result assembly (line ~1611):
```typescript
currency: "SEK",
```

This applies to both the per-format `FormatBudgetInfo` and the combined budget info.

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```
feat(launchpad): always show SEK currency for all markets
```

---

### Task 3: Update `getLaunchpadConcepts()` to return per-market priorities

**Files:**
- Modify: `src/lib/pipeline.ts:1626-1807`

**Step 1: Change return type to include per-market priority**

Update the return type to add `marketPriorities`:

```typescript
export async function getLaunchpadConcepts(): Promise<
  Array<{
    conceptId: string;
    type: "image" | "video";
    name: string;
    conceptNumber: number | null;
    source: string;
    product: string | null;
    thumbnailUrl: string | null;
    priority: number; // Keep for backward compat (global, used by cron as fallback)
    marketPriorities: Record<string, number>; // NEW: { "NO": 1, "SE": 3, "DK": 2 }
    markets: Array<{
      market: string;
      imageJobMarketId: string;
      stage: PipelineStage;
    }>;
    imageJobId: string;
  }>
> {
```

**Step 2: Fetch `launchpad_priority` from `image_job_markets`**

In the image markets query (line ~1658), add `launchpad_priority` to the select:

```typescript
const { data: imageMarkets } = imageJobIds.length > 0
  ? await db
      .from("image_job_markets")
      .select("id, image_job_id, market, launchpad_priority")
      .in("image_job_id", imageJobIds)
  : { data: [] as { id: string; image_job_id: string; market: string; launchpad_priority: number | null }[] };
```

**Step 3: Build `marketPriorities` for image concepts**

In the `imageConcepts` mapping (line ~1696), add:

```typescript
const marketPriorities: Record<string, number> = {};
for (const m of jobMarkets) {
  if (m.launchpad_priority != null) {
    marketPriorities[m.market] = m.launchpad_priority;
  }
}
```

Add `marketPriorities` to the returned object.

**Step 4: Build `marketPriorities` for video concepts**

In the video concepts section, fetch from `launchpad_market_priorities`:

```typescript
const { data: videoJobs } = await db
  .from("video_jobs")
  .select("id, concept_name, concept_number, product, target_languages, launchpad_priority, launchpad_market_priorities")
  .not("launchpad_priority", "is", null)
  .order("launchpad_priority", { ascending: true });
```

In `videoConcepts` mapping, add:

```typescript
marketPriorities: (job.launchpad_market_priorities as Record<string, number>) ?? {},
```

**Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 6: Commit**

```
feat(launchpad): return per-market priorities from getLaunchpadConcepts
```

---

### Task 4: Update reorder API to be market-scoped

**Files:**
- Modify: `src/app/api/launchpad/reorder/route.ts`

**Step 1: Accept `market` parameter and update per-market priority**

Replace the entire `POST` handler:

```typescript
export async function POST(req: NextRequest) {
  const body = await req.json();
  const market: string | undefined = body.market;

  const order: Array<{ conceptId: string; type: "image" | "video" }> = Array.isArray(body.order)
    ? body.order.map((item: string | { conceptId: string; type: "image" | "video" }) =>
        typeof item === "string"
          ? { conceptId: item, type: "image" as const }
          : item
      )
    : [];

  if (order.length === 0) {
    return NextResponse.json({ error: "order array required" }, { status: 400 });
  }

  const db = createServerSupabase();

  if (market) {
    // Per-market reorder (new behavior)
    const MARKET_TO_LANG: Record<string, string> = { NO: "no", DK: "da", SE: "sv", DE: "de" };

    for (let i = 0; i < order.length; i++) {
      const { conceptId, type } = order[i];
      const priority = i + 1;

      if (type === "image") {
        // Update image_job_markets.launchpad_priority for this market
        await db
          .from("image_job_markets")
          .update({ launchpad_priority: priority })
          .eq("image_job_id", conceptId)
          .eq("market", market);
      } else {
        // Update video_jobs.launchpad_market_priorities JSONB
        const { data: job } = await db
          .from("video_jobs")
          .select("launchpad_market_priorities")
          .eq("id", conceptId)
          .single();

        const priorities = (job?.launchpad_market_priorities as Record<string, number>) ?? {};
        priorities[market] = priority;

        await db
          .from("video_jobs")
          .update({ launchpad_market_priorities: priorities })
          .eq("id", conceptId);
      }
    }
  } else {
    // Legacy global reorder (backward compat for cron/other callers)
    for (let i = 0; i < order.length; i++) {
      const { conceptId, type } = order[i];
      const table = type === "video" ? "video_jobs" : "image_jobs";
      await db
        .from(table)
        .update({ launchpad_priority: i + 1 })
        .eq("id", conceptId);
    }
  }

  return NextResponse.json({ success: true });
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```
feat(launchpad): market-scoped reorder API
```

---

### Task 5: Update push API to accept single market

**Files:**
- Modify: `src/app/api/launchpad/push/route.ts`

**Step 1: Accept `market` parameter instead of pushing all markets**

The push route (line 21) already supports a `markets` array from the body. Currently the client sends `{ conceptId, type }` and the API defaults to all markets. Update the client to send `{ conceptId, type, markets: ["NO"] }` — but the API already handles this. No API change needed.

The client will pass `markets: [selectedMarket]` in the push call.

**Step 2: Commit** (if any change was needed, otherwise skip)

---

### Task 6: Update cron to use per-market priorities

**Files:**
- Modify: `src/app/api/cron/pipeline-push/route.ts:104`

**Step 1: Sort concepts by per-market priority when iterating**

In the cron (line ~104), when iterating concepts for a market, sort by `marketPriorities[market]` instead of global `priority`:

Replace:
```typescript
for (const concept of launchpadConcepts) {
```

With:
```typescript
// Sort concepts by this market's priority (fall back to global priority)
const sortedConcepts = [...launchpadConcepts].sort((a, b) => {
  const aPrio = a.marketPriorities?.[market] ?? a.priority;
  const bPrio = b.marketPriorities?.[market] ?? b.priority;
  return aPrio - bPrio;
});

for (const concept of sortedConcepts) {
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```
feat(launchpad): cron uses per-market priority ordering
```

---

### Task 7: Update POST/DELETE routes for per-market priority

**Files:**
- Modify: `src/app/api/launchpad/route.ts`

**Step 1: Update POST (add to launchpad) to set per-market priority**

When adding an image concept to the launchpad, after creating lifecycle entries (line ~132), also set `launchpad_priority` on each `image_job_markets` row:

After the lifecycle insert loop, add:
```typescript
// Set per-market launchpad priority
for (const market of markets ?? []) {
  // Get next priority for this market
  const { data: maxPriority } = await db
    .from("image_job_markets")
    .select("launchpad_priority")
    .eq("market", (await db.from("image_job_markets").select("market").eq("id", market.id).single()).data?.market ?? "")
    .not("launchpad_priority", "is", null)
    .order("launchpad_priority", { ascending: false })
    .limit(1)
    .single();

  await db
    .from("image_job_markets")
    .update({ launchpad_priority: (maxPriority?.launchpad_priority ?? 0) + 1 })
    .eq("id", market.id);
}
```

Simplify by fetching market info in the loop:
```typescript
// Set per-market launchpad priorities
const { data: marketRows } = await db
  .from("image_job_markets")
  .select("id, market")
  .eq("image_job_id", conceptId);

for (const row of marketRows ?? []) {
  const { data: maxPrio } = await db
    .from("image_job_markets")
    .select("launchpad_priority")
    .eq("market", row.market)
    .not("launchpad_priority", "is", null)
    .order("launchpad_priority", { ascending: false })
    .limit(1)
    .single();

  await db
    .from("image_job_markets")
    .update({ launchpad_priority: (maxPrio?.launchpad_priority ?? 0) + 1 })
    .eq("id", row.id);
}
```

For video concepts, also set `launchpad_market_priorities`:
```typescript
const langs = (job.target_languages as string[]) ?? [];
const LANG_TO_MARKET: Record<string, string> = { sv: "SE", da: "DK", no: "NO", de: "DE" };
const marketPriorities: Record<string, number> = {};

for (const lang of langs) {
  const market = LANG_TO_MARKET[lang];
  if (!market) continue;
  // Use same priority for all markets when first adding
  marketPriorities[market] = nextPriority;
}

await db
  .from("video_jobs")
  .update({ launchpad_priority: nextPriority, launchpad_market_priorities: marketPriorities })
  .eq("id", conceptId);
```

**Step 2: Update DELETE (remove from launchpad) to clear per-market priority**

For image concepts, clear `launchpad_priority` on `image_job_markets`:
```typescript
await db
  .from("image_job_markets")
  .update({ launchpad_priority: null })
  .eq("image_job_id", conceptId);
```

For video concepts, clear `launchpad_market_priorities`:
```typescript
await db
  .from("video_jobs")
  .update({ launchpad_priority: null, launchpad_market_priorities: null })
  .eq("id", conceptId);
```

**Step 3: Verify**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```
feat(launchpad): set per-market priorities on add/remove
```

---

### Task 8: Rewrite LaunchpadClient with market tabs

**Files:**
- Modify: `src/app/launchpad/LaunchpadClient.tsx`

This is the main UI change. Key modifications:

**Step 1: Replace type filter state with market tab state**

Replace:
```typescript
const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
```
With:
```typescript
const [selectedMarket, setSelectedMarket] = useState<string>("SE"); // Default to SE (main market)
const [confirmBudget, setConfirmBudget] = useState<{ market: string; budget: BudgetInfo; conceptsNeeded: number } | null>(null);
```

**Step 2: Update concept filtering — filter by selected market + sort by market priority**

Replace the concept filtering block (lines 324-333) with:

```typescript
const allConcepts = data?.concepts ?? [];
const budgets = data?.budgets ?? {};

// Concepts for the selected market tab — only those in "launchpad" stage for this market
const marketConcepts = allConcepts
  .filter((c) => c.markets.some((m) => m.market === selectedMarket && m.stage === "launchpad"))
  .sort((a, b) => {
    const aPrio = a.marketPriorities?.[selectedMarket] ?? a.priority;
    const bPrio = b.marketPriorities?.[selectedMarket] ?? b.priority;
    return aPrio - bPrio;
  });

const selectedBudget = budgets[selectedMarket];
```

**Step 3: Replace type filter tabs with market tabs**

Replace the entire tabs section (lines 392-414) with:

```tsx
<div className="flex items-center gap-1 mb-4">
  {MARKETS.map((market) => {
    const flag = MARKET_FLAG[market];
    const count = allConcepts.filter((c) =>
      c.markets.some((m) => m.market === market && m.stage === "launchpad")
    ).length;
    return (
      <button
        key={market}
        onClick={() => setSelectedMarket(market)}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          selectedMarket === market
            ? "bg-indigo-100 text-indigo-700"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        }`}
      >
        {flag} {market} ({count})
      </button>
    );
  })}
</div>
```

**Step 4: Replace 3-column budget grid with single budget card**

Replace the entire budget indicators section (lines 417-502) with a single card for `selectedBudget`:

```tsx
{selectedBudget && (
  <div className={`border rounded-xl p-4 mb-6 ${budgetColorClass(selectedBudget.canPush)}`}>
    <div className="flex items-center justify-between mb-1.5">
      <p className={`text-lg font-bold ${budgetTextClass(selectedBudget.canPush)}`}>
        {Math.min(selectedBudget.canPush, MAX_CONCEPTS_PER_BATCH)} new concept{Math.min(selectedBudget.canPush, MAX_CONCEPTS_PER_BATCH) !== 1 ? "s" : ""}/day
      </p>
      <span className="text-xs text-gray-400 font-medium">
        {selectedBudget.campaignBudget} SEK/day
      </span>
    </div>
    <p className="text-xs text-gray-500">
      {selectedBudget.available} SEK compressible from {selectedBudget.activeAdSets} active ad set{selectedBudget.activeAdSets !== 1 ? "s" : ""}
    </p>
    {/* Per-format breakdown */}
    {selectedBudget.image.campaignBudget > 0 && selectedBudget.video.campaignBudget > 0 && (
      <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
        <span>Images: {selectedBudget.image.canPush}</span>
        <span>Videos: {selectedBudget.video.canPush}</span>
      </div>
    )}
    {/* Budget increase button with confirmation */}
    {(() => {
      const queuedForMarket = marketConcepts.length;
      const effectiveCanPush = selectedBudget.canPush;
      const needsMore = queuedForMarket > 0 && effectiveCanPush < Math.min(queuedForMarket, MAX_CONCEPTS_PER_BATCH);
      if (!needsMore || selectedBudget.campaignIds.length === 0) return null;
      const conceptsNeeded = Math.min(queuedForMarket, MAX_CONCEPTS_PER_BATCH) - effectiveCanPush;
      const extraBudget = conceptsNeeded * BUDGET_PER_NEW_CONCEPT;
      return (
        <button
          onClick={() => setConfirmBudget({ market: selectedMarket, budget: selectedBudget, conceptsNeeded })}
          disabled={increasingBudget === selectedMarket}
          className="mt-2 w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          {increasingBudget === selectedMarket ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <TrendingUp className="w-3.5 h-3.5" />
          )}
          +{extraBudget} SEK/day for {conceptsNeeded} more concept{conceptsNeeded !== 1 ? "s" : ""}
        </button>
      );
    })()}
  </div>
)}
```

**Step 5: Add confirmation dialog for budget increase**

Add at the end of the component (before the closing `</div>`):

```tsx
{/* Budget increase confirmation dialog */}
{confirmBudget && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
    <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
      <h3 className="text-base font-semibold text-gray-900 mb-2">Increase daily budget?</h3>
      <p className="text-sm text-gray-600 mb-4">
        This will add {confirmBudget.conceptsNeeded * BUDGET_PER_NEW_CONCEPT} SEK/day to your {confirmBudget.market} campaigns
        ({Math.round((confirmBudget.conceptsNeeded * BUDGET_PER_NEW_CONCEPT) / confirmBudget.budget.campaignIds.length)} SEK/day each across {confirmBudget.budget.campaignIds.length} campaign{confirmBudget.budget.campaignIds.length !== 1 ? "s" : ""}).
      </p>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setConfirmBudget(null)}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            const { market, budget, conceptsNeeded } = confirmBudget;
            setConfirmBudget(null);
            await handleIncreaseBudget(market, budget, conceptsNeeded);
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors"
        >
          Yes, increase
        </button>
      </div>
    </div>
  </div>
)}
```

**Step 6: Update concept list — numbering + single-market push**

In the concept list rendering (line ~522), replace `concepts` with `marketConcepts` and update the card:

- Change the priority badge to show `#N` as part of the name:
```tsx
<p className="text-sm font-semibold text-gray-900 truncate">
  <span className="text-indigo-600">#{index + 1}</span>
  <span className="text-gray-300 mx-1">·</span>
  {concept.name}
</p>
```

- Remove the separate priority number circle div

- Simplify the push button to just "Push" (no market names):
```tsx
<button
  onClick={() => handlePush(concept)}
  ...
>
  {pushingId === concept.conceptId ? "Pushing..." : "Push"}
</button>
```

- Market status badges: only show "Ready to push" for the selected market (no need to list all markets since we're on that tab)

**Step 7: Update `handleReorder` to pass market**

```typescript
async function handleReorder(index: number, direction: "up" | "down") {
  const newOrder = [...marketConcepts];
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= newOrder.length) return;

  [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];

  setReordering(true);

  try {
    const res = await fetch("/api/launchpad/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        market: selectedMarket,
        order: newOrder.map((c) => ({ conceptId: c.conceptId, type: c.type })),
      }),
    });
    if (!res.ok) throw new Error("Reorder failed");
    await fetchData();
  } catch (err) {
    console.error("Reorder error:", err);
    setError(err instanceof Error ? err.message : "Failed to reorder");
    await fetchData();
  } finally {
    setReordering(false);
  }
}
```

**Step 8: Update `handlePush` to pass single market**

In `handlePush`, send the selected market:
```typescript
body: JSON.stringify({
  conceptId: concept.conceptId,
  type: concept.type,
  markets: [selectedMarket],
}),
```

**Step 9: Update the `LaunchpadConcept` type to include `marketPriorities`**

```typescript
interface LaunchpadConcept {
  // ... existing fields
  marketPriorities: Record<string, number>;
}
```

**Step 10: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 11: Test manually**

1. Open `/launchpad` — should see NO/DK/SE tabs
2. Click each tab — concepts should filter to that market's queue
3. Budget card shows single market budget in SEK
4. Reorder concepts within a market — should only affect that market's order
5. Click Push — should push only for the selected market
6. Click budget increase — should show confirmation dialog first

**Step 12: Commit**

```
feat(launchpad): market tabs with per-market priority, SEK currency, budget confirmation
```

---

### Task 9: Update API response type for LaunchpadData

**Files:**
- Modify: `src/app/api/launchpad/route.ts`

**Step 1: Ensure the GET response includes `marketPriorities`**

The `getLaunchpadConcepts()` function already returns `marketPriorities` after Task 3. The API just passes it through, so no change needed here — but verify the client type matches.

**Step 2: Verify end-to-end**

Start dev server, open `/launchpad`, check browser console for any type mismatches or API errors.

---

### Task 10: Final cleanup — remove unused global priority references

**Files:**
- Review: `src/lib/pipeline.ts` — `image_jobs.launchpad_priority` still needed for backward compat (cron fallback, POST handler)
- Keep `image_jobs.launchpad_priority` and `video_jobs.launchpad_priority` — they serve as fallback ordering and as the "is this on the launchpad?" indicator (NOT NULL = on launchpad)

No columns to remove. The global priority columns stay as the "launchpad membership" flag and fallback sort.

**Step 1: Commit any remaining changes**

```
chore(launchpad): cleanup after market tabs migration
```
