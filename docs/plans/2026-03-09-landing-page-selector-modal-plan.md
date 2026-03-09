# Landing Page Selector Modal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the plain `<select>` dropdown for landing page selection with a visual modal showing thumbnails categorized by angle (snoring, neck pain, neutral), with auto-tab-selection based on the concept's angle.

**Architecture:** Add `angle` and `thumbnail_url` columns to `pages` table. Create a new `LandingPageModal.tsx` component with tabbed grid layout. Screenshot pages on publish via a new API route that uses Playwright. Store screenshots in Supabase Storage bucket `page-thumbnails`.

**Tech Stack:** Next.js, React, Supabase (Postgres + Storage), Playwright (screenshot capture), Tailwind CSS, Lucide icons.

---

### Task 1: Database Migration — Add `angle` and `thumbnail_url` columns

**Files:**
- DDL via Supabase Management API

**Step 1: Run the migration**

Execute via Supabase Management API:

```sql
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS angle text DEFAULT 'neutral'
    CHECK (angle IN ('snoring', 'neck_pain', 'neutral')),
  ADD COLUMN IF NOT EXISTS thumbnail_url text;
```

Run command:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE pages ADD COLUMN IF NOT EXISTS angle text DEFAULT '\''neutral'\'' CHECK (angle IN ('\''snoring'\'', '\''neck_pain'\'', '\''neutral'\'')), ADD COLUMN IF NOT EXISTS thumbnail_url text;"}'
```

**Step 2: Backfill existing pages**

```sql
UPDATE pages SET angle = 'snoring'
WHERE angle = 'neutral' AND (
  lower(name) LIKE '%snoring%' OR lower(name) LIKE '%snore%' OR lower(name) LIKE '%snarkning%'
  OR EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE lower(t) LIKE '%snoring%' OR lower(t) LIKE '%snore%')
);

UPDATE pages SET angle = 'neck_pain'
WHERE angle = 'neutral' AND (
  lower(name) LIKE '%neck%' OR lower(name) LIKE '%pain%' OR lower(name) LIKE '%nacke%' OR lower(name) LIKE '%smärta%'
  OR EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE lower(t) LIKE '%neck%' OR lower(t) LIKE '%pain%')
);
```

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: add angle and thumbnail_url columns to pages table"
```

---

### Task 2: Update TypeScript types

**Files:**
- Modify: `src/types/index.ts:1-3` (add PageAngle type)
- Modify: `src/types/index.ts:19-35` (add fields to Page interface)

**Step 1: Add `PageAngle` type**

In `src/types/index.ts`, after line 2 (`export type PageType = ...`), add:

```typescript
export type PageAngle = "snoring" | "neck_pain" | "neutral";
```

**Step 2: Add fields to Page interface**

In the `Page` interface, add after `tags: string[];` (line 29):

```typescript
  angle: PageAngle;
  thumbnail_url: string | null;
```

**Step 3: Commit**

```bash
git add src/types/index.ts && git commit -m "feat: add PageAngle type and angle/thumbnail_url to Page interface"
```

---

### Task 3: Create Supabase Storage bucket for thumbnails

**Step 1: Create the bucket via API**

```bash
curl -s -X POST "https://fbpefeqqqfrcmfmjmeij.supabase.co/storage/v1/bucket" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"id": "page-thumbnails", "name": "page-thumbnails", "public": true}'
```

