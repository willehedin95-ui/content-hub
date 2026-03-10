# Assets Hub Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify image/video assets, URL import, and AI swiper tools into a single `/assets` page with sidebar navigation.

**Architecture:** Rewrite the `/assets` page as a sidebar-based hub. Left sidebar splits Library (Images/Videos) and Tools (Swipe Image/Swipe Video) with product filtering. Main content area shows asset grids or swiper tools depending on sidebar selection. Database schema extended with `media_type`, `product`, and metadata columns. Video Swiper moved from `/video-swiper` into the assets hub. New Image Swiper tool added.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (PostgreSQL + Storage), Tailwind CSS, Anthropic Claude API (Vision), Kie AI (Nano Banana), FFmpeg WASM

**Spec:** `docs/superpowers/specs/2026-03-10-assets-hub-design.md`

---

## File Structure

### New files
- `src/components/assets/AssetsSidebar.tsx` — Left sidebar navigation (Library/Tools/Product sections)
- `src/components/assets/AssetGrid.tsx` — Asset grid with search, filter pills, upload buttons
- `src/components/assets/UrlImportModal.tsx` — URL import dialog (fetch → preview → save)
- `src/components/assets/ImageSwiper.tsx` — Image swiper tool (competitor image → AI recreation)
- `src/components/assets/VideoSwiper.tsx` — Video swiper tool (moved from `src/components/video-swiper/VideoSwiperClient.tsx`)
- `src/app/api/assets/import-url/route.ts` — Server-side URL fetch + store endpoint
- `src/app/api/assets/image-swiper/route.ts` — Image swiper API (Claude Vision → Nano Banana)

### Modified files
- `src/types/index.ts` — Update `AssetCategory`, `Asset` interface, add `ASSET_CATEGORIES` new values
- `src/app/api/assets/route.ts` — Support video uploads, new fields (product, media_type, etc.), new category enum
- `src/app/api/assets/[id]/route.ts` — Support new fields in PATCH
- `src/app/assets/page.tsx` — Rewrite to use new hub layout
- `src/components/assets/AssetManager.tsx` — Major rewrite → hub orchestrator with sidebar state
- `src/components/layout/Sidebar.tsx` — Remove Video Swiper from Ads group, keep Assets as top-level
- `src/app/video-swiper/page.tsx` — Replace with redirect to `/assets`

### Deleted files
- `src/components/video-swiper/VideoSwiperClient.tsx` — Moved to `src/components/assets/VideoSwiper.tsx`

### Unchanged (dependencies)
- `src/lib/video-swiper-prompt.ts` — Prompt builders (no changes)
- `src/lib/video-frame-extractor.ts` — Frame extraction (no changes)
- `src/app/api/video-swiper/route.ts` — Video swiper API (keep, referenced by new VideoSwiper component)
- `src/app/api/video-swiper/status/route.ts` — Video swiper polling (keep, referenced by new VideoSwiper component)
- `src/lib/validation.ts` — Already has `validateMediaFile()` for both images and videos

---

## Chunk 1: Database Migration + Type Updates

### Task 1: Database Migration — Add columns to assets table

**Files:**
- Modify: Database schema via Supabase Management API

- [ ] **Step 1: Run migration to add new columns**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE assets ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT '\''image'\''; ALTER TABLE assets ADD COLUMN IF NOT EXISTS product TEXT; ALTER TABLE assets ADD COLUMN IF NOT EXISTS file_size BIGINT; ALTER TABLE assets ADD COLUMN IF NOT EXISTS dimensions TEXT; ALTER TABLE assets ADD COLUMN IF NOT EXISTS duration REAL; ALTER TABLE assets ADD COLUMN IF NOT EXISTS source_url TEXT;"}'
```

Expected: 200 OK, columns added.

- [ ] **Step 2: Migrate existing category values**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "UPDATE assets SET category = '\''graphic'\'' WHERE category IN ('\''icon'\'', '\''badge'\''); UPDATE assets SET category = '\''other'\'' WHERE category = '\''background'\'';"}'
```

Expected: 200 OK, existing rows migrated.

