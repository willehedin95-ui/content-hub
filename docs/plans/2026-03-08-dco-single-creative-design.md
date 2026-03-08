# DCO Single Creative Fix

**Date:** 2026-03-08
**Problem:** Push creates one ad per image, but `is_dynamic_creative=true` ad sets only allow 1 ad. Ads 2-5 fail with subcode 1885553.

## Design

### Current flow (broken)
1. Upload images in parallel
2. Create one creative per image (each with single image + single text)
3. Create one ad per creative → **Meta rejects ads 2-5**

### New flow
1. Upload all images in parallel (no change)
2. Create **one** creative with `asset_feed_spec` containing:
   - `images[]` — all feed image hashes (up to 10, Meta's DCO max)
   - `bodies[]` — all primary text variants
   - `titles[]` — all headline variants
   - `asset_customization_rules` — route 4:5→feed, 9:16→stories/reels (when 9:16 siblings exist)
3. Create **one** ad with that creative

### Changes

#### `meta.ts` — `createAdCreative`
- Accept `images: Array<{ hash: string; label?: string }>` instead of single `imageHash`
- Accept `bodies: string[]` and `titles: string[]` instead of single strings
- Build `asset_feed_spec.images` from the array
- Build `asset_customization_rules` for any images that have 9:16 siblings (ad labels pair feed→story images)

#### `meta-push.ts` — Phase 2+3
- After uploading, collect all successful image hashes into one array
- Create one creative with all hashes + all copy variants
- Create one ad
- Store one `meta_ads` row with `image_urls` (JSON array) for all images

#### `meta_ads` table
- Add `image_urls jsonb` column (array of all image URLs in the creative)
- Keep `image_url` for backward compat (set to first image)

#### "Add to existing" path
- When adding new images to an existing ad set, we need to **replace** the existing creative/ad with an updated one that includes both old and new images. This is a separate concern and can remain as-is initially (creating a new ad with just the new images will still fail with the 1-ad limit, but we can address iteration batches later).

### 9:16 placement rules with multiple images
Each image pair (4:5 + 9:16) gets its own ad label pair. Example with 3 images:
- `feed_1` → image hash A (4:5), `story_1` → image hash A' (9:16)
- `feed_2` → image hash B (4:5), `story_2` → image hash B' (9:16)
- etc.

Customization rules map all `feed_*` labels to feed placements, all `story_*` to stories/reels.

For images without a 9:16 sibling, no label is needed — they serve all placements.

### No change needed
- Ad set creation (already correct)
- Image upload logic
- Copy translation
- Scheduling
- Concept number assignment
