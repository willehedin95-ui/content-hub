# Aspect Ratio Switch (4:5 + 9:16) & Import Exclusion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace 1:1 with 4:5 + 9:16 for all new ad concepts, fix the broken Meta multi-ratio push, and add image exclusion in the import modal.

**Architecture:** Update the `AspectRatio` type system, fix the `create-translations` route to loop through `target_ratios`, update all hardcoded `"1:1"` references, fix the Meta push flow to pass `isDynamicCreative: true`, and add a three-state toggle (translate/skip/exclude) in NewConceptModal.

**Tech Stack:** Next.js, TypeScript, Supabase, Meta Marketing API v22.0, Kie AI (nano-banana-2)

**Design doc:** `docs/plans/2026-03-04-aspect-ratio-and-import-exclusion-design.md`

---

### Task 1: Update AspectRatio Type System

**Files:**
- Modify: `src/types/index.ts:139-144`
- Modify: `src/lib/validation.test.ts:43-54`

**Step 1: Update type and constant**

In `src/types/index.ts`, change lines 139-144:

```typescript
// Before:
export type AspectRatio = "1:1" | "9:16";
export const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "1:1", label: "1:1 Square" },
  { value: "9:16", label: "9:16 Story/Reel" },
];

// After:
export type AspectRatio = "1:1" | "4:5" | "9:16";
export const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "4:5", label: "4:5 Feed" },
  { value: "9:16", label: "9:16 Story/Reel" },
];
```

Note: Keep `"1:1"` in the union type for backward compat with existing DB data, but remove it from `ASPECT_RATIOS` so it doesn't appear in the UI.

**Step 2: Update validation test**

In `src/lib/validation.test.ts`, update the aspect ratio tests:

```typescript
describe("isValidAspectRatio", () => {
  it("accepts supported ratios", () => {
    expect(isValidAspectRatio("1:1")).toBe(true);
    expect(isValidAspectRatio("4:5")).toBe(true);
    expect(isValidAspectRatio("9:16")).toBe(true);
  });

  it("rejects unsupported ratios", () => {
    expect(isValidAspectRatio("16:9")).toBe(false);
    expect(isValidAspectRatio("")).toBe(false);
    expect(isValidAspectRatio("2:3")).toBe(false);
  });
});
```

**Step 3: Update `isValidAspectRatio` function** (if it uses a hardcoded list — check `src/lib/validation.ts`)

**Step 4: Run tests**

Run: `npm test -- --testPathPattern validation`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/index.ts src/lib/validation.test.ts src/lib/validation.ts
git commit -m "feat: add 4:5 aspect ratio to type system"
```

---

### Task 2: Update All Hardcoded 1:1 Defaults to 4:5

**Files (each line that defaults to `"1:1"` needs updating):**
- Modify: `src/app/settings/page.tsx:44` — default settings
- Modify: `src/components/images/NewConceptModal.tsx:180` — fallback ratio
- Modify: `src/app/api/image-jobs/route.ts:110` — API default
- Modify: `src/app/api/brainstorm/approve/route.ts:63` — brainstorm approve
- Modify: `src/app/api/pipeline/concepts/[id]/approve/route.ts:44` — pipeline approve
- Modify: `src/components/brainstorm/BrainstormGenerate.tsx:169` — brainstorm generate

**Step 1: Update each file**

Change the default from `["1:1"]` to `["4:5", "9:16"]` in each location:

`src/app/settings/page.tsx:44`:
```typescript
static_ads_default_ratios: ["4:5", "9:16"],
```

`src/components/images/NewConceptModal.tsx:180`:
```typescript
target_ratios: getSettings().static_ads_default_ratios?.length ? getSettings().static_ads_default_ratios : ["4:5", "9:16"],
```

`src/app/api/image-jobs/route.ts:110`:
```typescript
target_ratios: target_ratios?.length ? target_ratios : ["4:5", "9:16"],
```

`src/app/api/brainstorm/approve/route.ts:63`:
```typescript
target_ratios: target_ratios ?? ["4:5", "9:16"],
```

`src/app/api/pipeline/concepts/[id]/approve/route.ts:44`:
```typescript
target_ratios: ["4:5", "9:16"],
```

`src/components/brainstorm/BrainstormGenerate.tsx:169`:
```typescript
target_ratios: ["4:5", "9:16"],
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: default new concepts to 4:5 + 9:16 ratios"
```

---

### Task 3: Fix create-translations to Loop Through target_ratios

**Files:**
- Modify: `src/app/api/image-jobs/[id]/create-translations/route.ts`

**Step 1: Update the query to include target_ratios**

Line 19, change the select to include `target_ratios`:

```typescript
// Before:
.select("id, status, target_languages")

