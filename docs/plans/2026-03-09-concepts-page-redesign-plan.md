# Concepts Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Concepts list page into a clean work queue with thumbnails, simplified columns, manual archive, and status-by-furthest-behind-market.

**Architecture:** Modify the existing `src/app/images/page.tsx` table view. Add `archived_at` column to `image_jobs`. Update the API to filter archived by default. Derive thumbnails from already-fetched `source_images[0].image_translations` data (no new query needed). Update status logic to consider per-market progress.

**Tech Stack:** Next.js, Supabase (Postgres), Tailwind CSS, React

---

### Task 1: Add `archived_at` column to `image_jobs`

**Files:**
- No code files — Supabase DDL via Management API

**Step 1: Run migration**

```bash
curl -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;"}'
```

Expected: 200 OK

**Step 2: Verify column exists**

```bash
curl -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''image_jobs'\'' AND column_name = '\''archived_at'\'';"}'
```

Expected: Returns one row with `archived_at`, `timestamp with time zone`

**Step 3: Commit** — no code change, just note in commit message

---

### Task 2: Update API to filter archived concepts

**Files:**
- Modify: `src/app/api/image-jobs/route.ts`

**Step 1: Update GET handler to filter by archived status**

In `src/app/api/image-jobs/route.ts`, the GET handler's main query (line 28-33) and count query (line 34-35) need an `archived` filter. Add a query param `?archived=true` to show only archived; default is to hide archived.

Replace the `Promise.all` block (lines 28-41) with:

```typescript
  const showArchived = url.searchParams.get("archived") === "true";

  const [jobsResult, countResult, campaignsResult] = await Promise.all([
    (() => {
      let q = db
        .from("image_jobs")
        .select(`*, source_images(id, filename, original_url, skip_translation, image_translations(id, language, status, aspect_ratio, translated_url, active_version_id, updated_at))`)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (showArchived) {
        q = q.not("archived_at", "is", null);
      } else {
        q = q.is("archived_at", null);
      }
      return q;
    })(),
    (() => {
      let q = db
        .from("image_jobs")
        .select("id", { count: "exact", head: true });
      if (showArchived) {
        q = q.not("archived_at", "is", null);
      } else {
        q = q.is("archived_at", null);
      }
      return q;
    })(),
    db
      .from("meta_campaigns")
      .select("image_job_id, countries, language, status")
      .not("image_job_id", "is", null),
  ]);
```

**Step 2: Verify by running dev server and loading concepts page**

```bash
curl http://localhost:3000/api/image-jobs?page=1&limit=5 | jq '.total'
```

Expected: Returns total count of non-archived concepts (same as before since none are archived yet)

**Step 3: Commit**

```bash
git add src/app/api/image-jobs/route.ts
git commit -m "feat: filter archived concepts from image-jobs API"
```

---

### Task 3: Add archive/unarchive API endpoint

**Files:**
- Create: `src/app/api/image-jobs/archive/route.ts`

**Step 1: Create the archive endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  const { ids, action } = (await req.json()) as {
    ids: string[];
    action: "archive" | "unarchive";
  };

  if (!ids?.length) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const db = createServerSupabase();
  const { error } = await db
    .from("image_jobs")
    .update({ archived_at: action === "archive" ? new Date().toISOString() : null })
    .in("id", ids);

  if (error) return safeError(error, "Failed to update archive status");

  return NextResponse.json({ ok: true, count: ids.length });
}
```

**Step 2: Verify endpoint**

```bash
# Test with a dummy ID (should succeed with 0 affected rows)
curl -X POST http://localhost:3000/api/image-jobs/archive \
  -H "Content-Type: application/json" \
  -d '{"ids": ["00000000-0000-0000-0000-000000000000"], "action": "archive"}'
```

Expected: `{"ok": true, "count": 1}`

**Step 3: Commit**

```bash
git add src/app/api/image-jobs/archive/route.ts
git commit -m "feat: add archive/unarchive API endpoint"
```

---

### Task 4: Add thumbnail helper function

**Files:**
- Modify: `src/lib/concept-status.ts`

**Step 1: Add `getConceptThumbnail` function**

At the bottom of `src/lib/concept-status.ts`, add:

```typescript
/**
 * Get the best thumbnail URL for a concept.
 * Priority: first completed translated image → first source image → null.
 */
