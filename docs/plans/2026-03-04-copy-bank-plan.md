# Copy Bank Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save and reuse best-performing translated ad copies per market, tagged by product segment, so proven copy can be applied to new concepts without re-translating.

**Architecture:** New `copy_bank` table stores translated primary texts + headlines, linked to the source `meta_ads` row and tagged by `product_segments`. Morning Brief auto-suggests saving winners. ConceptAdCopyStep gets a "Pick from Copy Bank" picker per language.

**Tech Stack:** Next.js API routes, Supabase (PostgREST + Management API for DDL), React components, TypeScript

---

### Task 1: Create `copy_bank` database table

**Files:**
- No code files — DDL via Supabase Management API

**Step 1: Run the migration**

Execute via Supabase Management API (DDL requires management API, not service role):

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "CREATE TABLE IF NOT EXISTS copy_bank ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product text NOT NULL, language text NOT NULL, primary_text text NOT NULL, headline text, segment_id uuid REFERENCES product_segments(id) ON DELETE SET NULL, source_meta_ad_id uuid REFERENCES meta_ads(id) ON DELETE SET NULL, source_concept_name text, notes text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(product, language, primary_text) );"}'
```

Expected: `200 OK`

**Step 2: Enable RLS**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE copy_bank ENABLE ROW LEVEL SECURITY; CREATE POLICY \"Service role full access\" ON copy_bank FOR ALL USING (true) WITH CHECK (true);"}'
```

Expected: `200 OK`

**Step 3: Verify table exists**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''copy_bank'\'' ORDER BY ordinal_position;"}'
```

Expected: 10 columns listed (id, product, language, primary_text, headline, segment_id, source_meta_ad_id, source_concept_name, notes, created_at)

**Step 4: Commit**

Nothing to commit yet — DDL only. Move to Task 2.

---

### Task 2: Add TypeScript types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add the CopyBankEntry interface**

Add after the `MetaAd` interface (around line 467):

```typescript
export interface CopyBankEntry {
  id: string;
  product: string;
  language: string;
  primary_text: string;
  headline: string | null;
  segment_id: string | null;
  source_meta_ad_id: string | null;
  source_concept_name: string | null;
  notes: string | null;
  created_at: string;
  // Joined relations (optional)
  segment?: ProductSegment;
}
```

**Step 2: Run type check**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(copy-bank): add CopyBankEntry type"
```

---

### Task 3: Create Copy Bank API routes

**Files:**
- Create: `src/app/api/copy-bank/route.ts` (GET list + POST create)
- Create: `src/app/api/copy-bank/[id]/route.ts` (DELETE)

**Step 1: Create the list + create route**

Create `src/app/api/copy-bank/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";

// GET /api/copy-bank?product=X&language=Y&segment_id=Z
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const product = searchParams.get("product");
  const language = searchParams.get("language");
  const segmentId = searchParams.get("segment_id");

  const db = createServerSupabase();

  let query = db
    .from("copy_bank")
    .select("*, segment:product_segments(id, name)")
    .order("created_at", { ascending: false });

  if (product) query = query.eq("product", product);
  if (language) query = query.eq("language", language);
  if (segmentId && isValidUUID(segmentId)) query = query.eq("segment_id", segmentId);

  const { data, error } = await query;

  if (error) return safeError(error, "Failed to fetch copy bank");

  return NextResponse.json(data ?? []);
}

// POST /api/copy-bank
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { product, language, primary_text, headline, segment_id, source_meta_ad_id, source_concept_name, notes } = body;

  if (!product || !language || !primary_text) {
    return NextResponse.json(
      { error: "product, language, and primary_text are required" },
      { status: 400 }
    );
  }

  if (segment_id && !isValidUUID(segment_id)) {
    return NextResponse.json({ error: "Invalid segment_id" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data, error } = await db
    .from("copy_bank")
    .upsert(
      {
        product,
        language,
        primary_text: primary_text.trim(),
        headline: headline?.trim() || null,
        segment_id: segment_id || null,
        source_meta_ad_id: source_meta_ad_id || null,
        source_concept_name: source_concept_name || null,
        notes: notes || null,
      },
      { onConflict: "product,language,primary_text" }
    )
    .select("*, segment:product_segments(id, name)")
    .single();

  if (error) return safeError(error, "Failed to save to copy bank");

  return NextResponse.json(data, { status: 201 });
}
```

