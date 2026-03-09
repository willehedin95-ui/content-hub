# Pixar Product References — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a per-shot product image reference picker to the Pixar Animation pipeline so Nano Banana generates product-accurate first frames.

**Architecture:** New DB column on `video_shots` stores selected reference URLs. A collapsible UI panel in MultiClipPipeline lets users pick product images per shot before generating. The shot-images API merges per-shot references into `image_input` for Nano Banana.

**Tech Stack:** Next.js App Router API routes, Supabase (Postgres), React (client component), Tailwind CSS, Lucide icons.

---

### Task 1: Add `reference_image_urls` column to `video_shots`

**Files:**
- No file changes — DDL via Supabase Management API

**Step 1: Run the migration**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE video_shots ADD COLUMN IF NOT EXISTS reference_image_urls text[] DEFAULT '\''{}'\'';"}'
```

Expected: `200 OK`

**Step 2: Verify column exists**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''video_shots'\'' AND column_name = '\''reference_image_urls'\'';"}'
```

Expected: One row with `reference_image_urls` / `ARRAY`

---

### Task 2: Update `VideoShot` TypeScript type

**Files:**
- Modify: `src/types/index.ts:957-974` (VideoShot interface)

**Step 1: Add the new field**

Add `reference_image_urls` to the `VideoShot` interface, after `error_message`:

```typescript
// In the VideoShot interface, add:
reference_image_urls: string[];
```

The full interface line to add (after `error_message: string | null;`):

```typescript
  reference_image_urls: string[];
```

**Step 2: Verify types compile**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

Expected: No new errors (existing errors are OK if they were pre-existing).

---

### Task 3: Create PATCH API endpoint to save per-shot references

**Files:**
- Create: `src/app/api/video-jobs/[id]/shots/[shotId]/references/route.ts`

**Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const { id, shotId } = await params;
  const db = createServerSupabase();

  const body = await req.json();
  const urls: string[] = body.reference_image_urls ?? [];

  // Validate: must be array of strings
  if (!Array.isArray(urls) || urls.some((u: unknown) => typeof u !== "string")) {
    return NextResponse.json(
      { error: "reference_image_urls must be an array of strings" },
      { status: 400 }
    );
  }

  // Verify shot belongs to this job
  const { data: shot, error: shotErr } = await db
    .from("video_shots")
    .select("id")
    .eq("id", shotId)
    .eq("video_job_id", id)
    .single();

  if (shotErr || !shot) {
    return safeError(shotErr, "Shot not found", 404);
  }

  const { error: updateErr } = await db
    .from("video_shots")
    .update({ reference_image_urls: urls })
    .eq("id", shotId);

  if (updateErr) {
    return safeError(updateErr, "Failed to update references");
  }

  return NextResponse.json({ ok: true, reference_image_urls: urls });
}
```

**Step 2: Test the endpoint manually**

After the dev server is running, test with:
```bash
# Replace JOB_ID and SHOT_ID with real values from the database
curl -s -X PATCH "http://localhost:3000/api/video-jobs/JOB_ID/shots/SHOT_ID/references" \
  -H "Content-Type: application/json" \
  -d '{"reference_image_urls": ["https://example.com/test.jpg"]}'
```

Expected: `{"ok": true, "reference_image_urls": ["https://example.com/test.jpg"]}`

**Step 3: Commit**

```bash
git add src/app/api/video-jobs/\[id\]/shots/\[shotId\]/references/route.ts
git commit -m "feat: add PATCH endpoint for per-shot reference image URLs"
```

---

### Task 4: Update shot-images route to use per-shot references

**Files:**
- Modify: `src/app/api/video-jobs/[id]/pipeline/shot-images/route.ts`

**Step 1: Update the select query to include `reference_image_urls`**

The existing query on line 23-28 already uses `select("*")` so the new column is included automatically. No change needed there.

**Step 2: Merge per-shot references into the Nano Banana call**

In the `reuseFirstFrame` branch (line 53), change:
```typescript
const taskId = await createImageTask(imagePrompt, charRefUrls, "2:3", "1K");
```
to:
```typescript
const shotRefs = (firstShot.reference_image_urls as string[]) || [];
const refs = [...charRefUrls, ...shotRefs];
const taskId = await createImageTask(imagePrompt, refs, "2:3", "1K");
```

In the individual image loop (line 79), change:
```typescript
const taskId = await createImageTask(imagePrompt, charRefUrls, "2:3", "1K");
```
to:
```typescript
const shotRefs = (shot.reference_image_urls as string[]) || [];
const refs = [...charRefUrls, ...shotRefs];
const taskId = await createImageTask(imagePrompt, refs, "2:3", "1K");
```

**Step 3: Commit**

```bash
git add src/app/api/video-jobs/\[id\]/pipeline/shot-images/route.ts
git commit -m "feat: pass per-shot product reference images to Nano Banana"
```

---

### Task 5: Create `ProductRefPicker` component

**Files:**
- Create: `src/components/video-ads/ProductRefPicker.tsx`

This is the collapsible panel that shows all shots with product image thumbnails.

**Step 1: Build the component**

```tsx
"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, ImageIcon, Check } from "lucide-react";