- [ ] **Step 3: Verify migration**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '\''assets'\'' ORDER BY ordinal_position;"}'
```

Expected: All new columns (media_type, product, file_size, dimensions, duration, source_url) visible.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: run assets table migration (add media_type, product, metadata columns)"
```

### Task 2: Update TypeScript types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Update AssetCategory type and ASSET_CATEGORIES constant**

In `src/types/index.ts`, replace the old `AssetCategory` type (line ~1175) and `ASSET_CATEGORIES` constant (lines ~1177-1183):

```typescript
// Old:
export type AssetCategory = "logo" | "icon" | "badge" | "background" | "other";
export const ASSET_CATEGORIES: AssetCategory[] = [
  "logo",
  "icon",
  "badge",
  "background",
  "other",
];

// New:
export type AssetCategory = "product" | "model" | "lifestyle" | "graphic" | "logo" | "before_after" | "other";
export const ASSET_CATEGORIES: AssetCategory[] = [
  "product",
  "model",
  "lifestyle",
  "graphic",
  "logo",
  "before_after",
  "other",
];

export type MediaType = "image" | "video";
```

- [ ] **Step 2: Update Asset interface**

Replace the old `Asset` interface (lines ~1185-1194):

```typescript
// Old:
export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  tags: string[];
  url: string;
  alt_text: string | null;
  description: string | null;
  created_at: string;
}

// New:
export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  media_type: MediaType;
  product: Product | null;
  tags: string[];
  url: string;
  alt_text: string | null;
  description: string | null;
  file_size: number | null;
  dimensions: string | null;
  duration: number | null;
  source_url: string | null;
  created_at: string;
}
```

- [ ] **Step 3: Verify no type errors**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | head -30
```

Expected: Type errors in AssetManager.tsx and API routes (expected — will fix in later tasks).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts && git commit -m "feat: update Asset types with media_type, product, and metadata fields"
```

---

## Chunk 2: API Layer Updates

### Task 3: Update POST /api/assets to support videos + new fields

**Files:**
- Modify: `src/app/api/assets/route.ts`

- [ ] **Step 1: Update the route to accept videos and new fields**

