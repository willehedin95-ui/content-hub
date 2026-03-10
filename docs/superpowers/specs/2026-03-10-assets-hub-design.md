# Assets Hub Redesign

Unify image assets, video assets, and AI swiper tools into a single `/assets` page with sidebar navigation, product-based filtering, and URL import.

## Context

The current Asset Bank (`/assets`) only supports image uploads with generic categories (logo, icon, badge, background, other). The Video Swiper lives as a standalone page at `/video-swiper`. Assets are primarily used for landing pages, not ads — so quick retrieval by product and type matters most.

## Design

### Page Structure

Left sidebar + main content area, replacing the current tab-based layout.

**Sidebar sections:**
- **Library**: Images (with count), Videos (with count)
- **Tools**: Swipe Image, Swipe Video
- **Product**: All Products, HappySleep, Hydro13, General

Clicking a Library item shows the asset grid for that media type. Clicking a Tool item shows the swiper UI inline in the main content area. Product filter applies globally to whichever view is active.

### Categories

Replace the old enum with landing-page-oriented types:
- `product` — Product-only shots (pillow on white, bottle, packaging)
- `model` — People using/holding the product
- `lifestyle` — Ambient/aspirational scenes
- `graphic` — Icons, badges, trust seals, diagrams, infographics
- `logo` — Brand logos, wordmarks
- `before_after` — Before/after comparison imagery
- `other` — Catch-all

Shown as filter pills above the asset grid.

### Upload Flows

**File upload** (existing, expanded):
- Drag-drop or click to select files
- Now accepts both images (PNG, JPG, WEBP, GIF) and videos (MP4, MOV)
- After selection: preview, name input, category dropdown, product dropdown
- Stored in Supabase Storage at `assets/{media_type}/{category}/{timestamp}-{filename}`

**URL import** (new):
- Paste a direct file URL → click Fetch
- Server-side: fetch URL, validate content-type, download to Supabase Storage
- Show preview with file size and dimensions after fetch
- Same metadata form (name, category, product) before saving
- `source_url` stored on the asset record for reference

### Image Swiper (new tool)

Upload/drop a competitor image → select target product → optional notes → submit.

Flow:
1. Claude Vision analyzes the competitor image's style, composition, color palette, layout
2. Generates a Nano Banana prompt adapted for the target product
3. Nano Banana generates a new image inspired by the competitor's approach
4. Result saved directly to the asset library with proper metadata

### Video Swiper (moved from /video-swiper)

Same functionality as the existing Video Swiper, relocated into the Assets Hub sidebar. Old `/video-swiper` route redirects to `/assets`.

Flow: Upload competitor video → extract frames (FFmpeg WASM) → Claude Vision analyzes → generate Kling AI prompts → generate video scenes → save to video assets.

### Data Model Changes

Add columns to `assets` table:
- `media_type` TEXT NOT NULL DEFAULT 'image' — `'image'` or `'video'`
- `product` TEXT — `'happysleep'`, `'hydro13'`, or null (general)
- `file_size` BIGINT — bytes
- `dimensions` TEXT — `'1920x1080'` or null
- `duration` REAL — seconds, video only
- `source_url` TEXT — original URL if imported via URL

Update category enum:
- Old: `logo | icon | badge | background | other`
- New: `product | model | lifestyle | graphic | logo | before_after | other`

Migrate existing assets: map `icon` → `graphic`, `badge` → `graphic`, `background` → `other`, keep `logo` and `other` as-is.

### Key Behaviors

- **Search**: Client-side filtering on name, tags, and category
- **Product filter**: Sidebar selection filters assets to selected product. "General" = assets with null product
- **Video thumbnails**: Auto-generated on upload (first frame extraction)
- **Swiper output**: Generated images/videos saved directly to asset library with metadata pre-filled
- **Backward compat**: `/video-swiper` redirects to `/assets` with video swiper tool active

## Files Affected

- `src/app/assets/page.tsx` — Page wrapper (minor changes)
- `src/components/assets/AssetManager.tsx` — Major rewrite (sidebar layout, video support, URL import)
- `src/app/api/assets/route.ts` — Add video upload, URL import endpoint
- `src/app/api/assets/[id]/route.ts` — Update for new fields
- `src/types/index.ts` — Update AssetCategory type, add new fields to Asset interface
- New: `src/components/assets/ImageSwiper.tsx` — Image swiper tool component
- Move: `src/components/video-swiper/VideoSwiperClient.tsx` → `src/components/assets/VideoSwiper.tsx`
- Move: API routes from `src/app/api/video-swiper/` → `src/app/api/assets/video-swiper/`
- `src/app/video-swiper/` — Replace with redirect to `/assets`
- `src/lib/video-swiper-prompt.ts` — No changes (keep as-is)
- `src/lib/video-frame-extractor.ts` — No changes (keep as-is)
- Database migration: Add columns, update category values