export function getConceptThumbnail(job: ImageJob): string | null {
  const sourceImages = job.source_images ?? [];
  if (sourceImages.length === 0) return null;

  // Try first source image's first completed translation
  for (const si of sourceImages) {
    for (const t of si.image_translations ?? []) {
      if (t.status === "completed" && t.translated_url) {
        return t.translated_url;
      }
    }
  }

  // Fallback: first source image original
  return sourceImages[0]?.original_url ?? null;
}
```

Also add `ImageJob` to the import at the top of the file (line 1):

```typescript
import { ImageJob, Language, MetaCampaignStatus } from "@/types";
```

**Step 2: Commit**

```bash
git add src/lib/concept-status.ts
git commit -m "feat: add getConceptThumbnail helper"
```

---

### Task 5: Redesign the table in the concepts page

**Files:**
- Modify: `src/app/images/page.tsx`

This is the main UI change. The full rewrite of the table section.

**Step 1: Update imports**

At the top of `src/app/images/page.tsx`, update the imports:

- Add `Archive, ArchiveRestore` to the lucide-react import (add alongside existing icons)
- Add `getConceptThumbnail` to the concept-status import:
  ```typescript
  import { getLanguageStatus, getMarketStatus, getWizardStep, getOverallStatus, COUNTRY_FLAGS, getConceptThumbnail } from "@/lib/concept-status";
  ```
- Add `Image as NextImage` from `next/image` (for optimized thumbnail rendering):
  ```typescript
  import NextImage from "next/image";
  ```

**Step 2: Add archive state and fetch logic**

After the existing state declarations (around line 67), add:

```typescript
const [showArchived, setShowArchived] = useState(false);
const [archiving, setArchiving] = useState(false);
```

Update `fetchJobs` (line 108-119) to pass archive filter:

```typescript
const fetchJobs = useCallback(async (p = page) => {
  try {
    const archiveParam = showArchived ? "&archived=true" : "";
    const res = await fetch(`/api/image-jobs?page=${p}&limit=${PAGE_SIZE}${archiveParam}`);
    if (res.ok) {
      const data = await res.json();
      setJobs(data.jobs ?? data);
      if (data.total !== undefined) setTotalCount(data.total);
    }
  } finally {
    setLoading(false);
  }
}, [page, showArchived]);
```

Add archive/unarchive handler after `handleBulkDelete` (around line 195):

```typescript
async function handleArchive(ids: string[], action: "archive" | "unarchive") {
  setArchiving(true);
  try {
    const res = await fetch("/api/image-jobs/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    if (res.ok) {
      setJobs((prev) => prev.filter((j) => !ids.includes(j.id)));
      setTotalCount((n) => Math.max(0, n - ids.length));
      setSelected(new Set());
    }
  } finally {
    setArchiving(false);
  }
}
```

**Step 3: Update the filter bar**

In the filters section (around line 249-336), add an archive toggle after the search input and before the status filter tabs:

```tsx
{/* Archive toggle */}
<button
  onClick={() => { setShowArchived((v) => !v); setPage(1); }}
  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
    showArchived
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "text-gray-400 hover:text-gray-600 border-gray-200 hover:border-gray-300"
  }`}
>
  {showArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
  {showArchived ? "Showing archived" : "Archived"}
</button>
```

**Step 4: Update the bulk action bar**

In the bulk action bar (around line 339-358), add an Archive button alongside the existing Delete button:

```tsx
<button
  onClick={() => handleArchive([...selected], showArchived ? "unarchive" : "archive")}
  disabled={archiving}
  className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 bg-white border border-amber-200 hover:border-amber-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
>
  {archiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
  {showArchived ? "Unarchive" : "Archive"}
</button>
```

**Step 5: Rewrite the table grid**

Replace the table header grid template (line 391) from:
```
grid-cols-[32px_48px_1fr_72px_120px_120px_96px_72px_40px]
```
to:
```
grid-cols-[32px_48px_48px_1fr_80px_140px_100px_64px_40px]
```

This is: checkbox | # | thumbnail | name+tags | product | status | markets | created | actions