Rewrite `src/app/api/assets/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { validateMediaFile } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import type { AssetCategory, MediaType } from "@/types";
import { ASSET_CATEGORIES } from "@/types";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const category = req.nextUrl.searchParams.get("category");
  const mediaType = req.nextUrl.searchParams.get("media_type");
  const product = req.nextUrl.searchParams.get("product");
  const search = req.nextUrl.searchParams.get("search");

  let query = db.from("assets").select("*").order("created_at", { ascending: false });

  if (category && ASSET_CATEGORIES.includes(category as AssetCategory)) {
    query = query.eq("category", category);
  }
  if (mediaType && (mediaType === "image" || mediaType === "video")) {
    query = query.eq("media_type", mediaType);
  }
  if (product) {
    if (product === "general") {
      query = query.is("product", null);
    } else {
      query = query.eq("product", product);
    }
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,tags.cs.{${search}}`);
  }

  const { data, error } = await query;
  if (error) return safeError(error, "Failed to fetch assets");
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string) || "";
  const category = ((formData.get("category") as string) || "other") as AssetCategory;
  const product = (formData.get("product") as string) || null;
  const altText = formData.get("alt_text") as string | null;
  const description = formData.get("description") as string | null;
  const tagsRaw = formData.get("tags") as string | null;

  if (!file) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }
  if (!name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const validation = validateMediaFile(file);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const isVideo = file.type.startsWith("video/") || ["mp4", "mov", "webm"].includes(validation.ext);
  const mediaType: MediaType = isVideo ? "video" : "image";

  const db = createServerSupabase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `assets/${mediaType}/${category}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await db.storage
    .from("translated-images")
    .upload(filename, buffer, { contentType: file.type, upsert: false });

  if (uploadError) return safeError(uploadError, "Failed to upload file");

  const { data: { publicUrl } } = db.storage.from("translated-images").getPublicUrl(filename);

  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const { data, error } = await db
    .from("assets")
    .insert({
      name: name.trim(),
      category,
      media_type: mediaType,
      product: product || null,
      tags,
      url: publicUrl,
      alt_text: altText,
      description,
      file_size: file.size,
      source_url: null,
    })
    .select()
    .single();

  if (error) return safeError(error, "Failed to save asset");
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Update PATCH to support new fields**

In `src/app/api/assets/[id]/route.ts`, add the new fields to the PATCH handler's allowed fields:

```typescript
// Add after existing field checks in PATCH handler:
if (body.product !== undefined) updates.product = body.product;
if (body.media_type !== undefined) updates.media_type = body.media_type;
```

- [ ] **Step 3: Verify API compiles**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | grep "api/assets" | head -10
```

Expected: No errors in API route files.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/assets/route.ts src/app/api/assets/\[id\]/route.ts && git commit -m "feat: update asset API — video support, product filter, search, new fields"
```

### Task 4: Create URL import API endpoint

**Files:**
- Create: `src/app/api/assets/import-url/route.ts`

- [ ] **Step 1: Create the import-url endpoint**

Create `src/app/api/assets/import-url/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_VIDEO_EXTENSIONS,
} from "@/lib/validation";
import type { AssetCategory, MediaType } from "@/types";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { url, name, category, product } = body as {
    url?: string;
    name?: string;
    category?: AssetCategory;
    product?: string;
  };

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Fetch the file
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "ContentHub/1.0" },
      redirect: "follow",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: `Failed to fetch URL: ${msg}` }, { status: 400 });
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: `URL returned ${response.status}` },
      { status: 400 }
    );
  }

  // Validate content type
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "";
  let ext = ALLOWED_CONTENT_TYPES[contentType];

  // Fallback: try extension from URL
  if (!ext) {
    const urlExt = parsedUrl.pathname.split(".").pop()?.toLowerCase() || "";
    if (ALLOWED_IMAGE_EXTENSIONS.has(urlExt) || ALLOWED_VIDEO_EXTENSIONS.has(urlExt)) {
      ext = urlExt;
    }
  }

  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported file type: ${contentType}` },
      { status: 400 }
    );
  }

  const isVideo = ALLOWED_VIDEO_EXTENSIONS.has(ext);
  const mediaType: MediaType = isVideo ? "video" : "image";

  // Download file
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 200 MB)" }, { status: 413 });
  }

  // Derive filename
  const assetName = name?.trim() || parsedUrl.pathname.split("/").pop()?.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") || "imported-asset";
  const assetCategory: AssetCategory = category || "other";

  // Upload to Supabase Storage
  const db = createServerSupabase();
  const storagePath = `assets/${mediaType}/${assetCategory}/${Date.now()}-imported.${ext}`;

  const { error: uploadError } = await db.storage
    .from("translated-images")
    .upload(storagePath, buffer, {
      contentType: contentType || `${mediaType}/${ext}`,
      upsert: false,
    });

  if (uploadError) return safeError(uploadError, "Failed to store file");

  const { data: { publicUrl } } = db.storage.from("translated-images").getPublicUrl(storagePath);

  // Create asset record
  const { data, error } = await db
    .from("assets")
    .insert({
      name: assetName,
      category: assetCategory,
      media_type: mediaType,
      product: product || null,
      tags: [],
      url: publicUrl,
      file_size: buffer.length,
      source_url: url,
    })
    .select()
    .single();

  if (error) return safeError(error, "Failed to save asset");
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | grep "import-url" | head -5
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/assets/import-url/route.ts && git commit -m "feat: add URL import endpoint for assets"
```

---

## Chunk 3: Assets Hub UI — Sidebar + Grid

### Task 5: Create AssetsSidebar component

**Files:**
- Create: `src/components/assets/AssetsSidebar.tsx`

- [ ] **Step 1: Create the sidebar component**

Create `src/components/assets/AssetsSidebar.tsx`:

