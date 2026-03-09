# Landing Page Selector Modal

## Problem

The current landing page selector is a plain `<select>` dropdown with text-only page names. When choosing a landing page for an ad concept, it's hard to visually match a page to the concept's angle without seeing what the page looks like.

## Solution

Replace the dropdown with a modal that shows small thumbnails of each landing page, categorized by angle (snoring, neck pain, neutral). Auto-selects the matching category tab based on the concept's angle.

## Database Changes

### New columns on `pages` table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `angle` | `text CHECK (angle IN ('snoring', 'neck_pain', 'neutral'))` | `'neutral'` | Marketing angle category |
| `thumbnail_url` | `text` | `NULL` | Supabase Storage URL of auto-generated screenshot |

### Backfill

Set `angle` for existing pages based on name/tags heuristics (pages with "snoring"/"snore" → `snoring`, "neck"/"pain" → `neck_pain`, rest → `neutral`).

## Screenshot Capture

- **Trigger:** After successful publish to Cloudflare Pages in `cloudflare-pages.ts`
- **Method:** Playwright navigates to `published_url`, takes viewport screenshot at 375px width (mobile)
- **Storage:** Upload to Supabase Storage bucket, store public URL in `pages.thumbnail_url`
- **Re-capture:** Only if `thumbnail_url` is null or on explicit refresh action

## Modal UI

### Trigger

Replace the `<select>` with a button showing selected page name + small thumbnail (or "Select landing page" if none).

### Layout

```
┌─────────────────────────────────────────────┐
│  Select Landing Page                     ✕  │
├─────────────────────────────────────────────┤
│  [Snoring (3)]  [Neck Pain (4)]  [Neutral (2)]  [A/B Tests (1)]  │
├─────────────────────────────────────────────┤
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐   │
│  │ thumb│  │ thumb│  │ thumb│  │ thumb│     │
│  └──────┘  └──────┘  └──────┘  └──────┘    │
│  Page Name  Page Name  Page Name  Page Name │
│  ★ advert.  listicle   ★ advert.  listicle  │
└─────────────────────────────────────────────┘
```

- **Tabs:** Snoring | Neck Pain | Neutral | A/B Tests — with count badges
- **Auto-select:** Pre-selects tab matching concept's angle (from `tags[]` or `cash_dna.angle`)
- **Grid:** 3-4 columns of thumbnail cards (~120px wide)
- **Card:** Thumbnail image (or colored placeholder), page name, page type badge
- **Selected state:** Blue border on currently selected page
- **Click:** Selects page and closes modal

### Auto-angle detection for concepts

Check concept's `tags[]` and `cash_dna.angle`:
- Contains "snoring"/"snore" → Snoring tab
- Contains "neck"/"pain" → Neck Pain tab
- Otherwise → Neutral tab

## Angle Selector on Page Detail

Add a 3-button toggle (Snoring / Neck Pain / Neutral) to the page detail screen at `/pages/[id]` for manual categorization.

## Files to Modify

| File | Change |
|------|--------|
| `pages` table (DDL) | Add `angle`, `thumbnail_url` columns |
| `src/types/index.ts` | Add `angle` to Page type, add `PageAngle` type |
| New: `src/components/images/LandingPageModal.tsx` | Modal component with tabs + thumbnail grid |
| `src/components/images/ConceptAdCopyStep.tsx` | Replace `<select>` with modal trigger button |
| `src/lib/cloudflare-pages.ts` | Add screenshot capture after publish |
| `src/app/api/meta/assets/landing-pages/route.ts` | Return `angle` and `thumbnail_url` fields |
| `src/app/pages/[id]/page.tsx` | Add angle selector toggle |
| Backfill script | Set angles for existing pages |