Update the table header columns to match:
```tsx
<div className="grid grid-cols-[32px_48px_48px_1fr_80px_140px_100px_64px_40px] items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
  {/* checkbox */}
  <button onClick={toggleSelectAll} className="flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
    {selected.size === filteredJobs.length && filteredJobs.length > 0
      ? <CheckSquare className="w-4 h-4 text-indigo-600" />
      : selected.size > 0
      ? <MinusSquare className="w-4 h-4 text-indigo-600" />
      : <Square className="w-4 h-4" />}
  </button>
  <button onClick={() => toggleSort("concept_number")} className="flex items-center gap-1 group/sort hover:text-gray-700 transition-colors">
    # <SortIcon field="concept_number" />
  </button>
  <div></div> {/* thumbnail — no header */}
  <button onClick={() => toggleSort("name")} className="flex items-center gap-1 group/sort hover:text-gray-700 transition-colors text-left">
    Name <SortIcon field="name" />
  </button>
  <div>Product</div>
  <button onClick={() => toggleSort("status")} className="flex items-center gap-1 group/sort hover:text-gray-700 transition-colors">
    Status <SortIcon field="status" />
  </button>
  <div>Markets</div>
  <button onClick={() => toggleSort("created_at")} className="flex items-center gap-1 group/sort hover:text-gray-700 transition-colors">
    Created <SortIcon field="created_at" />
  </button>
  <div></div>
</div>
```

**Step 6: Rewrite table row**

Update each row's grid template to match, and replace the row content. The key changes:
- Same grid template as header
- Add thumbnail cell after `#`
- Remove the "Translations" column (the flags-with-dots column showing per-language progress)
- Keep the Markets column but simplify it

New row content (replacing lines 431-540):

```tsx
<Link
  key={job.id}
  href={`/images/${job.id}`}
  className={cn(
    "grid grid-cols-[32px_48px_48px_1fr_80px_140px_100px_64px_40px] items-center gap-2 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors group",
    selected.has(job.id) && "bg-indigo-50/50"
  )}
>
  {/* Checkbox */}
  <button
    onClick={(e) => toggleSelect(job.id, e)}
    className="flex items-center justify-center text-gray-300 hover:text-indigo-600 transition-colors"
  >
    {selected.has(job.id)
      ? <CheckSquare className="w-4 h-4 text-indigo-600" />
      : <Square className="w-4 h-4" />}
  </button>

  {/* # */}
  <span className="text-xs font-mono text-gray-400">
    {conceptNum ? String(conceptNum).padStart(3, "0") : "—"}
  </span>

  {/* Thumbnail */}
  <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
    {(() => {
      const thumbUrl = getConceptThumbnail(job);
      return thumbUrl ? (
        <img
          src={thumbUrl}
          alt={job.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-4 h-4 text-gray-300" />
        </div>
      );
    })()}
  </div>

  {/* Name + Tags */}
  <div className="min-w-0">
    <span className="text-sm font-medium text-gray-800 truncate block">{job.name}</span>
    {(job.tags ?? []).length > 0 && (
      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
        {(job.tags ?? []).slice(0, 3).map((tag) => (
          <TagBadge key={tag} tag={tag} />
        ))}
        {(job.tags ?? []).length > 3 && (
          <span className="text-xs text-gray-400">+{(job.tags ?? []).length - 3}</span>
        )}
      </div>
    )}
  </div>

  {/* Product */}
  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full text-center truncate">
    {job.product ? (PRODUCTS.find((p) => p.value === job.product)?.label ?? job.product) : "—"}
  </span>

  {/* Status badge */}
  <span className={`text-xs font-medium px-2 py-1 rounded-full text-center whitespace-nowrap ${status.color}`}>
    {status.label}
  </span>

  {/* Markets */}
  <div className="flex items-center gap-1.5">
    {job.target_languages.map((lang) => {
      const country = COUNTRY_MAP[lang];
      const depStatus = marketStatus.get(country);
      return (
        <span key={country} className="relative inline-flex items-center" title={`${country}: ${depStatus === "pushed" ? "published" : depStatus === "pushing" ? "pushing" : depStatus === "error" ? "error" : "not deployed"}`}>
          <span className={`text-sm ${!depStatus ? "opacity-30" : ""}`} role="img" aria-label={country}>{COUNTRY_FLAGS[country]}</span>
          {depStatus && (
            <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
              depStatus === "pushed" ? "bg-emerald-500" : depStatus === "pushing" ? "bg-blue-500" : depStatus === "error" ? "bg-red-500" : "bg-gray-300"
            }`} />
          )}
        </span>
      );
    })}
  </div>

  {/* Created */}
  <span className="text-xs text-gray-400">{formatDate(job.created_at)}</span>

  {/* Actions */}
  <div className="flex items-center justify-end gap-1">
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleArchive([job.id], showArchived ? "unarchive" : "archive");
      }}
      className="text-gray-300 hover:text-amber-500 p-1 transition-colors opacity-0 group-hover:opacity-100"
      title={showArchived ? "Unarchive" : "Archive"}
    >
      <Archive className="w-3.5 h-3.5" />
    </button>
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(job.id); }}
      className="text-gray-300 hover:text-red-500 p-1 transition-colors opacity-0 group-hover:opacity-100"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