```typescript
"use client";

import { ImageIcon, Film, Sparkles, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product, MediaType } from "@/types";

export type AssetView = "images" | "videos" | "swipe-image" | "swipe-video";

interface Props {
  activeView: AssetView;
  onViewChange: (view: AssetView) => void;
  activeProduct: Product | "all" | "general";
  onProductChange: (product: Product | "all" | "general") => void;
  counts: { images: number; videos: number };
}

const LIBRARY_ITEMS: { view: AssetView; label: string; icon: typeof ImageIcon }[] = [
  { view: "images", label: "Images", icon: ImageIcon },
  { view: "videos", label: "Videos", icon: Film },
];

const TOOL_ITEMS: { view: AssetView; label: string; icon: typeof Sparkles }[] = [
  { view: "swipe-image", label: "Swipe Image", icon: Sparkles },
  { view: "swipe-video", label: "Swipe Video", icon: Scissors },
];

const PRODUCT_ITEMS: { value: Product | "all" | "general"; label: string }[] = [
  { value: "all", label: "All Products" },
  { value: "happysleep", label: "HappySleep" },
  { value: "hydro13", label: "Hydro13" },
  { value: "general", label: "General" },
];

export default function AssetsSidebar({
  activeView,
  onViewChange,
  activeProduct,
  onProductChange,
  counts,
}: Props) {
  return (
    <div className="w-52 shrink-0 border-r border-gray-200 bg-gray-50/50 p-4 space-y-6 overflow-y-auto">
      {/* Library */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Library
        </p>
        <div className="space-y-0.5">
          {LIBRARY_ITEMS.map((item) => {
            const count = item.view === "images" ? counts.images : counts.videos;
            return (
              <button
                key={item.view}
                onClick={() => onViewChange(item.view)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
                  activeView === item.view
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    activeView === item.view ? "text-indigo-500" : "text-gray-400"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tools */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Tools
        </p>
        <div className="space-y-0.5">
          {TOOL_ITEMS.map((item) => (
            <button
              key={item.view}
              onClick={() => onViewChange(item.view)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
                activeView === item.view
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Product filter */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Product
        </p>
        <div className="space-y-0.5">
          {PRODUCT_ITEMS.map((item) => (
            <button
              key={item.value}
              onClick={() => onProductChange(item.value)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
                activeProduct === item.value
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/assets/AssetsSidebar.tsx && git commit -m "feat: add AssetsSidebar component"
```

### Task 6: Create AssetGrid component

**Files:**
- Create: `src/components/assets/AssetGrid.tsx`

- [ ] **Step 1: Create the asset grid component**

Create `src/components/assets/AssetGrid.tsx`. This component renders the search bar, category filter pills, upload buttons, and the asset grid. It handles:
- File upload (drag-drop + click) for both images and videos
- Search filtering (client-side on name/tags/category)
- Category filter pills
- Asset cards with edit/delete actions
- Video assets show a play icon overlay and duration badge

Key props:
```typescript
interface Props {
  assets: Asset[];
  mediaType: MediaType;
  onAssetsChange: (assets: Asset[]) => void;
  onOpenUrlImport: () => void;
  activeProduct: Product | "all" | "general";
}
```

The grid layout, edit inline form, and delete flow should match the existing `AssetManager.tsx` patterns but with:
- `media_type` and `product` fields in the upload form
- Video thumbnails rendered as `<video>` elements (poster frame) instead of `<img>`
- File input `accept` changes based on `mediaType` prop: `"image/*"` for images, `"video/mp4,video/quicktime,.mp4,.mov,.webm"` for videos
- Category filter pills using the new `ASSET_CATEGORIES` and labels:
  ```typescript
  const CATEGORY_LABELS: Record<AssetCategory, string> = {
    product: "Product",
    model: "Model / People",
    lifestyle: "Lifestyle",
    graphic: "Graphic",
    logo: "Logo",
    before_after: "Before / After",
    other: "Other",
  };
  ```

Upload form must include a product dropdown:
```typescript
const PRODUCT_OPTIONS = [
  { value: "", label: "General (no product)" },
  { value: "happysleep", label: "HappySleep" },
  { value: "hydro13", label: "Hydro13" },
];
```

The upload POST call includes `product` in FormData:
```typescript
formData.append("product", selectedProduct || "");
```

- [ ] **Step 2: Commit**

