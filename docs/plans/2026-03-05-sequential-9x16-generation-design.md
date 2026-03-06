# Sequential 4:5 → 9:16 Generation with Outpainting

**Date:** 2026-03-05
**Status:** Approved

## Problem

Currently, "Translate All" generates both 4:5 and 9:16 translations simultaneously. This wastes Nano Banana credits when the user rerolls images they don't like — both ratios get thrown away. Additionally, 9:16 images have no safe zone awareness for Instagram/Facebook Stories and Reels UI overlays.

## Solution

Split generation into two sequential steps:

1. **Generate 4:5 only** — user reviews, rerolls until happy
2. **Generate 9:16 from approved 4:5** — outpaint the validated 4:5 images to 9:16 using Nano Banana

The 9:16 versions use the completed 4:5 translated images as reference input. Nano Banana extends the background vertically — the core creative (text, product, hook) stays in the 4:5 center area, and the extended top/bottom becomes filler that naturally falls behind Instagram/Facebook UI overlays.

## Safe Zone Context (1080x1920)

| Placement | Top | Bottom | Left | Right |
|-----------|-----|--------|------|-------|
| IG/FB Stories | 270px (14%) | 380px (20%) | 65px (6%) | 65px (6%) |
| IG/FB Reels | 270px (14%) | 670px (35%) | 65px (6%) | 120px (11%) |

The 4:5→9:16 extension adds ~285px top + ~285px bottom, which covers the top safe zone (270px) almost exactly. The bottom safe zone for Reels (670px) extends into the 4:5 area, but text/hooks are typically in the upper-center of the 4:5 composition.

## Workflow

1. User clicks "Translate All" → creates **only 4:5** translation rows
2. Queue processes 4:5 translations (concurrency 3, quality analysis, auto-retry)
3. User reviews results, rerolls source images or retries translations as needed
4. When ALL 4:5 translations are completed → **"Generate 9:16 Versions"** button appears
5. Clicking it creates 9:16 translation rows and queues generation
6. Each 9:16 generation uses the approved 4:5 sibling's `translated_url` as `image_input`
7. Both ratios done → step marked complete, ready for Meta push

## API Changes

### Modified: `POST /api/image-jobs/[id]/create-translations`

- Default `target_ratios` changes from `["4:5", "9:16"]` to `["4:5"]`
- Only creates 4:5 translation rows

### New: `POST /api/image-jobs/[id]/generate-9x16`

- Validates all 4:5 translations are completed
- For each completed 4:5 translation, creates a 9:16 translation row with same `source_image_id` and `language`
- Returns the created rows so the client can queue them via `startQueue`

### Modified: `POST /api/image-jobs/[id]/translate`

- When `aspect_ratio === "9:16"`:
  - Looks up the 4:5 sibling translation for the same `source_image_id` + `language`
  - Uses sibling's `translated_url` as `image_input` (instead of `source_images.original_url`)
  - Uses outpainting prompt instead of translation prompt:
    ```
    Extend this image vertically to fill a 9:16 portrait format.
    Continue the existing background naturally above and below.
    Do not add any new text, logos, or visual elements in the
    extended areas — only extend the background seamlessly.
    ```

## UI Changes

### ConceptImagesStep.tsx

- "Translate All" flow unchanged (but only generates 4:5)
- After all 4:5 translations complete → show "Generate 9:16 Versions" button
- Button triggers `/generate-9x16` then queues via existing `startQueue`
- Translation status rows show 9:16 status once those rows exist
- Step completion requires both 4:5 and 9:16 translations to be done

## Unchanged

- **Meta push** (`meta-push.ts`): Already pairs 4:5/9:16 by `source_image_id:language` — works automatically
- **Reroll**: Cascade-deletes all translations for the source image. User re-translates 4:5, then clicks "Generate 9:16" again
- **Quality analysis**: Applies to 9:16 translations the same as 4:5
- **Old jobs**: Existing translations with 9:16 already generated are unaffected