</Link>
```

Note: The existing `langStatus` variable (line 426) is no longer used in the row. Remove it. Keep `marketStatus` and `status` variables.

**Step 7: Remove the Kanban view toggle and board import**

Remove the view toggle buttons (lines 209-224) and the board view rendering (line 386). Remove the `ConceptBoard` import (line 11) and the `viewMode` state (lines 50-55). Remove the `LayoutGrid` and `List` imports from lucide. The page is now table-only.

**Step 8: Update default sort to status-priority**

Replace the sort logic in `filteredJobs` (lines 83-92). Change the default sort to prioritize concepts needing the most work:

```typescript
const STATUS_PRIORITY: Record<string, number> = {
  "New": 0,
  "Step 1/3 · Images": 1,
  "Step 2/3 · Ad Copy": 2,
  "Step 3/3 · Preview": 3,
  "Ready": 4,
  "Published": 5,
};
```

Default `sortField` to `"status"` and `sortDir` to `"asc"`. Update the status sort case:

```typescript
case "status": {
  const aPri = STATUS_PRIORITY[getWizardStep(a).label] ?? 99;
  const bPri = STATUS_PRIORITY[getWizardStep(b).label] ?? 99;
  if (aPri !== bPri) return (aPri - bPri) * dir;
  // Within same status, oldest first
  return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
}
```

**Step 9: Verify the page works**

Run the dev server and navigate to `/images`. Verify:
- Thumbnails show for concepts with translated images
- Grey placeholder shows for concepts without images
- Status badges display correctly
- Archive button works per-row and via bulk select
- "Archived" toggle shows/hides archived concepts
- Default sort puts earliest-step concepts first

**Step 10: Commit**

```bash
git add src/app/images/page.tsx
git commit -m "feat: redesign concepts page with thumbnails, archive, and simplified table"
```

---

### Task 6: Update status logic for per-market awareness

**Files:**
- Modify: `src/lib/concept-status.ts`

**Step 1: Update `getWizardStep` to consider per-market status**

The current `getWizardStep` checks if ANY deployment is "pushed" and returns "Published". We need it to check if ALL target markets are pushed. Replace the `hasPushed` check (lines 111-117):

```typescript
// Check if ALL target markets have been pushed
const pushedCountries = new Set(
  (job.deployments ?? [])
    .filter((d) => d.status === "pushed")
    .map((d) => d.country)
);
const allMarkets = job.target_languages.map((l) => COUNTRY_MAP[l]).filter(Boolean);
const allPushed = allMarkets.length > 0 && allMarkets.every((c) => pushedCountries.has(c));

if (allPushed)
  return {
    step: 3,
    label: "Published",
    color: "text-emerald-700 bg-emerald-50",
  };
```

This requires importing `COUNTRY_MAP` from `@/types`. Add to the import at line 1:

```typescript
import { ImageJob, Language, MetaCampaignStatus, COUNTRY_MAP } from "@/types";
```

Note: If `COUNTRY_MAP` is not exported from `@/types`, check where it's defined (it's used in `page.tsx` line 7) and import from the correct location.

**Step 2: Verify status logic**

Navigate to a concept that's pushed to SE only but has NO/DK as target languages. It should no longer show "Published" — it should show whatever step NO/DK are at.

**Step 3: Commit**

```bash
git add src/lib/concept-status.ts
git commit -m "feat: status shows furthest-behind market step"
```

---

### Task 7: Final cleanup and verification

**Step 1: Remove unused imports**

In `src/app/images/page.tsx`, remove any unused imports after the refactor:
- `ConceptBoard` (if board view removed)
- `LayoutGrid`, `List` (if view toggle removed)
- `getLanguageStatus` (if Translations column removed)

**Step 2: Run build to verify no TypeScript errors**

```bash
cd /Users/williamhedin/Claude\ Code/content-hub && npm run build
```

Expected: Build succeeds with no errors

**Step 3: Manual verification checklist**

- [ ] Concepts page loads without errors
- [ ] Thumbnails display (first translated image)
- [ ] Placeholder shows for concepts without images
- [ ] Status shows furthest-behind market's step
- [ ] Archive per-row works (concept disappears from list)
- [ ] Bulk archive works (select multiple → archive)
- [ ] "Archived" toggle shows archived concepts
- [ ] Unarchive works from archived view
- [ ] Search, status filter, product filter, tag filter all work
- [ ] Default sort: earliest step first, oldest within each step
- [ ] Pagination still works

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: clean up unused imports after concepts page redesign"
```