```bash
git add src/components/assets/AssetGrid.tsx && git commit -m "feat: add AssetGrid component with video support and category pills"
```

### Task 7: Create UrlImportModal component

**Files:**
- Create: `src/components/assets/UrlImportModal.tsx`

- [ ] **Step 1: Create the URL import modal**

Create `src/components/assets/UrlImportModal.tsx`. A modal dialog with:
- URL text input + "Fetch" button
- After fetching: shows preview (image or video), file size, detected type
- Name input (auto-populated from URL filename)
- Category dropdown
- Product dropdown
- "Save to Assets" button

```typescript
interface Props {
  open: boolean;
  onClose: () => void;
  onAssetCreated: (asset: Asset) => void;
  defaultMediaType?: MediaType;
}
```

The fetch calls `POST /api/assets/import-url` with `{ url, name, category, product }`.

Two-phase UX:
1. Phase 1: User pastes URL and clicks Fetch → shows loading spinner → on success shows preview + metadata form
2. Phase 2: User fills in name/category/product and clicks "Save to Assets" → calls API → closes modal on success

Use a standard modal overlay pattern (fixed inset-0 bg-black/50 z-50) matching existing Content Hub modal styles.

- [ ] **Step 2: Commit**

```bash
git add src/components/assets/UrlImportModal.tsx && git commit -m "feat: add UrlImportModal component"
```

### Task 8: Rewrite AssetManager as hub orchestrator

**Files:**
- Modify: `src/components/assets/AssetManager.tsx`
- Modify: `src/app/assets/page.tsx`

- [ ] **Step 1: Rewrite AssetManager.tsx**

Rewrite `src/components/assets/AssetManager.tsx` as the hub orchestrator. Layout: flex container with `AssetsSidebar` on the left and main content on the right. State:
- `activeView: AssetView` — which sidebar item is selected (default: "images")
- `activeProduct: Product | "all" | "general"` — product filter (default: "all")
- `assets: Asset[]` — all assets loaded from server
- `urlImportOpen: boolean` — whether URL import modal is open

Main content area switches based on `activeView`:
- `"images"` → `<AssetGrid mediaType="image" ... />`
- `"videos"` → `<AssetGrid mediaType="video" ... />`
- `"swipe-image"` → `<ImageSwiper ... />` (placeholder div for now, implemented in Task 10)
- `"swipe-video"` → `<VideoSwiper />` (placeholder div for now, implemented in Task 9)

Counts for sidebar derived from assets:
```typescript
const counts = {
  images: assets.filter(a => a.media_type === "image").length,
  videos: assets.filter(a => a.media_type === "video").length,
};
```

Filtered assets passed to `AssetGrid` based on `activeProduct`:
```typescript
const filteredAssets = assets.filter(a => {
  if (activeProduct === "all") return true;
  if (activeProduct === "general") return a.product === null;
  return a.product === activeProduct;
});
```

When a new asset is created (via upload, URL import, or swiper), add it to the `assets` array.

Root layout: remove the `max-w-5xl mx-auto py-8 px-6` wrapper. Use a full-width flex layout:
```tsx
<div className="flex h-[calc(100vh-64px)]">
  <AssetsSidebar ... />
  <div className="flex-1 overflow-y-auto p-6">
    {/* main content */}
  </div>
</div>
```

- [ ] **Step 2: Update page.tsx to pass all assets**

Update `src/app/assets/page.tsx` — no changes needed to the data fetching, but ensure it passes all assets (not filtered by media_type):

```typescript
import { createServerSupabase } from "@/lib/supabase";
import type { Asset } from "@/types";
import AssetManager from "@/components/assets/AssetManager";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const db = createServerSupabase();
  const { data } = await db
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });

  return <AssetManager initialAssets={(data as Asset[]) ?? []} />;
}
```