// After:
.select("id, status, target_languages, target_ratios")
```

**Step 2: Loop through ratios**

Replace lines 54-63:

```typescript
// Before:
for (const si of translatableImages) {
  for (const lang of job.target_languages) {
    translationRows.push({
      source_image_id: si.id,
      language: lang,
      aspect_ratio: "1:1",
      status: "pending",
    });
  }
}

// After:
const ratios = job.target_ratios?.length ? job.target_ratios : ["4:5", "9:16"];
for (const si of translatableImages) {
  for (const lang of job.target_languages) {
    for (const ratio of ratios) {
      translationRows.push({
        source_image_id: si.id,
        language: lang,
        aspect_ratio: ratio,
        status: "pending",
      });
    }
  }
}
```

**Step 3: Update response**

Update the response (line 83-88) to include ratio count:

```typescript
return NextResponse.json({
  created: translationRows.length,
  languages: job.target_languages.length,
  ratios: ratios.length,
  images: translatableImages.length,
  skipped: sourceImages.length - translatableImages.length,
});
```

**Step 4: Commit**

```bash
git add src/app/api/image-jobs/[id]/create-translations/route.ts
git commit -m "fix: create-translations now loops through target_ratios instead of hardcoding 1:1"
```

---

### Task 4: Fix add-languages Route

**Files:**
- Modify: `src/app/api/image-jobs/[id]/add-languages/route.ts:83`

**Step 1: Update hardcoded 1:1**

Find line 83 where `aspect_ratio: "1:1"` is hardcoded and update to loop through `job.target_ratios`:

```typescript
// The add-languages route should also create translations for all ratios, not just 1:1.
// Same pattern as create-translations: loop through job.target_ratios.
const ratios = job.target_ratios?.length ? job.target_ratios : ["4:5", "9:16"];
for (const si of translatableImages) {
  for (const lang of newLanguages) {
    for (const ratio of ratios) {
      translationRows.push({
        source_image_id: si.id,
        language: lang,
        aspect_ratio: ratio,
        status: "pending",
      });
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/image-jobs/[id]/add-languages/route.ts
git commit -m "fix: add-languages route creates translations for all target_ratios"
```

---

### Task 5: Update Static Ad Generation to Use 4:5

**Files:**
- Modify: `src/app/api/image-jobs/[id]/generate-static/route.ts:197`
- Modify: `src/app/api/image-jobs/[id]/re-roll/route.ts:142`

**Step 1: Update generate-static**

Line 197 — change the hardcoded `"1:1"` to `"4:5"`:

```typescript
// Before:
const result = await generateImage(brief.prompt, referenceUrls, "1:1");

// After:
const result = await generateImage(brief.prompt, referenceUrls, "4:5");
```

Note: Static ad generation creates *source images* (not translations). These are the base images that then get translated. Since feed is the primary format, generate at 4:5.

**Step 2: Update re-roll**

Line 142 — same change:

```typescript
// Before:
const result = await generateImage(brief.prompt, referenceUrls, "1:1");

// After:
const result = await generateImage(brief.prompt, referenceUrls, "4:5");
```

**Step 3: Commit**

```bash
git add src/app/api/image-jobs/[id]/generate-static/route.ts src/app/api/image-jobs/[id]/re-roll/route.ts
git commit -m "feat: generate static ads at 4:5 ratio instead of 1:1"
```

---

### Task 6: Update Meta Push Flow

**Files:**
- Modify: `src/lib/meta-push.ts:216,292,451,468`

**Step 1: Change primary filter from 1:1 to 4:5**

Line 216:
```typescript
// Before:
.filter((t: { language: string; aspect_ratio: string }) => t.language === lang && t.aspect_ratio === "1:1")

// After:
.filter((t: { language: string; aspect_ratio: string }) => t.language === lang && t.aspect_ratio === "4:5")
```

**Step 2: Pass isDynamicCreative when creating ad set**

Lines 292-296, add `isDynamicCreative`:
```typescript
// Before:
const newAdSet = await createAdSetFromTemplate({
  templateConfig,
  name: adSetName,
  startTime: scheduledStartTime || undefined,
});

// After:
const newAdSet = await createAdSetFromTemplate({
  templateConfig,
  name: adSetName,
  isDynamicCreative: true,
  startTime: scheduledStartTime || undefined,
});
```

**Step 3: Update hardcoded aspect_ratio in ad rows**

Lines 451 and 468:
```typescript
// Before:
aspect_ratio: "1:1",

// After:
aspect_ratio: "4:5",
```

**Step 4: Commit**

```bash
git add src/lib/meta-push.ts
git commit -m "fix: meta push uses 4:5 as primary ratio, enables isDynamicCreative for multi-ratio ads"
```

---

### Task 7: Update Meta Creative Param Naming

**Files:**
- Modify: `src/lib/meta.ts` — `createAdCreative` function

**Step 1: Rename imageHash param for clarity**

In the `createAdCreative` function params (around line 214), rename for clarity:
```typescript
// Before:
imageHash: string;
imageHash9x16?: string;

// After (optional, for code clarity):
imageHash: string;       // Now holds the 4:5 feed image hash
imageHash9x16?: string;  // 9:16 story/reel image hash
```

This is a comment-only change — the actual param names work fine since they're internal.

**Step 2: Update the asset_customization_rules comments**

Update any comments that say "1:1" to say "4:5" so future readers understand what `feed_image` label contains.

**Step 3: Commit**

```bash
git add src/lib/meta.ts
git commit -m "docs: clarify meta creative uses 4:5 for feed, 9:16 for stories"
```

---

### Task 8: Update Compliance Check and Other 1:1 References

**Files:**
- Modify: `src/app/api/image-jobs/[id]/compliance-check/route.ts:44`
- Modify: `src/components/images/MetaAdPreview.tsx:172,493`
- Modify: `src/lib/export-zip.ts:16`

**Step 1: Compliance check**

Line 44 — update filter:
```typescript
// Before:
if (trans.aspect_ratio !== "1:1") continue;

// After:
if (trans.aspect_ratio !== "4:5") continue;
```

**Step 2: MetaAdPreview**

Lines 172 and 493 — update the filter that picks which translation to show in the preview:
```typescript
// Before:
t.aspect_ratio === "1:1" &&

// After:
t.aspect_ratio === "4:5" &&
```

**Step 3: Export zip**

Line 16 — the export creates subfolders for non-1:1 ratios. Update so 4:5 is treated as the default (no subfolder) and 9:16 gets a subfolder:
```typescript
// Before:
const ratioFolder = t.aspect_ratio && t.aspect_ratio !== "1:1" ? `${t.aspect_ratio}/` : "";

// After:
const ratioFolder = t.aspect_ratio && t.aspect_ratio !== "4:5" ? `${t.aspect_ratio}/` : "";
```

**Step 4: Commit**

```bash
git add src/app/api/image-jobs/[id]/compliance-check/route.ts src/components/images/MetaAdPreview.tsx src/lib/export-zip.ts
git commit -m "feat: update compliance check, preview, and export to use 4:5 as primary ratio"
```

---

### Task 9: Update Swipe/Translate Image API Defaults

**Files:**
- Modify: `src/app/api/swipe/generate-image/route.ts:34`
- Modify: `src/app/api/translate-image/route.ts:46,95`
- Modify: `src/app/api/translate-page-images/route.ts:67,84`

**Step 1: Update defaults**

These are standalone image generation endpoints (swiper, page translation). Change their defaults from `"1:1"` to `"4:5"`:

`src/app/api/swipe/generate-image/route.ts:34`:
```typescript
aspectRatio || "4:5"
```

`src/app/api/translate-image/route.ts:46`:
```typescript
aspectRatio || "4:5"
```

`src/app/api/translate-image/route.ts:95`:
```typescript
aspect_ratio: aspectRatio || "4:5",
```

`src/app/api/translate-page-images/route.ts:67`:
```typescript
let detectedAspectRatio = aspectRatio || "4:5";
```

Note: `translate-page-images` has auto-detection logic (line 84) that detects ratios from image dimensions. The `"1:1"` detection there (`if (ratio > 0.9) detectedAspectRatio = "1:1"`) should stay — it's detecting actual image dimensions, and if an image IS square it should be tagged as 1:1. Same for `ImagePanel.tsx` and `ImageSelectionModal.tsx` — those detect actual ratios, not set defaults.

**Step 2: Commit**

```bash
git add src/app/api/swipe/generate-image/route.ts src/app/api/translate-image/route.ts src/app/api/translate-page-images/route.ts
git commit -m "feat: update standalone image APIs to default to 4:5"
```

---

### Task 10: Three-State Toggle in NewConceptModal

**Files:**
- Modify: `src/components/images/NewConceptModal.tsx`

**Step 1: Update DriveFileItem interface**

Replace the `translate: boolean` with a three-state field (lines 17-22):

```typescript
type DriveFileState = "translate" | "skip" | "exclude";

interface DriveFileItem {
  id: string;
  name: string;
  thumbnailLink?: string;
  state: DriveFileState;
}
```

**Step 2: Update default state when files load**

Lines 121-128:
```typescript
setDriveFiles(
  driveFilesList.map((f: { id: string; name: string; thumbnailLink?: string }) => ({
    id: f.id,
    name: f.name,
    thumbnailLink: f.thumbnailLink,
    state: "translate" as DriveFileState,
  }))
);
```

**Step 3: Update toggle function**

Replace `toggleTranslate` (lines 162-166):
```typescript
function cycleState(index: number) {
  setDriveFiles((prev) =>
    prev.map((f, i) => {
      if (i !== index) return f;
      const next: DriveFileState =
        f.state === "translate" ? "skip" :
        f.state === "skip" ? "exclude" : "translate";
      return { ...f, state: next };
    })
  );
}
```

**Step 4: Update computed counts**

Replace line 154:
```typescript
const translateCount = driveFiles.filter((f) => f.state === "translate").length;
const skipCount = driveFiles.filter((f) => f.state === "skip").length;
const excludeCount = driveFiles.filter((f) => f.state === "exclude").length;
const importCount = translateCount + skipCount;
const totalFiles = driveFiles.length;
```

**Step 5: Update the download loop to skip excluded files**

In `handleSubmit` (line 202-206), filter out excluded files:
```typescript
// Before:
const allFiles = [...driveFiles];

// After:
const allFiles = driveFiles.filter((f) => f.state !== "exclude");
```

And update the skipTranslation mapping (line 219):
```typescript
// Before:
skipTranslation: !driveFile.translate,

// After:
skipTranslation: driveFile.state === "skip",
```

**Step 6: Update the thumbnail grid UI**

Replace the grid rendering (lines 354-396) with three-state visuals:

```tsx
<div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto">
  {driveFiles.map((file, i) => (
    <button
      key={file.id}
      type="button"
      onClick={() => cycleState(i)}
      className={`relative rounded-lg overflow-hidden border-2 transition-all ${
        file.state === "translate"
          ? "border-indigo-400 ring-1 ring-indigo-200"
          : file.state === "skip"
          ? "border-gray-200 opacity-60"
          : "border-red-200 opacity-40"
      }`}
      title={`${file.name}\n${
        file.state === "translate" ? "Will be translated" :
        file.state === "skip" ? "Import only (no translation)" :
        "Excluded from import"
      }`}
    >
      <div className="aspect-square bg-gray-100">
        {file.thumbnailLink ? (
          <img
            src={file.thumbnailLink}
            alt={file.name}
            className={`w-full h-full object-cover ${file.state === "exclude" ? "grayscale" : ""}`}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
            No preview
          </div>
        )}
        {file.state === "exclude" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <X className="w-8 h-8 text-red-400" />
          </div>
        )}
      </div>
      <div className={`absolute top-1 right-1 px-1.5 py-0.5 rounded-full flex items-center justify-center text-[9px] font-semibold leading-none ${
        file.state === "translate"
          ? "bg-indigo-600 text-white"
          : file.state === "skip"
          ? "bg-gray-400 text-white"
          : "bg-red-400 text-white"
      }`}>
        {file.state === "translate" ? "Translate" : file.state === "skip" ? "Skip" : "Exclude"}
      </div>
      <div className="px-1 py-0.5 bg-white">
        <p className={`text-[10px] truncate ${file.state === "exclude" ? "text-red-400 line-through" : "text-gray-500"}`}>
          {file.name}
        </p>
      </div>
    </button>
  ))}
</div>
```

**Step 7: Update summary line**

Replace line 350-352:
```typescript
<p className="text-xs text-gray-400">
  {translateCount} of {totalFiles} will be translated
  {skipCount > 0 && `, ${skipCount} skipped`}
  {excludeCount > 0 && `, ${excludeCount} excluded`}
</p>
```

**Step 8: Update the cost calculation**

In the summary box (lines 481-498), the `translateCount` variable already only counts `state === "translate"` files, so the cost calculation just works. But update the display text:

```typescript
<p className="text-xs text-gray-400 mt-0.5">
  {importCount} images ({translateCount} to translate) &times; {selectedLanguages.size} languages &times; 2 ratios = {totalTranslations} translations
  {" "}(~{(totalTranslations * 1).toFixed(0)} kr)
</p>
```

Update `totalTranslations` to account for 2 ratios:
```typescript
const ratioCount = 2; // 4:5 + 9:16
const totalTranslations = translateCount * selectedLanguages.size * ratioCount;
```

**Step 9: Update the submit validation**

Line 169 — check `importCount` instead of `totalFiles`:
```typescript
if (importCount === 0 || !name.trim() || selectedLanguages.size === 0) return;
```

**Step 10: Commit**

```bash
git add src/components/images/NewConceptModal.tsx
git commit -m "feat: three-state toggle in import modal (translate/skip/exclude)"
```

---

### Task 11: Clean Up Unused Constants

**Files:**
- Modify: `src/lib/constants.ts:65-75`

**Step 1: Remove EXPANSION_PROMPT**

Delete the unused `EXPANSION_PROMPT` constant from `src/lib/constants.ts` (lines 65-75). This was for the old 1:1→9:16 outpainting approach that's no longer used.

**Step 2: Commit**

```bash
git add src/lib/constants.ts
git commit -m "chore: remove unused EXPANSION_PROMPT constant"
```

---

### Task 12: Smoke Test

**Step 1: Run the dev server**

```bash
npm run dev
```

**Step 2: Verify in browser**

1. Go to `/images` → "New Ad Concept"
2. Select a Drive folder → verify three-state toggle works (translate/skip/exclude)
3. Verify excluded images show X overlay and strikethrough
4. Verify cost summary accounts for 2 ratios
5. Create a test concept → verify translations are created for both 4:5 and 9:16
6. Check Settings page → verify default ratios show 4:5 + 9:16

**Step 3: Run all tests**

```bash
npm test
```

Expected: All pass

**Step 4: Final commit if any fixes needed**
