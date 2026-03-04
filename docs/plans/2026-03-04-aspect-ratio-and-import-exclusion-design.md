# Design: Switch to 4:5 + 9:16 Aspect Ratios & Image Import Exclusion

**Date:** 2026-03-04

## Overview

Two changes:
1. Replace 1:1 aspect ratio with 4:5 (feed) + 9:16 (stories/reels) for all new concepts
2. Add image exclusion in NewConceptModal so unwanted images aren't imported at all

## Feature 1: Image Exclusion on Import

### Problem
When importing from Google Drive, all images get downloaded. User can toggle "skip translation" but can't prevent import of unwanted/duplicate images entirely.

### Solution: Three-state toggle in NewConceptModal

Each `DriveFileItem` gets a `state` field (replacing boolean `translate`):

| State | Visual | Behavior |
|-------|--------|----------|
| **translate** (default) | Blue border, "Translate" badge | Downloaded + translation created |
| **skip** | Gray, opacity-60, "Skip" badge | Downloaded, `skip_translation: true` |
| **exclude** | Strikethrough/dimmed, "Excluded" badge | Not downloaded at all |

- Click cycles: translate → skip → exclude → translate
- Summary line: `"5 of 8 will be translated, 1 skipped, 2 excluded"`
- On submit: excluded files filtered out before download loop
- No backend changes — exclusion is a frontend filter

### Files changed
- `src/components/images/NewConceptModal.tsx` — state type, toggle logic, visual states, summary text

## Feature 2: Switch from 1:1 to 4:5 + 9:16

### Problem
Currently only generates 1:1 images. 4:5 takes more screen space in feed (better CTR), 9:16 is required for full-screen stories/reels. The 1:1-only approach wastes placement potential.

### Type system changes
- `AspectRatio` type: `"4:5" | "9:16"` (drop `"1:1"`)
- `ASPECT_RATIOS` constant: `[{ value: "4:5", label: "4:5 Feed" }, { value: "9:16", label: "9:16 Story/Reel" }]`
- Existing 1:1 data in DB untouched — old jobs still render

### Translation creation fix
- `create-translations/route.ts` currently hardcodes `aspect_ratio: "1:1"` — fix to loop through `job.target_ratios`
- New concepts default to `target_ratios: ["4:5", "9:16"]`

### Kie AI generation
- No changes — `generateImage()` already passes `aspect_ratio` to nano-banana-2 which handles it natively

### Meta push flow changes (`meta-push.ts`)
- Primary filter: `"1:1"` → `"4:5"` (4:5 becomes the base image for feed)
- Sibling lookup stays `"9:16"` for stories/reels
- Pass `isDynamicCreative: true` when creating ad sets (fixes existing bug where asset_feed_spec silently fails)

### Meta creative changes (`meta.ts`)
- `asset_customization_rules` placement routing unchanged in structure
- `"feed_image"` serves 4:5 to: feed, marketplace, video_feeds, search, right_hand_column, stream, explore, explore_home, profile_feed, ig_search
- `"story_image"` serves 9:16 to: story, reels, facebook_reels

### Default behavior
- New concepts: `target_ratios` defaults to `["4:5", "9:16"]`
- Both ratios always generated — no ratio picker needed in UI

### Cost impact
- Doubles translation cost per concept (2 ratios vs 1)
- With 3-5 images × 3 markets: ~$2.70-$4.50 per concept (acceptable)

## Files to modify

| File | Change |
|------|--------|
| `src/types/index.ts` | Update `AspectRatio` type and `ASPECT_RATIOS` constant |
| `src/components/images/NewConceptModal.tsx` | Three-state toggle, exclude filter, default ratios |
| `src/app/api/image-jobs/[id]/create-translations/route.ts` | Loop through `job.target_ratios` instead of hardcoding 1:1 |
| `src/lib/meta-push.ts` | Filter by 4:5 instead of 1:1, pass `isDynamicCreative: true` |
| `src/lib/meta.ts` | Update `createAdCreative` param naming (imageHash is now 4:5) |
| `src/lib/constants.ts` | Remove unused `EXPANSION_PROMPT` |
| Any UI showing aspect ratio labels | Update 1:1 references to 4:5 |