- [ ] **Step 3: Verify it compiles and renders**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | head -20
```

Expected: Clean compile (or only warnings about placeholder swiper components not yet created).

- [ ] **Step 4: Commit**

```bash
git add src/components/assets/AssetManager.tsx src/app/assets/page.tsx && git commit -m "feat: rewrite AssetManager as hub orchestrator with sidebar layout"
```

---

## Chunk 4: Move Video Swiper + Create Image Swiper

### Task 9: Move Video Swiper into assets

**Files:**
- Create: `src/components/assets/VideoSwiper.tsx` (copy from `src/components/video-swiper/VideoSwiperClient.tsx`)
- Modify: `src/app/video-swiper/page.tsx` (redirect)
- Modify: `src/components/layout/Sidebar.tsx` (remove Video Swiper nav item)
- Modify: `src/components/assets/AssetManager.tsx` (wire up VideoSwiper)

- [ ] **Step 1: Copy VideoSwiperClient → VideoSwiper**

Copy `src/components/video-swiper/VideoSwiperClient.tsx` to `src/components/assets/VideoSwiper.tsx`. Changes:
- Rename the export from `VideoSwiperClient` to `VideoSwiper`
- Remove the outer `<div className="max-w-4xl mx-auto">` wrapper and the `<h1>` header (the hub provides the context)
- Add a prop `onAssetCreated?: (asset: Asset) => void` for future integration (save generated videos to assets)
- Keep all API calls pointing to `/api/video-swiper` and `/api/video-swiper/status` (no changes to those endpoints)

- [ ] **Step 2: Replace /video-swiper page with redirect**

Rewrite `src/app/video-swiper/page.tsx`:

```typescript
import { redirect } from "next/navigation";

export default function VideoSwiperPage() {
  redirect("/assets?view=swipe-video");
}
```

- [ ] **Step 3: Update Sidebar — remove Video Swiper from Ads group**

In `src/components/layout/Sidebar.tsx`, remove the Video Swiper entry from the Ads children array:
```typescript
// Remove this line:
{ href: "/video-swiper", label: "Video Swiper", icon: Scissors },
```

Also remove the `Scissors` import if no longer used.

- [ ] **Step 4: Wire up VideoSwiper in AssetManager**

In `src/components/assets/AssetManager.tsx`, import and render `VideoSwiper` when `activeView === "swipe-video"`:

```typescript
import VideoSwiper from "@/components/assets/VideoSwiper";

// In the main content switch:
{activeView === "swipe-video" && <VideoSwiper />}
```

- [ ] **Step 5: Verify compile**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add src/components/assets/VideoSwiper.tsx src/app/video-swiper/page.tsx src/components/layout/Sidebar.tsx src/components/assets/AssetManager.tsx && git commit -m "feat: move Video Swiper into Assets Hub, add redirect from old route"
```

### Task 10: Create Image Swiper

**Files:**
- Create: `src/components/assets/ImageSwiper.tsx`
- Create: `src/app/api/assets/image-swiper/route.ts`
- Modify: `src/components/assets/AssetManager.tsx` (wire up)

- [ ] **Step 1: Create the image swiper API endpoint**

Create `src/app/api/assets/image-swiper/route.ts`. This endpoint:
1. Receives: competitor image URL (or uploaded image), target product slug, optional notes
2. Fetches product data from DB (product, guidelines, segments, hero images)
3. Calls Claude Vision to analyze the competitor image's style/composition/layout
4. Claude generates a Nano Banana prompt adapted for the target product
5. Calls Nano Banana to generate the new image
6. Returns the generated image URL

Request body:
```typescript
{
  image_url: string;       // URL of competitor image (uploaded to temp or direct URL)
  product: string;         // "happysleep" | "hydro13"
  notes?: string;          // Optional guidance
  aspect_ratio?: string;   // "4:5" | "9:16" | "1:1", default "4:5"
}
```

Response (NDJSON stream):
```
{"step": "analyzing", "message": "Analyzing competitor image..."}
{"step": "analyzed", "analysis": {...}, "prompt": "..."}
{"step": "generating", "message": "Generating adapted image..."}
{"step": "completed", "image_url": "https://...", "prompt_used": "..."}
```

The Claude system prompt should instruct it to:
- Analyze the visual structure: composition, layout, color palette, typography style, mood, lighting
- NOT copy the image — instead, describe a new image for the target product that captures the same visual approach
- Output a JSON with `{ analysis: { composition, colors, mood, style }, nano_banana_prompt: "..." }`