If the service role key doesn't work for bucket creation, use the Management API:

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('page-thumbnails', 'page-thumbnails', true)
ON CONFLICT (id) DO NOTHING;
```

---

### Task 4: Create screenshot API route

**Files:**
- Create: `src/app/api/pages/[id]/screenshot/route.ts`

**Step 1: Create the screenshot route**

This route takes a page ID, finds its first published translation URL, screenshots it at 375px width using Playwright, uploads to Supabase Storage, and saves the URL to `pages.thumbnail_url`.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { chromium } from "playwright";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Find a published translation with a URL
  const { data: translation } = await db
    .from("translations")
    .select("published_url")
    .eq("page_id", id)
    .eq("status", "published")
    .not("published_url", "is", null)
    .limit(1)
    .single();

  if (!translation?.published_url) {
    return NextResponse.json({ error: "No published URL found" }, { status: 404 });
  }

  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.goto(translation.published_url, { waitUntil: "networkidle", timeout: 30000 });
    const screenshot = await page.screenshot({ type: "jpeg", quality: 80 });
    await browser.close();
    browser = null;

    // Upload to Supabase Storage
    const filename = `${id}.jpg`;
    const { error: uploadError } = await db.storage
      .from("page-thumbnails")
      .upload(filename, screenshot, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = db.storage
      .from("page-thumbnails")
      .getPublicUrl(filename);

    // Save to pages table
    await db
      .from("pages")
      .update({ thumbnail_url: publicUrl })
      .eq("id", id);

    return NextResponse.json({ thumbnail_url: publicUrl });
  } catch (err) {
    if (browser) await browser.close();
    const message = err instanceof Error ? err.message : "Screenshot failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/pages/[id]/screenshot/route.ts && git commit -m "feat: add screenshot API route for page thumbnails"
```

---

### Task 5: Trigger screenshot after publish

**Files:**
- Modify: `src/app/api/publish/route.ts:169-178`

**Step 1: Add screenshot trigger after successful publish**

After the translation status is updated to "published" (line 178), add a fire-and-forget screenshot call. This should NOT block the publish response.

After `await db.from("translations").update({ status: "published", ... }).eq("id", translationId);`, add:

```typescript
    // Fire-and-forget: capture page thumbnail
    const pageId = (translation.pages as { slug: string }).id ?? translation.page_id;
    fetch(`${process.env.APP_URL || "http://localhost:3000"}/api/pages/${translation.page_id}/screenshot`, {
      method: "POST",
    }).catch(() => {});
```

Wait — we need `page_id` from the translation. Check the existing select at line 32: it already selects `pages (slug, source_url)`. We need to also select pages.id, but actually `translation.page_id` is already available as a column on translations.

Add after line 178 (after the `update` to "published"):

```typescript
    // Fire-and-forget: capture page thumbnail for the selector modal
    const appUrl = process.env.APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
    fetch(`${appUrl}/api/pages/${translation.page_id}/screenshot`, {
      method: "POST",
    }).catch(() => {});
```

**Step 2: Commit**

```bash
git add src/app/api/publish/route.ts && git commit -m "feat: trigger page screenshot after publish"
```

---

### Task 6: Update landing pages API to return `angle` and `thumbnail_url`

**Files:**
- Modify: `src/app/api/meta/assets/landing-pages/route.ts:19`

**Step 1: Add angle and thumbnail_url to the select**

Change line 19 from:
```typescript
    .select("id, language, slug, published_url, seo_title, pages!inner(id, name, slug, product, tags, page_type)")
```
to:
```typescript
    .select("id, language, slug, published_url, seo_title, pages!inner(id, name, slug, product, tags, page_type, angle, thumbnail_url)")
```

**Step 2: Commit**

```bash
git add src/app/api/meta/assets/landing-pages/route.ts && git commit -m "feat: return angle and thumbnail_url from landing pages API"
```

---

### Task 7: Update landing page type in ImageJobDetail and ConceptAdCopyStep

**Files:**
- Modify: `src/components/images/ImageJobDetail.tsx:112`
- Modify: `src/components/images/ImageJobDetail.tsx:257`
- Modify: `src/components/images/ConceptAdCopyStep.tsx:65`

**Step 1: Update the landing page array type**

In `ImageJobDetail.tsx` line 112, change from:
```typescript
const [landingPages, setLandingPages] = useState<Array<{ id: string; name: string; slug: string; product: string; tags?: string[]; page_type?: string }>>([]);
```
to:
```typescript
const [landingPages, setLandingPages] = useState<Array<{ id: string; name: string; slug: string; product: string; tags?: string[]; page_type?: string; angle?: string; thumbnail_url?: string | null }>>([]);
```

Similarly update line 257 (the `pages` array type in the fetch handler) and `ConceptAdCopyStep.tsx` line 65 (the `landingPages` prop type) to include `angle?: string; thumbnail_url?: string | null`.

**Step 2: Commit**