**Step 2: Create the delete route**

Create `src/app/api/copy-bank/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

// DELETE /api/copy-bank/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { error } = await db
    .from("copy_bank")
    .delete()
    .eq("id", id);

  if (error) return safeError(error, "Failed to delete copy bank entry");

  return NextResponse.json({ ok: true });
}
```

**Step 3: Run type check**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/app/api/copy-bank/route.ts src/app/api/copy-bank/\[id\]/route.ts
git commit -m "feat(copy-bank): add API routes (GET list, POST create, DELETE)"
```

---

### Task 4: Morning Brief — "Save winning copy" action cards

**Files:**
- Modify: `src/app/api/morning-brief/route.ts` (add save_copy cards after winner/scale cards)
- Modify: `src/app/morning-brief/MorningBriefClient.tsx` (handle save_copy action)

**Step 1: Add `save_copy` to the ActionCard type union**

In `src/app/api/morning-brief/route.ts`, find the `ActionCard` interface (around line 682):

```typescript
type: "pause" | "scale" | "refresh" | "budget" | "landing_page";
```

Change to:

```typescript
type: "pause" | "scale" | "refresh" | "budget" | "landing_page" | "save_copy";
```

**Step 2: Generate "Save winning copy" cards after winner detection**

In `src/app/api/morning-brief/route.ts`, after the scale cards loop (after the `for (const w of enrichedWinners)` block that pushes scale cards, around line 839), add:

```typescript
// ── Save winning copy to bank (priority 4 — low urgency, nice to have) ──
// For each winner ad, check if their copy is already in the bank
const winnerAdIds = enrichedWinners.map((w) => w.ad_id);
const { data: winnerAds } = winnerAdIds.length > 0
  ? await db
      .from("meta_ads")
      .select("id, ad_copy, headline, campaign_id, meta_campaigns(product, language, image_job_id, image_jobs(name, cash_dna))")
      .in("meta_ad_id", winnerAdIds)
      .eq("status", "pushed")
      .not("ad_copy", "is", null)
  : { data: [] };