Use the same product data fetching pattern as `src/app/api/video-swiper/route.ts` (product, guidelines, segments, hero images). Use `createImageTask` + `pollTaskResult` from `src/lib/kie.ts` for Nano Banana generation. Log usage to `usage_logs` table.

- [ ] **Step 2: Create the Image Swiper component**

Create `src/components/assets/ImageSwiper.tsx`. UI:
- Drop zone for competitor image (drag-drop, click to upload, or paste URL)
- Product selector (HappySleep / Hydro13)
- Optional notes textarea
- Aspect ratio selector (4:5, 9:16) — default 4:5
- "Analyze & Generate" button
- Progress states: uploading → analyzing → generating → done
- Done state: shows original (competitor) and generated image side-by-side
- "Save to Assets" button that creates an asset via `POST /api/assets` with the generated image

Props:
```typescript
interface Props {
  onAssetCreated?: (asset: Asset) => void;
}
```

Pattern: similar to the Video Swiper upload phase, but simpler (no frame extraction). Uses the `upload-temp` endpoint to upload the competitor image, then calls the image swiper API with the temp URL.

- [ ] **Step 3: Wire up in AssetManager**

In `src/components/assets/AssetManager.tsx`:

```typescript
import ImageSwiper from "@/components/assets/ImageSwiper";

// In the main content switch:
{activeView === "swipe-image" && (
  <ImageSwiper onAssetCreated={(asset) => setAssets(prev => [asset, ...prev])} />
)}
```

- [ ] **Step 4: Verify compile**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/assets/image-swiper/route.ts src/components/assets/ImageSwiper.tsx src/components/assets/AssetManager.tsx && git commit -m "feat: add Image Swiper tool to Assets Hub"
```

---

## Chunk 5: Polish + URL query param support

### Task 11: Support ?view= query param for deep links

**Files:**
- Modify: `src/components/assets/AssetManager.tsx`

- [ ] **Step 1: Read and sync ?view= query param**

In `AssetManager.tsx`, read `?view=` from the URL on mount and sync it to `activeView`:

```typescript
import { useSearchParams, useRouter } from "next/navigation";

// Inside the component:
const searchParams = useSearchParams();
const router = useRouter();

// Initialize activeView from URL param
const initialView = searchParams.get("view") as AssetView | null;
const [activeView, setActiveView] = useState<AssetView>(
  initialView && ["images", "videos", "swipe-image", "swipe-video"].includes(initialView)
    ? initialView
    : "images"
);

// When activeView changes, update URL (shallow)
const handleViewChange = (view: AssetView) => {
  setActiveView(view);
  const params = new URLSearchParams(searchParams.toString());
  params.set("view", view);
  router.replace(`/assets?${params.toString()}`, { scroll: false });
};
```

This enables the `/video-swiper` redirect (`redirect("/assets?view=swipe-video")`) to land on the correct view.

- [ ] **Step 2: Commit**

```bash
git add src/components/assets/AssetManager.tsx && git commit -m "feat: support ?view= query param for deep linking to asset views"
```

### Task 12: Final cleanup and verification

**Files:**
- Delete old video swiper component (optional — keep for reference or delete)

- [ ] **Step 1: Full type check**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit
```

Expected: Clean compile, no errors.

- [ ] **Step 2: Build check**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 3: Manual smoke test**

Start dev server and verify:
1. `/assets` loads with sidebar (Images selected by default)
2. Clicking "Videos" shows video assets tab (empty if no videos uploaded yet)
3. Clicking "Swipe Image" shows the image swiper tool
4. Clicking "Swipe Video" shows the video swiper tool (same functionality as old /video-swiper)
5. `/video-swiper` redirects to `/assets?view=swipe-video`
6. Upload an image file — category and product dropdowns work
7. URL import works (test with a direct image URL)
8. Product filter in sidebar filters assets correctly
9. Category filter pills filter assets correctly
10. Search box filters by name

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A && git commit -m "chore: final cleanup for Assets Hub"
```