```bash
git add src/components/images/ImageJobDetail.tsx src/components/images/ConceptAdCopyStep.tsx && git commit -m "feat: update landing page types to include angle and thumbnail_url"
```

---

### Task 8: Create LandingPageModal component

**Files:**
- Create: `src/components/images/LandingPageModal.tsx`

**Step 1: Build the modal component**

```typescript
"use client";

import { useState, useMemo } from "react";
import { X, FileText, Image as ImageIcon } from "lucide-react";
import type { PageAngle } from "@/types";

interface LandingPageItem {
  id: string;
  name: string;
  slug: string;
  product: string;
  tags?: string[];
  page_type?: string;
  angle?: string;
  thumbnail_url?: string | null;
}

interface ABTestItem {
  id: string;
  name: string;
  slug: string;
  language: string;
  router_url: string;
}

interface LandingPageModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void; // page ID or "abtest:ID"
  landingPages: LandingPageItem[];
  abTests: ABTestItem[];
  selectedValue: string; // current landing_page_id or "abtest:ID"
  conceptTags?: string[];
  conceptAngle?: string; // from cash_dna.angle
}

const ANGLE_TABS: { key: PageAngle | "ab_tests"; label: string }[] = [
  { key: "snoring", label: "Snoring" },
  { key: "neck_pain", label: "Neck Pain" },
  { key: "neutral", label: "Neutral" },
  { key: "ab_tests", label: "A/B Tests" },
];

function detectConceptAngle(tags?: string[], angle?: string): PageAngle {
  if (angle === "snoring" || angle === "neck_pain") return angle;
  const joined = (tags ?? []).join(" ").toLowerCase();
  if (joined.includes("snoring") || joined.includes("snore")) return "snoring";
  if (joined.includes("neck") || joined.includes("pain")) return "neck_pain";
  return "neutral";
}

export default function LandingPageModal({
  open,
  onClose,
  onSelect,
  landingPages,
  abTests,
  selectedValue,
  conceptTags,
  conceptAngle,
}: LandingPageModalProps) {
  const autoAngle = useMemo(
    () => detectConceptAngle(conceptTags, conceptAngle),
    [conceptTags, conceptAngle]
  );

  const [activeTab, setActiveTab] = useState<PageAngle | "ab_tests">(autoAngle);

  const grouped = useMemo(() => {
    const groups: Record<PageAngle, LandingPageItem[]> = {
      snoring: [],
      neck_pain: [],
      neutral: [],
    };
    for (const page of landingPages) {
      const angle = (page.angle as PageAngle) || "neutral";
      groups[angle].push(page);
    }
    return groups;
  }, [landingPages]);

  if (!open) return null;

  const handleSelect = (value: string) => {
    onSelect(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Select Landing Page</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-2 border-b border-gray-100">
          {ANGLE_TABS.map((tab) => {
            const count = tab.key === "ab_tests" ? abTests.length : grouped[tab.key]?.length ?? 0;
            if (count === 0 && tab.key === "ab_tests") return null;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-xs opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "ab_tests" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {abTests.map((test) => (
                <button
                  key={test.id}
                  onClick={() => handleSelect(`abtest:${test.id}`)}
                  className={`text-left p-3 rounded-lg border-2 transition-colors ${
                    selectedValue === `abtest:${test.id}`
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900 truncate">{test.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{test.language.toUpperCase()}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(grouped[activeTab] ?? []).map((page) => (
                <button
                  key={page.id}
                  onClick={() => handleSelect(page.id)}
                  className={`text-left rounded-lg border-2 overflow-hidden transition-colors ${
                    selectedValue === page.id
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-[3/4] bg-gray-100 relative">
                    {page.thumbnail_url ? (
                      <img
                        src={page.thumbnail_url}
                        alt={page.name}
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                    {page.page_type === "advertorial" && (
                      <span className="absolute top-1.5 right-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                        Advertorial
                      </span>
                    )}
                  </div>
                  {/* Name */}
                  <div className="p-2">
                    <div className="text-xs font-medium text-gray-900 truncate">{page.name}</div>
                    <div className="text-[10px] text-gray-400 truncate">/{page.slug}</div>
                  </div>
                </button>
              ))}
              {(grouped[activeTab] ?? []).length === 0 && (
                <p className="col-span-full text-sm text-gray-400 text-center py-8">
                  No pages in this category
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/images/LandingPageModal.tsx && git commit -m "feat: create LandingPageModal component with thumbnail grid and angle tabs"
```

---

### Task 9: Replace `<select>` with modal trigger in ConceptAdCopyStep

**Files:**
- Modify: `src/components/images/ConceptAdCopyStep.tsx:243-322`

**Step 1: Add modal import and state**

At the top of the file (after existing imports), add:
```typescript
import LandingPageModal from "./LandingPageModal";
```

**Step 2: Replace the `<select>` block**

Replace the entire `{/* Website URL */}` section (lines 243-322) with a trigger button + modal. The button shows the currently selected page name + thumbnail. Clicking opens the modal.

```tsx
      {/* Website URL */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
          <Globe className="w-4 h-4" />
          Website URL
        </label>
        {landingPages.length > 0 || abTests.length > 0 ? (
          <>
            {(() => {
              const isNative = (job.cash_dna as { awareness_level?: string } | null)?.awareness_level === "Unaware" ||
                (job.tags ?? []).some((t) => t === "unaware" || t === "native");
              const hasAdvertorials = landingPages.some((p) => p.page_type === "advertorial");
              return isNative ? (
                <p className="text-xs text-amber-600 mb-1.5">
                  {hasAdvertorials
                    ? "Advertorial pages are recommended for native/unaware ads — they convert 3-4x better than direct product pages."
                    : "Tip: Native ads convert best with advertorial landing pages. Consider creating one for this product."}
                </p>
              ) : null;
            })()}
            <LandingPageModalTrigger
              landingPages={landingPages}
              abTests={abTests}
              selectedValue={metaPush.abTestId ? `abtest:${metaPush.abTestId}` : metaPush.landingPageId}
              onSelect={(value) => handleWebsiteUrlChange(value)}
              conceptTags={job.tags ?? undefined}
              conceptAngle={(job.cash_dna as { angle?: string } | null)?.angle}
            />
            {metaPush.abTestId && (() => {
              const selectedTest = abTests.find((t) => t.id === metaPush.abTestId);
              return selectedTest ? (
                <p className="text-xs text-gray-500 mt-1">
                  AB test URL for {selectedTest.language.toUpperCase()}, regular page for other languages
                </p>
              ) : null;
            })()}
          </>
        ) : (
          <p className="text-sm text-gray-400">
            No published pages or active A/B tests found
          </p>
        )}
      </div>
```

Where `LandingPageModalTrigger` is a small inline wrapper that manages open/close state:

```tsx
function LandingPageModalTrigger({
  landingPages,
  abTests,
  selectedValue,
  onSelect,
  conceptTags,
  conceptAngle,
}: {
  landingPages: Array<{ id: string; name: string; slug: string; product: string; tags?: string[]; page_type?: string; angle?: string; thumbnail_url?: string | null }>;
  abTests: Array<{ id: string; name: string; slug: string; language: string; router_url: string }>;
  selectedValue: string;
  onSelect: (value: string) => void;
  conceptTags?: string[];
  conceptAngle?: string;
}) {
  const [open, setOpen] = useState(false);

  const selectedPage = landingPages.find((p) => p.id === selectedValue);
  const selectedTest = abTests.find((t) => `abtest:${t.id}` === selectedValue);
  const label = selectedPage?.name ?? selectedTest?.name ?? "Select a destination...";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm text-left hover:border-indigo-400 focus:outline-none focus:border-indigo-500 transition-colors"
      >
        {selectedPage?.thumbnail_url ? (
          <img src={selectedPage.thumbnail_url} alt="" className="w-8 h-10 object-cover object-top rounded" />
        ) : (
          <div className="w-8 h-10 bg-gray-100 rounded flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-gray-300" />
          </div>
        )}
        <span className={selectedValue ? "text-gray-900" : "text-gray-400"}>{label}</span>
      </button>
      <LandingPageModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onSelect}
        landingPages={landingPages}
        abTests={abTests}
        selectedValue={selectedValue}
        conceptTags={conceptTags}
        conceptAngle={conceptAngle}
      />
    </>
  );
}
```

Note: `useState` and `FileText` are already imported in this file. `LandingPageModal` needs to be imported at the top.

**Step 3: Commit**

```bash
git add src/components/images/ConceptAdCopyStep.tsx && git commit -m "feat: replace landing page dropdown with visual modal trigger"
```

---

### Task 10: Add angle selector to page detail

**Files:**
- Modify: `src/app/pages/[id]/page.tsx:93-109` (in the header area, after tags)
- Create: `src/components/pages/AngleSelector.tsx`

**Step 1: Create AngleSelector client component**

```typescript
"use client";

import { useState } from "react";
import type { PageAngle } from "@/types";

const ANGLES: { value: PageAngle; label: string }[] = [
  { value: "snoring", label: "Snoring" },
  { value: "neck_pain", label: "Neck Pain" },
  { value: "neutral", label: "Neutral" },
];

export default function AngleSelector({
  pageId,
  initialAngle,
}: {
  pageId: string;
  initialAngle: PageAngle;
}) {
  const [angle, setAngle] = useState(initialAngle);
  const [saving, setSaving] = useState(false);

  const handleChange = async (newAngle: PageAngle) => {
    setAngle(newAngle);
    setSaving(true);
    try {
      await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle: newAngle }),
      });
    } catch {
      setAngle(angle); // revert on error
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {ANGLES.map((a) => (
        <button
          key={a.value}
          onClick={() => handleChange(a.value)}
          disabled={saving}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            angle === a.value
              ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
              : "border-gray-200 text-gray-500 hover:border-gray-300"
          } ${saving ? "opacity-50" : ""}`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Add to page detail**

In `src/app/pages/[id]/page.tsx`, after the `<EditableTags>` section (around line 109), add:

```tsx
<div className="mt-2">
  <AngleSelector pageId={p.id} initialAngle={p.angle ?? "neutral"} />
</div>
```

Import at the top:
```typescript
import AngleSelector from "@/components/pages/AngleSelector";
```

**Step 3: Ensure PATCH endpoint handles `angle`**

Check that `PATCH /api/pages/[id]` passes through the `angle` field. If it uses a generic update pattern, it should work. If not, add `angle` to the allowed fields.

**Step 4: Commit**

```bash
git add src/components/pages/AngleSelector.tsx src/app/pages/[id]/page.tsx && git commit -m "feat: add angle selector to page detail screen"
```

---

### Task 11: Verify PATCH endpoint supports `angle` field

**Files:**
- Possibly modify: `src/app/api/pages/[id]/route.ts`

**Step 1: Read the PATCH handler and verify**

Check if the PATCH handler for `/api/pages/[id]` accepts arbitrary fields or has an allowlist. If it has an allowlist, add `angle` to it.

**Step 2: Commit if changes needed**

```bash
git add src/app/api/pages/[id]/route.ts && git commit -m "feat: allow angle field in page PATCH endpoint"
```

---

### Task 12: Test the full flow

**Step 1: Start dev server**

```bash
cd /Users/williamhedin/Claude\ Code/content-hub && npm run dev
```

**Step 2: Navigate to a concept detail page and verify:**
- The landing page field shows a trigger button instead of a dropdown
- Clicking opens the modal with tabs
- Tabs show correct counts
- Auto-selects correct tab based on concept tags
- Selecting a page closes the modal and updates the value
- Pages with thumbnails show them; pages without show placeholder

**Step 3: Navigate to a page detail and verify:**
- Angle selector shows below tags
- Clicking changes the angle
- Refresh confirms it persisted

**Step 4: Publish a page and verify:**
- After publish, a screenshot is generated in the background
- The `thumbnail_url` on the page record is populated
- The modal shows the thumbnail for that page

---

### Task 13: Final commit and cleanup

**Step 1: Run build to verify no type errors**

```bash
npm run build
```

**Step 2: Fix any type/build errors**

**Step 3: Final commit**

```bash
git add -A && git commit -m "feat: landing page selector modal with thumbnails and angle categorization"
```