interface ProductImage {
  id: string;
  url: string;
  category: string;
  alt_text: string | null;
}

interface ShotRef {
  id: string;
  shot_number: number;
  shot_description: string;
  reference_image_urls: string[];
}

interface ProductRefPickerProps {
  jobId: string;
  product: string; // product slug e.g. "happysleep"
  shots: ShotRef[];
  onUpdate: () => void;
}

export default function ProductRefPicker({ jobId, product, shots, onUpdate }: ProductRefPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  // Per-shot selections: shotId → Set of selected image URLs
  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const shot of shots) {
      init[shot.id] = new Set(shot.reference_image_urls || []);
    }
    return init;
  });
  const [saving, setSaving] = useState<string | null>(null);

  // Fetch product images when panel expands
  useEffect(() => {
    if (!expanded || productImages.length > 0) return;
    setLoadingImages(true);

    // Look up product ID by slug, then fetch images
    fetch(`/api/products?slug=${product}`)
      .then((r) => r.json())
      .then((products) => {
        const prod = Array.isArray(products) ? products.find((p: { slug: string }) => p.slug === product) : null;
        if (!prod) return;
        return fetch(`/api/products/${prod.id}/images`);
      })
      .then((r) => r?.json())
      .then((images) => {
        if (images) setProductImages(images);
      })
      .finally(() => setLoadingImages(false));
  }, [expanded, product, productImages.length]);

  async function toggleImage(shotId: string, imageUrl: string) {
    const current = new Set(selections[shotId] || []);
    if (current.has(imageUrl)) {
      current.delete(imageUrl);
    } else {
      current.add(imageUrl);
    }
    setSelections((prev) => ({ ...prev, [shotId]: current }));

    // Save to API
    setSaving(shotId);
    try {
      await fetch(`/api/video-jobs/${jobId}/shots/${shotId}/references`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference_image_urls: Array.from(current) }),
      });
      onUpdate();
    } finally {
      setSaving(null);
    }
  }

  async function applyToAll() {
    // Use first shot's selection for all shots
    const firstShotId = shots[0]?.id;
    if (!firstShotId) return;
    const sourceUrls = Array.from(selections[firstShotId] || []);

    const newSelections: Record<string, Set<string>> = {};
    setSaving("all");
    try {
      for (const shot of shots) {
        newSelections[shot.id] = new Set(sourceUrls);
        await fetch(`/api/video-jobs/${jobId}/shots/${shot.id}/references`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference_image_urls: sourceUrls }),
        });
      }
      setSelections(newSelections);
      onUpdate();
    } finally {
      setSaving(null);
    }
  }

  const totalSelected = Object.values(selections).reduce(
    (sum, set) => sum + set.size,
    0
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <ImageIcon className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">
            Product References
          </span>
          {totalSelected > 0 && (
            <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">
              {totalSelected} selected
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          Use product photos as Nano Banana references
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {loadingImages && (
            <p className="text-xs text-gray-400">Loading product images...</p>
          )}

          {!loadingImages && productImages.length === 0 && (
            <p className="text-xs text-gray-400">
              No product images found. Add images in the Product Bank first.
            </p>
          )}

          {!loadingImages && productImages.length > 0 && (
            <>
              {shots.map((shot) => {
                const selected = selections[shot.id] || new Set();
                return (
                  <div key={shot.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-600">
                        Shot {shot.shot_number}
                        <span className="font-normal text-gray-400 ml-2">
                          {shot.shot_description.slice(0, 80)}...
                        </span>
                      </p>
                      {selected.size > 0 && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                          {selected.size} ref{selected.size > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {productImages.map((img) => {
                        const isSelected = selected.has(img.url);
                        return (
                          <button
                            key={img.id}
                            onClick={() => toggleImage(shot.id, img.url)}
                            disabled={saving === shot.id || saving === "all"}
                            className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                              isSelected
                                ? "border-indigo-500 ring-2 ring-indigo-200"
                                : "border-gray-200 hover:border-gray-300"
                            } ${saving === shot.id || saving === "all" ? "opacity-50" : ""}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.url}
                              alt={img.alt_text || img.category}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                                <Check className="w-4 h-4 text-white drop-shadow" />
                              </div>
                            )}
                            <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-[8px] text-white text-center py-0.5 truncate">
                              {img.category}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Apply to all shortcut */}
              {shots.length > 1 && (selections[shots[0]?.id]?.size ?? 0) > 0 && (
                <button
                  onClick={applyToAll}
                  disabled={saving === "all"}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  {saving === "all" ? "Applying..." : `Apply Shot 1's selection to all shots`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/video-ads/ProductRefPicker.tsx
git commit -m "feat: add ProductRefPicker component for per-shot references"
```

---

### Task 6: Wire ProductRefPicker into MultiClipPipeline

**Files:**
- Modify: `src/components/video-ads/MultiClipPipeline.tsx`

**Step 1: Add import**

At the top of the file (after line 20 `import ShotCard from "./ShotCard";`), add:

```typescript
import ProductRefPicker from "./ProductRefPicker";
```

**Step 2: Add the picker in the pending state, before the Generate button**

Find the Pixar pending section (lines 613-631). Replace the block:

```tsx
            {(characterRefStatus === "completed" ||
              characterRefStatus === "skipped" ||
              !hasCharacterDescription ||
              job.format_type === "pixar_animation") && (
              <div>
                <button
                  onClick={handleGenerateShotImages}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Image className="w-4 h-4" />
                  )}
                  Generate Shot Images
                </button>
              </div>
            )}
```

with:

```tsx
            {(characterRefStatus === "completed" ||
              characterRefStatus === "skipped" ||
              !hasCharacterDescription ||
              job.format_type === "pixar_animation") && (
              <div className="space-y-4">
                {job.format_type === "pixar_animation" && shots.length > 0 && (
                  <ProductRefPicker
                    jobId={job.id}
                    product={job.product}
                    shots={shots.map((s) => ({
                      id: s.id,
                      shot_number: s.shot_number,
                      shot_description: s.shot_description,
                      reference_image_urls: (s as unknown as { reference_image_urls: string[] }).reference_image_urls || [],
                    }))}
                    onUpdate={fetchStatus}
                  />
                )}
                <button
                  onClick={handleGenerateShotImages}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Image className="w-4 h-4" />
                  )}
                  Generate Shot Images
                </button>
              </div>
            )}
```

Note: The `PipelineShotStatus` interface (line 25-36) doesn't have `reference_image_urls`, so we cast through `unknown`. Alternatively, add it to the interface — cleaner approach:

Add to the `PipelineShotStatus` interface (after line 35):
```typescript
  reference_image_urls: string[];
```

And update the pipeline status endpoint to include this field (it already uses `select("*")` so the column is returned — this just needs the TypeScript type).

**Step 3: Verify it renders**

Run the dev server and navigate to a Pixar animation video job that's in pending state. Confirm:
- The "Product References" collapsible panel appears above the "Generate Shot Images" button
- Expanding it shows product image thumbnails per shot
- Clicking a thumbnail toggles selection (highlighted border + checkmark)

**Step 4: Commit**

```bash
git add src/components/video-ads/MultiClipPipeline.tsx
git commit -m "feat: wire ProductRefPicker into Pixar pipeline pending state"
```

---

### Task 7: Verify the status endpoint returns `reference_image_urls`

**Files:**
- Check: `src/app/api/video-jobs/[id]/pipeline/status/route.ts`

**Step 1: Read the status route and verify it returns the field**

The status route likely uses `select("*")` on `video_shots` — if so, `reference_image_urls` is already included. If it uses specific fields, add `reference_image_urls` to the select list.

**Step 2: Update `PipelineShotStatus` in MultiClipPipeline**

If not already done in Task 6, add to the `PipelineShotStatus` interface:

```typescript
  reference_image_urls: string[];
```

---

### Task 8: End-to-end test

**Step 1: Test the full flow**

1. Go to Brainstorm → select HappySleep → Pixar Animation → Generate
2. Approve a concept → redirects to video job page
3. Expand "Product References" panel
4. Select a product hero image for the pillow character shot
5. Click "Generate Shot Images"
6. Verify in the Kie AI response that the generated image looks more like the actual product

**Step 2: Final commit**

```bash
git add -A
git commit -m "feat: per-shot product reference images for Pixar Animation pipeline"
```
