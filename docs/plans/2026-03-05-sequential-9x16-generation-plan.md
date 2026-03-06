# Sequential 4:5 → 9:16 Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split image generation into two phases — generate 4:5 first (user reviews/rerolls), then outpaint to 9:16 from approved 4:5 images.

**Architecture:** Change `create-translations` and `add-languages` to only create 4:5 rows. Add new `generate-9x16` API route that creates 9:16 rows from completed 4:5 siblings. Modify `translate` route to detect 9:16 and use the 4:5 sibling's translated image as reference with an outpainting prompt.

**Tech Stack:** Next.js API routes, Supabase, Kie.ai (Nano Banana), React/TypeScript

---

### Task 1: Change `create-translations` default to 4:5 only

**Files:**
- Modify: `src/app/api/image-jobs/[id]/create-translations/route.ts:54`

**Step 1: Update default ratios**

Change line 54 from:
```typescript
const ratios = job.target_ratios?.length ? job.target_ratios : ["4:5", "9:16"];
```
to:
```typescript
const ratios = job.target_ratios?.length ? job.target_ratios : ["4:5"];
```

**Step 2: Commit**

```bash
git add src/app/api/image-jobs/[id]/create-translations/route.ts
git commit -m "feat: default create-translations to 4:5 only"
```

---

### Task 2: Change `add-languages` default to 4:5 only

**Files:**
- Modify: `src/app/api/image-jobs/[id]/add-languages/route.ts:78`

**Step 1: Update default ratios**

Change line 78 from:
```typescript
const ratios = job.target_ratios?.length ? job.target_ratios : ["4:5", "9:16"];
```
to:
```typescript
const ratios = job.target_ratios?.length ? job.target_ratios : ["4:5"];
```

**Step 2: Commit**

```bash
git add src/app/api/image-jobs/[id]/add-languages/route.ts
git commit -m "feat: default add-languages to 4:5 only"
```

---

### Task 3: Create `generate-9x16` API route

**Files:**
- Create: `src/app/api/image-jobs/[id]/generate-9x16/route.ts`

**Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  // Get all image_translations for this job via source_images join
  const { data: sourceImages, error: siError } = await db
    .from("source_images")
    .select("id, image_translations(id, language, aspect_ratio, status, translated_url)")
    .eq("job_id", jobId);

  if (siError || !sourceImages?.length) {
    return NextResponse.json({ error: "No source images found" }, { status: 400 });
  }

  // Collect all translations
  const allTranslations = sourceImages.flatMap(
    (si) => (si.image_translations ?? []).map((t) => ({ ...t, source_image_id: si.id }))
  );

  // Check: all 4:5 must be completed
  const translations4x5 = allTranslations.filter((t) => t.aspect_ratio === "4:5");
  const incomplete4x5 = translations4x5.filter((t) => t.status !== "completed");
  if (incomplete4x5.length > 0) {
    return NextResponse.json(
      { error: `${incomplete4x5.length} of ${translations4x5.length} 4:5 translations are not yet completed` },
      { status: 400 }
    );
  }

  if (translations4x5.length === 0) {
    return NextResponse.json({ error: "No 4:5 translations found" }, { status: 400 });
  }

  // Check: don't create duplicates — skip if 9:16 rows already exist for this (source_image, language)
  const existing9x16 = new Set(
    allTranslations
      .filter((t) => t.aspect_ratio === "9:16")
      .map((t) => `${t.source_image_id}:${t.language}`)
  );

  const rowsToCreate = translations4x5
    .filter((t) => !existing9x16.has(`${t.source_image_id}:${t.language}`))
    .map((t) => ({
      source_image_id: t.source_image_id,
      language: t.language,
      aspect_ratio: "9:16",
      status: "pending",
    }));

  if (rowsToCreate.length === 0) {
    return NextResponse.json({ error: "9:16 translations already exist for all images" }, { status: 400 });
  }

  const { error: insertError } = await db
    .from("image_translations")
    .insert(rowsToCreate);

  if (insertError) {
    return safeError(insertError, "Failed to create 9:16 translations");
  }

  // Set job to processing
  await db
    .from("image_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  return NextResponse.json({
    created: rowsToCreate.length,
    languages: new Set(rowsToCreate.map((r) => r.language)).size,
    images: new Set(rowsToCreate.map((r) => r.source_image_id)).size,
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/image-jobs/[id]/generate-9x16/route.ts
git commit -m "feat: add generate-9x16 API route"
```

---

### Task 4: Modify `translate` route for 9:16 outpainting

**Files:**
- Modify: `src/app/api/image-jobs/[id]/translate/route.ts`

**Step 1: Add 9:16 outpainting logic**

After the existing `let prompt = ...` block (around line 91-102), add logic to detect 9:16 and switch to outpainting mode. The key changes:

1. When `translation.aspect_ratio === "9:16"`, look up the 4:5 sibling translation
2. If found and completed, use sibling's `translated_url` as `image_input` with outpainting prompt
3. If not found, fall back to current translation behavior (backward compat for old jobs)

Replace the prompt construction and generateImage call section. After the existing prompt building (lines 88-102), before the `generateImage` call (line 105), insert:

```typescript
// For 9:16: use outpainting from completed 4:5 sibling instead of translating from source
let imageInputUrl = translation.source_images.original_url;

if (translation.aspect_ratio === "9:16") {
  // Find the 4:5 sibling for the same source_image + language
  const { data: sibling4x5 } = await db
    .from("image_translations")
    .select("translated_url")
    .eq("source_image_id", translation.source_image_id)
    .eq("language", translation.language)
    .eq("aspect_ratio", "4:5")
    .eq("status", "completed")
    .single();

  if (sibling4x5?.translated_url) {
    imageInputUrl = sibling4x5.translated_url;
    prompt = `Extend this image vertically to fill a 9:16 portrait format. Continue the existing background naturally above and below. Do not add any new text, logos, or visual elements in the extended areas — only extend the background seamlessly.`;
  }
  // If no 4:5 sibling found, fall through to normal translation prompt (backward compat)
}
```

Then update the `generateImage` call to use `imageInputUrl` instead of `translation.source_images.original_url`:

```typescript
const { urls: resultUrls, costTimeMs } = await generateImage(
  prompt,
  [imageInputUrl],
  translation.aspect_ratio || "4:5"
);
```

**Step 2: Commit**

```bash
git add src/app/api/image-jobs/[id]/translate/route.ts
git commit -m "feat: 9:16 outpainting from 4:5 sibling in translate route"
```

---

### Task 5: Add "Generate 9:16 Versions" button and handler

**Files:**
- Modify: `src/components/images/ImageJobDetail.tsx`
- Modify: `src/components/images/ConceptImagesStep.tsx`

**Step 1: Add handler in ImageJobDetail.tsx**

Add `handleGenerate9x16` function after `handleTranslateAll` (after line 954):

```typescript
async function handleGenerate9x16() {
  setProc(prev => ({ ...prev, processing: true }));

  const res = await fetch(`/api/image-jobs/${job.id}/generate-9x16`, { method: "POST" });
  if (!res.ok) {
    setProc(prev => ({ ...prev, processing: false }));
    return;
  }
  const updated = await refreshJob();
  if (updated) {
    const pending = getAllPending(updated);
    if (pending.length > 0) {
      startQueue(pending);
    } else {
      setProc(prev => ({ ...prev, processing: false }));
    }
  }
}
```

**Step 2: Compute 9:16 readiness flags**

Add after `const pendingCount = ...` (around line 578):

```typescript
// 9:16 generation readiness
const translations4x5 = allTranslations.filter((t) => t.aspect_ratio === "4:5");
const translations9x16 = allTranslations.filter((t) => t.aspect_ratio === "9:16");
const all4x5Complete = translations4x5.length > 0 && translations4x5.every((t) => t.status === "completed");
const show9x16Button = all4x5Complete && translations9x16.length === 0 && !proc.processing;
```

**Step 3: Pass props to ConceptImagesStep**

Add to the `<ConceptImagesStep>` props (around line 1270):

```tsx
handleGenerate9x16={handleGenerate9x16}
show9x16Button={show9x16Button}
count9x16={translations4x5.length}
```

**Step 4: Update ConceptImagesStepProps interface**

In `ConceptImagesStep.tsx`, add to the `ConceptImagesStepProps` interface (around line 165):

```typescript
// 9:16 generation
handleGenerate9x16?: () => void;
show9x16Button?: boolean;
count9x16?: number;
```

Add to the destructured props of the component function (around line 265):

```typescript
handleGenerate9x16,
show9x16Button,
count9x16,
```

**Step 5: Add the "Generate 9:16 Versions" button in ConceptImagesStep**

In the processing/completed state section (the `else` branch starting at line 660), add the button after the progress bar section (after the closing `</div>` of the progress bar around line 735) but before the language tabs:

```tsx
{/* Generate 9:16 CTA */}
{show9x16Button && handleGenerate9x16 && (
  <div className="mb-6 bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-4 flex items-center justify-between">
    <div>
      <p className="text-sm font-medium text-gray-900">4:5 translations ready</p>
      <p className="text-xs text-gray-500 mt-0.5">
        Generate 9:16 versions for Stories &amp; Reels ({count9x16} images)
        {count9x16 ? <> &asymp; {(count9x16 * 0.09 * 11).toFixed(0)} kr</> : null}
      </p>
    </div>
    <button
      onClick={handleGenerate9x16}
      className="px-5 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium text-sm flex items-center gap-2"
    >
      <Sparkles className="w-4 h-4" />
      Generate 9:16 Versions
    </button>
  </div>
)}
```

**Step 6: Update the confirmation dialog cost estimate**

In the translate confirmation dialog (around line 615-657 of ConceptImagesStep.tsx), the `totalTranslations` calculation at line 617 currently multiplies by number of ratios. Since we now only create 4:5 initially, update the calculation:

```typescript
const totalTranslations = translatableCount * selectedLanguages.size; // Already correct — no ratio multiplier
```

Also update the info text in the ready state (line 606-609):

```tsx
{selectedLanguages.size > 0 && (
  <p className="text-sm text-gray-400">
    {sourceImages.filter(si => !si.skip_translation).length * selectedLanguages.size} translations (4:5)
    {" \u2248 "}{(sourceImages.filter(si => !si.skip_translation).length * selectedLanguages.size * 1).toFixed(0)} kr
  </p>
)}
```

**Step 7: Commit**

```bash
git add src/components/images/ImageJobDetail.tsx src/components/images/ConceptImagesStep.tsx
git commit -m "feat: add Generate 9:16 Versions button in concept detail UI"
```

---

### Task 6: Verify end-to-end and fix edge cases

**Files:**
- Review: `src/lib/meta-push.ts` (should need no changes — already pairs by source_image_id:language)
- Review: `src/components/images/ImageJobDetail.tsx` computeStepCompletion (no changes needed — counts all translations)

**Step 1: Run dev server and test manually**

Run: `npm run dev`

Test flow:
1. Create a new concept with static ads
2. Click "Translate All" — verify only 4:5 rows are created
3. Wait for 4:5 to complete
4. Verify "Generate 9:16 Versions" button appears
5. Click it — verify 9:16 rows are created and start generating
6. Verify 9:16 images look like outpainted versions of the 4:5

**Step 2: Test edge cases**
- Reroll a source image after 4:5 done — verify button disappears (translations deleted)
- Retry a failed 4:5 — verify button only appears when ALL 4:5 are completed
- Add a new language after 4:5 + 9:16 done — verify new language gets 4:5 only

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: sequential 4:5 → 9:16 generation with outpainting"
```