if (winnerAds && winnerAds.length > 0) {
  // Check which copies are already banked
  const copyTexts = winnerAds.map((a) => (a.ad_copy ?? "").trim()).filter(Boolean);
  const { data: existingBank } = copyTexts.length > 0
    ? await db
        .from("copy_bank")
        .select("primary_text")
        .in("primary_text", copyTexts)
    : { data: [] };
  const bankedTexts = new Set((existingBank ?? []).map((b) => b.primary_text));

  for (const wa of winnerAds) {
    const copy = (wa.ad_copy ?? "").trim();
    if (!copy || bankedTexts.has(copy)) continue;

    const mc = wa.meta_campaigns as { product: string; language: string; image_job_id: string | null; image_jobs: { name: string; cash_dna: Record<string, unknown> | null } | null } | null;
    if (!mc) continue;

    const conceptName = mc.image_jobs?.name ?? "unknown";
    const lang = mc.language;
    const product = mc.product;
    const preview = copy.length > 80 ? copy.slice(0, 80) + "..." : copy;

    actionCards.push({
      id: `save_copy_${wa.id}`,
      type: "save_copy",
      category: "Copy",
      title: `Save winning ${lang.toUpperCase()} copy to bank`,
      why: `This copy is performing well. Save it so you can reuse it on future concepts without re-translating.`,
      guidance: `"${preview}"`,
      expected_impact: "Reuse proven copy on new concepts",
      button_label: "Save to Copy Bank",
      action_data: {
        action: "save_copy",
        meta_ad_id: wa.id,
        primary_text: copy,
        headline: wa.headline ?? null,
        product,
        language: lang,
        source_concept_name: conceptName,
      },
      priority: 4,
      ad_name: null,
      adset_id: null,
      adset_name: null,
      campaign_name: null,
      image_job_id: mc.image_job_id,
      concept_name: conceptName,
      days_running: null,
      adset_roas: null,
    });
  }
}
```

**Step 3: Handle `save_copy` action in the client**

In `src/app/morning-brief/MorningBriefClient.tsx`, in the `handleApply` function, add a new case before the generic API call block (before the `setActionState` line):

```typescript
if (card.type === "save_copy") {
  setActionState((s) => ({ ...s, loading: card.id }));
  try {
    const res = await fetch("/api/copy-bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: card.action_data.product,
        language: card.action_data.language,
        primary_text: card.action_data.primary_text,
        headline: card.action_data.headline,
        source_meta_ad_id: card.action_data.meta_ad_id,
        source_concept_name: card.action_data.source_concept_name,
      }),
    });
    const result = await res.json();
    setActionState((s) => ({
      loading: null,
      results: {
        ...s.results,
        [card.id]: {
          ok: res.ok,
          message: res.ok ? "Saved!" : result.error || "Failed",
        },
      },
    }));
  } catch {
    setActionState((s) => ({
      loading: null,
      results: {
        ...s.results,
        [card.id]: { ok: false, message: "Network error" },
      },
    }));
  }
  return;
}
```

**Step 4: Add card styling config for `save_copy` type**

In `MorningBriefClient.tsx`, find the `cardConfig` object (maps card types to icons/colors). Add:

```typescript
save_copy: {
  icon: BookmarkPlus, // import from lucide-react
  bgColor: "bg-purple-50",
  iconColor: "text-purple-500",
  tagColor: "bg-purple-100 text-purple-700",
},
```

Import `BookmarkPlus` from lucide-react at the top of the file.

**Step 5: Run type check**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit
```

Expected: No errors

**Step 6: Commit**

```bash
git add src/app/api/morning-brief/route.ts src/app/morning-brief/MorningBriefClient.tsx
git commit -m "feat(copy-bank): Morning Brief auto-suggests saving winning copy"
```

---

### Task 5: Copy Bank Picker component

**Files:**
- Create: `src/components/images/CopyBankPicker.tsx`

**Step 1: Create the picker modal component**

