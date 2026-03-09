# Pixar Product References — Per-Shot Image Picker

**Date:** 2026-03-08
**Status:** Approved

## Problem

Pixar Animation brainstorm mode generates first-frame images via Nano Banana using only text prompts. The generated product characters (e.g. pillow) don't resemble the actual HappySleep product because no reference photos are passed.

## Solution

Add a per-shot product image picker in the pipeline UI. Before generating shot images, users can select product photos from the Product Bank as reference images for each shot. These are passed to Nano Banana via `image_input`.

## Design

### Database

- Add `reference_image_urls text[] default '{}'` column to `video_shots` table

### UI (MultiClipPipeline.tsx)

When `overallStatus === "pending"` and `job.format_type === "pixar_animation"` and shots exist:

1. Collapsible **"Product References"** panel above the "Generate Shot Images" button
2. Panel lists each shot vertically:
   - Shot number + truncated description
   - Row of product image thumbnails fetched from `/api/products/{slug}/images`
   - Click thumbnail to toggle on/off (highlighted border when selected)
   - Small count badge: "2 selected"
3. **"Apply to all"** shortcut — select images once and apply same selection to every shot
4. Selections saved to `video_shots.reference_image_urls` via PATCH

### Backend (shot-images/route.ts)

- Read `shot.reference_image_urls` per shot in addition to `job.character_ref_urls`
- Merge: `const refs = [...charRefUrls, ...(shot.reference_image_urls || [])]`
- Pass combined refs to `createImageTask(prompt, refs, "2:3", "1K")`

### New API endpoint

- `PATCH /api/video-jobs/[id]/shots/[shotId]/references` — save `reference_image_urls` array to a shot

### Flow

1. User approves Pixar concept → video job + shots created (as today)
2. User opens pipeline page → sees shots in pending state
3. Expands "Product References" panel → sees product thumbnails per shot
4. Toggles on relevant photos for relevant shots
5. Clicks "Generate Shot Images" → API reads per-shot references → Nano Banana gets product photos as `image_input`