Create `src/components/images/CopyBankPicker.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { X, Loader2, BookmarkCheck, Search } from "lucide-react";
import type { CopyBankEntry, ProductSegment } from "@/types";

interface Props {
  product: string;
  language: string;
  segments: ProductSegment[];
  onSelect: (entry: CopyBankEntry) => void;
  onClose: () => void;
}

export default function CopyBankPicker({ product, language, segments, onSelect, onClose }: Props) {
  const [entries, setEntries] = useState<CopyBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSegment, setFilterSegment] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams({ product, language });
      if (filterSegment) params.set("segment_id", filterSegment);
      const res = await fetch(`/api/copy-bank?${params}`);
      if (res.ok) {
        setEntries(await res.json());
      }
      setLoading(false);
    }
    setLoading(true);
    load();
  }, [product, language, filterSegment]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-900">Copy Bank</h3>
            <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              {language.toUpperCase()}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segment filter chips */}
        {segments.length > 0 && (
          <div className="flex items-center gap-1.5 px-5 py-2 border-b border-gray-50 flex-wrap">
            <button
              onClick={() => setFilterSegment(null)}
              className={`text-[11px] px-2 py-1 rounded-full transition-colors ${
                filterSegment === null
                  ? "bg-purple-100 text-purple-700 font-medium"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {segments.map((s) => (
              <button
                key={s.id}
                onClick={() => setFilterSegment(s.id)}
                className={`text-[11px] px-2 py-1 rounded-full transition-colors ${
                  filterSegment === s.id
                    ? "bg-purple-100 text-purple-700 font-medium"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div className="text-center py-8">
              <Search className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No saved copies for this language yet</p>
            </div>
          )}

          {!loading && entries.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50/50 transition-colors group"
            >
              <p className="text-sm text-gray-800 line-clamp-3 leading-relaxed">
                {entry.primary_text}
              </p>
              {entry.headline && (
                <p className="text-xs font-medium text-gray-600 mt-1.5 truncate">
                  {entry.headline}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-2">
                {entry.segment && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {entry.segment.name}
                  </span>
                )}
                {entry.source_concept_name && (
                  <span className="text-[10px] text-gray-400 truncate">
                    from {entry.source_concept_name}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Run type check**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/components/images/CopyBankPicker.tsx
git commit -m "feat(copy-bank): add CopyBankPicker modal component"
```

---

### Task 6: Integrate Copy Bank picker into ConceptAdCopyStep

**Files:**
- Modify: `src/components/images/ConceptAdCopyStep.tsx`

**Step 1: Add imports and state**

At the top of `ConceptAdCopyStep.tsx`, add imports:

```typescript
import CopyBankPicker from "./CopyBankPicker";
import type { CopyBankEntry, ProductSegment } from "@/types";
import { BookmarkCheck } from "lucide-react";
```

Inside the component, add state for the picker:

```typescript
const [copyBankLang, setCopyBankLang] = useState<string | null>(null);
const [segments, setSegments] = useState<ProductSegment[]>([]);
```

Add a useEffect to fetch segments for the product (only once):

```typescript
useEffect(() => {
  if (!job.product) return;
  async function loadSegments() {
    const res = await fetch(`/api/products/${job.product}`);
    if (res.ok) {
      const data = await res.json();
      setSegments(data.product_segments ?? []);
    }
  }
  loadSegments();
}, [job.product]);
```

**Step 2: Add "Pick from Copy Bank" button to each language card header**

In the per-language card header (the `<div>` with the Re-translate button), add a second button before or after the translate button:

```typescript
<button
  onClick={() => setCopyBankLang(lang)}
  className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 transition-colors"
  title="Pick from Copy Bank"
>
  <BookmarkCheck className="w-3 h-3" />
  Copy Bank
</button>
```

**Step 3: Add the picker modal and selection handler**

At the end of the component's JSX (before the final closing `</>`), add:

```typescript
{copyBankLang && job.product && (
  <CopyBankPicker
    product={job.product}
    language={copyBankLang}
    segments={segments}
    onSelect={(entry: CopyBankEntry) => {
      // Replace first primary text + headline for this language
      handleTranslatedCopyChange(copyBankLang, "primary_texts", 0, entry.primary_text);
      if (entry.headline) {
        handleTranslatedCopyChange(copyBankLang, "headlines", 0, entry.headline);
      }
      setCopyBankLang(null);
    }}
    onClose={() => setCopyBankLang(null)}
  />
)}
```

**Step 4: Run type check**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit
```

Expected: No errors

**Step 5: Test manually**

1. Open a concept that has target languages and translated copy
2. Each language card should show a purple "Copy Bank" button
3. Clicking it opens the CopyBankPicker modal (will be empty initially — no saved entries yet)
4. If entries exist, clicking one replaces the translation

**Step 6: Commit**

```bash
git add src/components/images/ConceptAdCopyStep.tsx
git commit -m "feat(copy-bank): integrate picker into ConceptAdCopyStep language cards"
```

---

### Task 7: Run tests and verify

**Files:**
- No new files

**Step 1: Run all tests**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx vitest run
```

Expected: All tests pass (27/27)

**Step 2: Run type check**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit
```

Expected: No errors

**Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. Navigate to a concept with translated copy — verify "Copy Bank" button appears per language
3. Click "Copy Bank" — verify picker opens (empty state shown)
4. Check Morning Brief at `/morning-brief` — if you have winners, verify "Save winning copy" cards appear
5. If a save_copy card appears, click it — verify copy gets saved
6. Go back to a concept, click "Copy Bank" — verify the saved copy now appears in the picker
7. Select it — verify it replaces the translation

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(copy-bank): address issues found during smoke test"
```
