# Page Builder Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the page editor as a full-screen Replo-inspired builder with tabbed left sidebar (Layers/Components/Settings), right properties panel (Design/Config/AI tabs with full styling controls), and a status bar.

**Architecture:** Full-screen CSS overlay approach — the edit layout renders a `position: fixed; inset: 0; z-index: 50` container that covers the main app sidebar. State extracted from the 1,481-line `EditPageClient.tsx` monolith into a `BuilderContext` React context. New components under `src/components/builder/`. Existing iframe preview API unchanged.

**Tech Stack:** Next.js 14 App Router, React Context, Tailwind CSS, Lucide icons, existing Supabase + Cloudflare Pages APIs.

**Key files to understand before starting:**
- `src/app/layout.tsx` — root layout that renders `<Sidebar>` for authenticated users
- `src/app/pages/[id]/edit/[language]/page.tsx` — server component that fetches page/translation data
- `src/app/pages/[id]/edit/[language]/EditPageClient.tsx` — current 1,481-line monolith (ALL editor logic)
- `src/components/pages/editor/ElementControls.tsx` — current element styling (800 lines)
- `src/components/pages/editor/LayersPanel.tsx` — current layers tree (282 lines)
- `src/components/pages/editor/PaddingControls.tsx` — current padding controls (100 lines)
- `src/components/pages/editor/PageSettingsModal.tsx` — SEO/slug/URL settings (191 lines)
- `src/components/pages/ImagePanel.tsx` — image editing sidebar (692 lines)
- `src/components/pages/VideoPanel.tsx` — video editing sidebar (232 lines)
- `src/components/pages/PublishModal.tsx` — CF Pages deploy modal (241 lines)
- `src/app/api/preview/[id]/route.ts` — iframe preview with injected editor script (175 lines)
- `src/types/index.ts` — all type definitions

---

## Task 1: Create Full-Screen Builder Layout

**Files:**
- Create: `src/app/pages/[id]/edit/layout.tsx`

This Next.js layout wraps all edit routes (`[language]/page.tsx` and `source/page.tsx`) in a fixed overlay that covers the entire viewport, hiding the main app sidebar underneath.

**Step 1: Create the layout file**

```tsx
// src/app/pages/[id]/edit/layout.tsx
export default function BuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {children}
    </div>
  );
}
```

**Step 2: Verify it works**

Run `npm run dev`, navigate to any existing page edit URL (e.g. `/pages/{id}/edit/sv`). Confirm the editor now fills the entire viewport with no main sidebar visible.

**Step 3: Commit**

```bash
git add src/app/pages/[id]/edit/layout.tsx
git commit -m "feat(builder): add full-screen layout overlay for page editor"
```

---

## Task 2: Create BuilderContext — Types and Provider Shell

**Files:**
- Create: `src/components/builder/BuilderContext.tsx`

Extract all state from `EditPageClient.tsx` into a React Context. This task creates the types, context, and provider shell. We'll wire up the actual logic in later tasks.

**Step 1: Create the context file**

```tsx
// src/components/builder/BuilderContext.tsx
"use client";

import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import type { Translation, PageQualityAnalysis, MarketProductUrl } from "@/types";
import { LANGUAGES, COUNTRY_MAP } from "@/types";

// --- Types ---

export type ViewMode = "desktop" | "mobile";
export type LeftTab = "layers" | "components" | "settings";
export type RightTab = "design" | "config" | "ai";
export type AutoSaveStatus = "idle" | "saving" | "saved";
export type BlockType = "text" | "image" | "video" | "cta" | "divider" | "container";

export interface ClickedMedia {
  src: string;
  index: number;
  width: number;
  height: number;
}

export interface BuilderProps {
  pageId: string;
  pageName: string;
  pageSlug: string;
  pageProduct?: string;
  originalHtml: string;
  translation: Translation;
  language: (typeof LANGUAGES)[number];
  variantLabel?: string;
  isSource?: boolean;
}

export interface BuilderContextValue {
  // Props (read-only)
  pageId: string;
  pageName: string;
  pageSlug: string;
  pageProduct?: string;
  language: (typeof LANGUAGES)[number];
  translation: Translation;
  isSource: boolean;
  variantLabel?: string;

  // Iframe
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  iframeKey: number;
  reloadIframe: () => void;

  // Dirty / Save
  isDirty: boolean;
  saving: boolean;
  publishing: boolean;
  retranslating: boolean;
  saveError: string;
  autoSaveStatus: AutoSaveStatus;
  markDirty: () => void;
  handleSave: () => Promise<void>;
  handlePublish: () => void;

  // View
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  zoom: number;
  setZoom: (z: number) => void;

  // Sidebar state
  leftTab: LeftTab;
  setLeftTab: (tab: LeftTab) => void;
  leftSidebarOpen: boolean;
  setLeftSidebarOpen: (open: boolean) => void;
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;

  // Selection
  selectedElRef: React.MutableRefObject<HTMLElement | null>;
  hasSelectedEl: boolean;
  setHasSelectedEl: (has: boolean) => void;
  selectElementInIframe: (el: HTMLElement) => void;
  deselectElement: () => void;

  // Element actions
  handleHideElement: () => void;
  handleDeleteElement: () => void;
  handleDuplicateElement: () => void;
  hideElement: () => void;
  deleteElement: () => void;
  duplicateElement: () => void;

  // History
  undoCount: number;
  redoCount: number;
  handleUndo: () => void;
  handleRedo: () => void;
  pushUndoSnapshot: () => void;

  // Padding
  padDH: string;
  padDV: string;
  padMH: string;
  padMV: string;
  handlePaddingChange: (axis: "h" | "v", value: string) => void;
  excludeMode: boolean;
  setExcludeMode: (mode: boolean) => void;
  excludeCount: number;

  // Quality
  qualityScore: number | null;
  qualityAnalysis: PageQualityAnalysis | null;
  analyzing: boolean;
  showQualityDetails: boolean;
  setShowQualityDetails: (show: boolean) => void;
  runQualityAnalysis: (previousContext?: string) => Promise<void>;
  handleFixQuality: () => Promise<void>;
  fixingQuality: boolean;

  // Media clicks
  clickedImage: ClickedMedia | null;
  setClickedImage: (img: ClickedMedia | null) => void;
  clickedVideo: ClickedMedia | null;
  setClickedVideo: (vid: ClickedMedia | null) => void;
  bgImageTranslating: boolean;
  setBgImageTranslating: (t: boolean) => void;

  // Link URL
  linkUrl: string;
  handleLinkUrlChange: (url: string) => void;

  // SEO / Settings
  seoTitle: string;
  setSeoTitle: (t: string) => void;
  seoDesc: string;
  setSeoDesc: (d: string) => void;
  slug: string;
  setSlug: (s: string) => void;
  marketUrls: MarketProductUrl[];
  urlMode: "saved" | "custom";
  setUrlMode: (m: "saved" | "custom") => void;
  filteredUrls: MarketProductUrl[];

  // Layers
  layersRefreshKey: number;
  hiddenCount: number;
  revealHidden: boolean;
  toggleRevealHidden: () => void;
  handleToggleLayerVisibility: (el: HTMLElement) => void;

  // Modals
  showPublishModal: boolean;
  setShowPublishModal: (show: boolean) => void;
  showSettingsModal: boolean;
  setShowSettingsModal: (show: boolean) => void;

  // Confirm dialog
  confirmAction: { title: string; message: string; variant: "danger" | "warning" | "default"; action: () => void } | null;
  setConfirmAction: (a: { title: string; message: string; variant: "danger" | "warning" | "default"; action: () => void } | null) => void;

  // Re-translate
  requestRetranslate: () => void;

  // Iframe interaction
  handleIframeLoad: () => void;
  extractHtmlFromIframe: () => string;
}

const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder must be used within BuilderProvider");
  return ctx;
}

// Provider implementation — see Task 3
export function BuilderProvider({ children, ...props }: BuilderProps & { children: ReactNode }) {
  // This will be filled in Task 3
  throw new Error("BuilderProvider not yet implemented");
}
```

**Step 2: Commit**

```bash
git add src/components/builder/BuilderContext.tsx
git commit -m "feat(builder): create BuilderContext types and shell"
```

---

## Task 3: Implement BuilderProvider — Port All State Logic

**Files:**
- Modify: `src/components/builder/BuilderContext.tsx`

Port ALL state and logic from `EditPageClient.tsx` (lines 56-737) into the `BuilderProvider`. This is the largest single task. Every `useState`, `useRef`, `useCallback`, `useEffect`, and handler function in the current monolith gets moved here.

**Step 1: Implement the full provider**

Replace the placeholder `BuilderProvider` function in `BuilderContext.tsx` with the full implementation. Port the following from `EditPageClient.tsx`:

**State to port (lines 56-131):**
- All 30+ `useState` calls (seoTitle, seoDesc, saving, isDirty, viewMode, padDH/DV/MH/MV, excludeMode, clickedImage, clickedVideo, hasSelectedEl, hiddenCount, revealHidden, undoCount, redoCount, qualityScore, qualityAnalysis, analyzing, showQualityDetails, marketUrls, urlMode, confirmAction, autoSaveStatus, showPublishModal, showSettingsModal, fixingQuality, linkUrl, slug, iframeKey, layersRefreshKey, bgImageTranslating)
- All refs (iframeRef, selectedElRef, undoStackRef, redoStackRef, skipSnapshotRef, baselineHtmlRef, autoSaveTimerRef, autoSavedTimeoutRef, autosaveDataRef, savingRef, prevLinkUrl, excludeModeRef, savedTimeoutRef)
- Add new state: `zoom` (default 100), `leftTab` (default "layers"), `leftSidebarOpen` (default true), `rightTab` (default "design"), `rightPanelOpen` (default true)

**Callbacks to port (lines 136-667):**
- `triggerAutosave` (lines 136-175)
- `pushUndoSnapshot` (lines 177-195)
- `markDirty` (lines 197-202)
- `handleHideElement` (lines 335-346)
- `handleToggleLayerVisibility` (lines 348-363)
- `handleUndo` (lines 365-381)
- `handleRedo` (lines 384-401)
- `handleDuplicateElement` (lines 403-410)
- `handleDeleteElement` (lines 412-427)
- `toggleRevealHidden` (lines 429-444)
- `buildPaddingCss` (lines 446-465) — make this a module-level utility
- `handleIframeLoad` (lines 467-618)
- `syncPaddingToIframe` (lines 620-639)
- `handlePaddingChange` (lines 641-652)
- `handleLinkUrlChange` (lines 654-667)
- `extractHtmlFromIframe` (lines 669-728)

**Async functions to port (from later in EditPageClient.tsx):**
- `handleSave` — saves HTML + SEO to API
- `handlePublish` — opens publish modal
- `requestRetranslate` — confirmation then re-translate
- `runQualityAnalysis` — POST to `/api/translate/analyze`
- `handleFixQuality` — POST to `/api/translate/fix`
- `doRetranslate` — POST to `/api/translate`

**Effects to port (lines 204-331):**
- Autosave cleanup (lines 204-209)
- Market URL fetch (lines 211-216)
- URL mode auto-detect (lines 222-227)
- Message handler for iframe postMessage (lines 229-255)
- Before unload warning (lines 257-265)
- Keyboard shortcuts: Ctrl+S, Ctrl+Z, Ctrl+Shift+Z (lines 273-298)
- Exclude mode styling injection (lines 300-331)
- Exclude mode ref sync (line 333)

**Add convenience methods:**
- `selectElementInIframe(el)` — sets `data-cc-selected`, updates ref and state
- `deselectElement()` — clears selection
- `reloadIframe()` — increments `iframeKey`

**Context value:** Construct the value object with all state and methods, wrap in `useMemo` keyed on all state variables.

**Step 2: Verify it compiles**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | head -20
```

Fix any type errors.

**Step 3: Commit**

```bash
git add src/components/builder/BuilderContext.tsx
git commit -m "feat(builder): implement BuilderProvider with all state logic"
```

---

## Task 4: Create BuilderShell — Main Layout Grid

**Files:**
- Create: `src/components/builder/BuilderShell.tsx`

The shell component renders the four-zone layout: top bar, left sidebar, canvas, right panel, and status bar.

**Step 1: Create BuilderShell**

```tsx
// src/components/builder/BuilderShell.tsx
"use client";

import { BuilderProvider, type BuilderProps } from "./BuilderContext";
import BuilderTopBar from "./BuilderTopBar";
import BuilderCanvas from "./BuilderCanvas";
import BuilderStatusBar from "./BuilderStatusBar";
import LeftSidebar from "./left-sidebar/LeftSidebar";
import RightPanel from "./right-panel/RightPanel";

export default function BuilderShell(props: BuilderProps) {
  return (
    <BuilderProvider {...props}>
      <div className="flex flex-col h-full">
        <BuilderTopBar />
        <div className="flex flex-1 min-h-0">
          <LeftSidebar />
          <BuilderCanvas />
          <RightPanel />
        </div>
        <BuilderStatusBar />
      </div>
    </BuilderProvider>
  );
}
```

Create placeholder stubs for all child components (each just returns a `<div>` with identifying text) so the shell compiles:

- `src/components/builder/BuilderTopBar.tsx`
- `src/components/builder/BuilderCanvas.tsx`
- `src/components/builder/BuilderStatusBar.tsx`
- `src/components/builder/left-sidebar/LeftSidebar.tsx`
- `src/components/builder/right-panel/RightPanel.tsx`

Each stub:
```tsx
"use client";
export default function ComponentName() {
  return <div className="p-2 text-xs text-gray-400">[ComponentName placeholder]</div>;
}
```

**Step 2: Commit**

```bash
git add src/components/builder/
git commit -m "feat(builder): create BuilderShell layout grid with placeholder stubs"
```

---

## Task 5: Wire Up BuilderShell in EditPageClient

**Files:**
- Modify: `src/app/pages/[id]/edit/[language]/EditPageClient.tsx`

Replace the entire current render with the new `BuilderShell`. The current 1,481-line file becomes a thin wrapper.

**Step 1: Rewrite EditPageClient to use BuilderShell**

```tsx
"use client";

import BuilderShell from "@/components/builder/BuilderShell";
import { Translation, LANGUAGES } from "@/types";

interface Props {
  pageId: string;
  pageName: string;
  pageSlug: string;
  pageProduct?: string;
  originalHtml: string;
  translation: Translation;
  language: (typeof LANGUAGES)[number];
  variantLabel?: string;
  isSource?: boolean;
}

export default function EditPageClient(props: Props) {
  return <BuilderShell {...props} />;
}
```

**Step 2: Verify the page loads**

Run `npm run dev`, navigate to an edit page. You should see the placeholder stubs rendered in the full-screen overlay layout. The old editor is now gone — that's expected; we'll rebuild it in the following tasks.

**Step 3: Keep the old file as reference**

Before overwriting, copy the old EditPageClient to a temp reference file:

```bash
cp src/app/pages/[id]/edit/[language]/EditPageClient.tsx src/components/builder/_OLD_EditPageClient.tsx.bak
```

**Step 4: Commit**

```bash
git add src/app/pages/[id]/edit/[language]/EditPageClient.tsx src/components/builder/_OLD_EditPageClient.tsx.bak
git commit -m "feat(builder): wire BuilderShell into EditPageClient, keep old file as reference"
```

---

## Task 6: Implement BuilderTopBar

**Files:**
- Modify: `src/components/builder/BuilderTopBar.tsx`

**Step 1: Build the top bar**

Port the header from old `EditPageClient.tsx` lines 1050-1230. The top bar should be a slim 48px bar with:

- **Left section**: ← Back button (link to `/pages/{pageId}`), editable page name, language badge, variant label
- **Center section**: Undo/Redo buttons (disabled states based on `undoCount`/`redoCount`)
- **Right section**: Device switcher (Desktop/Mobile icons), Quality badge (click to show details), Save button (with saving spinner), Save & Publish button

Use `useBuilder()` to access all state and actions. Use Lucide icons (`ArrowLeft`, `Undo2`, `Redo2`, `Monitor`, `Smartphone`, `Save`, `Upload`, `Loader2`, `CheckCircle2`).

**Key behaviors:**
- Back button uses `router.push()` with dirty-check confirmation
- Quality badge: green pill if score ≥ 85, yellow if ≥ 60, red otherwise; click toggles `showQualityDetails`
- Save shows "Saving..." spinner during save
- Keyboard shortcuts already handled in BuilderContext

**Step 2: Verify visually**

Run dev server, confirm top bar renders with all buttons. Click undo/redo (disabled is fine, no iframe yet). Click device switcher to toggle `viewMode`.

**Step 3: Commit**

```bash
git add src/components/builder/BuilderTopBar.tsx
git commit -m "feat(builder): implement BuilderTopBar with nav, undo/redo, device switch, save"
```

---

## Task 7: Implement BuilderCanvas

**Files:**
- Modify: `src/components/builder/BuilderCanvas.tsx`

**Step 1: Build the canvas**

Port the iframe section from old `EditPageClient.tsx` lines 1232-1315. The canvas is the center area that renders the page preview iframe.

```tsx
"use client";

import { useBuilder } from "./BuilderContext";

export default function BuilderCanvas() {
  const {
    iframeRef, iframeKey, viewMode, translation, isSource, pageId,
    handleIframeLoad, zoom,
  } = useBuilder();

  const previewId = isSource ? `source_${pageId}` : translation.id;
  const previewUrl = `/api/preview/${previewId}?v=${iframeKey}`;

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-gray-100 overflow-hidden">
      <div
        className={`flex-1 overflow-auto ${
          viewMode === "mobile" ? "flex justify-center items-start p-8" : ""
        }`}
        style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
      >
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={previewUrl}
          className={
            viewMode === "mobile"
              ? "w-[375px] h-[812px] border border-gray-300 rounded-lg shadow-lg bg-white shrink-0"
              : "w-full h-full border-0"
          }
          sandbox="allow-scripts allow-same-origin"
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
}
```

**Step 2: Verify the iframe loads**

Navigate to an edit page. The iframe should render the page preview in the center area, responding to desktop/mobile toggle from the top bar.

**Step 3: Commit**

```bash
git add src/components/builder/BuilderCanvas.tsx
git commit -m "feat(builder): implement BuilderCanvas with responsive iframe preview"
```

---

## Task 8: Implement BuilderStatusBar

**Files:**
- Modify: `src/components/builder/BuilderStatusBar.tsx`

**Step 1: Build the status bar**

Slim 32px bar at the bottom showing quality, autosave status, zoom, and view mode.

```tsx
"use client";

import { useBuilder } from "./BuilderContext";
import { ZoomIn, ZoomOut } from "lucide-react";

export default function BuilderStatusBar() {
  const { qualityScore, autoSaveStatus, zoom, setZoom, viewMode, isDirty } = useBuilder();

  const qualityColor = qualityScore === null ? "bg-gray-200" :
    qualityScore >= 85 ? "bg-green-100 text-green-800" :
    qualityScore >= 60 ? "bg-yellow-100 text-yellow-800" :
    "bg-red-100 text-red-800";

  return (
    <div className="h-8 px-4 border-t border-gray-200 bg-white flex items-center gap-4 text-xs text-gray-500 shrink-0">
      {/* Quality */}
      {qualityScore !== null && (
        <span className={`px-2 py-0.5 rounded-full font-medium ${qualityColor}`}>
          Quality: {qualityScore}
        </span>
      )}

      {/* Autosave */}
      <span>
        {autoSaveStatus === "saving" && "Saving..."}
        {autoSaveStatus === "saved" && "Saved"}
        {autoSaveStatus === "idle" && isDirty && "Unsaved changes"}
        {autoSaveStatus === "idle" && !isDirty && ""}
      </span>

      <div className="flex-1" />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="p-0.5 hover:bg-gray-100 rounded">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="w-10 text-center">{zoom}%</span>
        <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="p-0.5 hover:bg-gray-100 rounded">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* View mode */}
      <span className="capitalize">{viewMode}</span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/builder/BuilderStatusBar.tsx
git commit -m "feat(builder): implement BuilderStatusBar with quality, autosave, zoom"
```

---

## Task 9: Implement LeftSidebar Container

**Files:**
- Modify: `src/components/builder/left-sidebar/LeftSidebar.tsx`

**Step 1: Build the tabbed sidebar container**

280px wide sidebar with 3 icon tabs at the top. Only one tab content visible at a time. Collapsible via a toggle button.

```tsx
"use client";

import { useBuilder } from "../BuilderContext";
import { Layers, Plus, Settings } from "lucide-react";
import LayersTab from "./LayersTab";
import ComponentsTab from "./ComponentsTab";
import SettingsTab from "./SettingsTab";

const TABS = [
  { id: "layers" as const, icon: Layers, label: "Layers" },
  { id: "components" as const, icon: Plus, label: "Components" },
  { id: "settings" as const, icon: Settings, label: "Settings" },
];

export default function LeftSidebar() {
  const { leftTab, setLeftTab, leftSidebarOpen, setLeftSidebarOpen } = useBuilder();

  if (!leftSidebarOpen) {
    return (
      <div className="w-10 border-r border-gray-200 bg-white shrink-0 flex flex-col items-center pt-2 gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setLeftTab(tab.id); setLeftSidebarOpen(true); }}
            className="p-2 rounded hover:bg-gray-100 text-gray-500"
            title={tab.label}
          >
            <tab.icon className="w-4 h-4" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="w-[280px] border-r border-gray-200 bg-white shrink-0 flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setLeftTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              leftTab === tab.id
                ? "text-indigo-600 border-b-2 border-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {leftTab === "layers" && <LayersTab />}
        {leftTab === "components" && <ComponentsTab />}
        {leftTab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
```

Create stubs for `LayersTab.tsx`, `ComponentsTab.tsx`, `SettingsTab.tsx`:

```tsx
"use client";
export default function LayersTab() {
  return <div className="p-3 text-xs text-gray-400">[Layers placeholder]</div>;
}
```

**Step 2: Commit**

```bash
git add src/components/builder/left-sidebar/
git commit -m "feat(builder): implement LeftSidebar with tabbed container"
```

---

## Task 10: Implement LayersTab

**Files:**
- Modify: `src/components/builder/left-sidebar/LayersTab.tsx`

**Step 1: Port the existing LayersPanel**

Adapt `src/components/pages/editor/LayersPanel.tsx` (282 lines) to use `useBuilder()` context instead of props. The LayersPanel currently receives: `iframeRef`, `selectedElRef`, `setHasSelectedEl`, `refreshKey`, `onToggleVisibility`.

Replace these with context equivalents:
- `iframeRef` → `useBuilder().iframeRef`
- `selectedElRef` → `useBuilder().selectedElRef`
- `setHasSelectedEl` → `useBuilder().setHasSelectedEl`
- `refreshKey` → `useBuilder().layersRefreshKey`
- `onToggleVisibility` → `useBuilder().handleToggleLayerVisibility`

Keep the exact same DOM tree building logic (semantic tags, max depth 5, collapse behavior, text preview, eye icon). The only change is the data source.

Add the hidden elements indicator at the top (port from old `EditPageClient.tsx` lines ~1380-1400):
- If `hiddenCount > 0`, show a yellow badge: `"{hiddenCount} hidden"` with a Reveal/Hide toggle button

**Step 2: Verify layers render**

Open the editor, confirm the layers tree builds from the iframe and clicking a layer selects the element.

**Step 3: Commit**

```bash
git add src/components/builder/left-sidebar/LayersTab.tsx
git commit -m "feat(builder): implement LayersTab with DOM tree and visibility toggle"
```

---

## Task 11: Implement ComponentsTab

**Files:**
- Modify: `src/components/builder/left-sidebar/ComponentsTab.tsx`

**Step 1: Build the insert blocks grid**

Port the block insertion buttons from `ElementControls.tsx` (the insert section). Display as a 2-column grid of icon cards.

```tsx
"use client";

import { useBuilder } from "../BuilderContext";
import { Type, Image, Video, MousePointer, Minus, Square } from "lucide-react";

const BLOCKS = [
  { type: "text" as const, icon: Type, label: "Text" },
  { type: "image" as const, icon: Image, label: "Image" },
  { type: "video" as const, icon: Video, label: "Video" },
  { type: "cta" as const, icon: MousePointer, label: "CTA Button" },
  { type: "divider" as const, icon: Minus, label: "Divider" },
  { type: "container" as const, icon: Square, label: "Container" },
];

export default function ComponentsTab() {
  const { hasSelectedEl, selectedElRef, iframeRef, markDirty, pushUndoSnapshot } = useBuilder();

  function insertBlock(type: string) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    pushUndoSnapshot();

    let el: HTMLElement;
    switch (type) {
      case "text":
        el = doc.createElement("p");
        el.setAttribute("contenteditable", "true");
        el.textContent = "New text block";
        el.style.padding = "8px";
        break;
      case "image":
        el = doc.createElement("img");
        (el as HTMLImageElement).src = "data:image/svg+xml,..."; // placeholder SVG
        (el as HTMLImageElement).alt = "New image";
        el.style.width = "100%";
        el.style.maxWidth = "400px";
        break;
      case "video":
        el = doc.createElement("video");
        el.setAttribute("controls", "");
        el.style.width = "100%";
        el.style.maxWidth = "640px";
        break;
      case "cta":
        el = doc.createElement("a");
        el.href = "#";
        el.textContent = "Click Here";
        el.style.display = "inline-block";
        el.style.padding = "12px 24px";
        el.style.backgroundColor = "#4F46E5";
        el.style.color = "white";
        el.style.borderRadius = "6px";
        el.style.fontWeight = "600";
        el.style.textDecoration = "none";
        el.style.textAlign = "center";
        break;
      case "divider":
        el = doc.createElement("hr");
        el.style.margin = "16px 0";
        break;
      case "container":
        el = doc.createElement("div");
        el.style.padding = "16px";
        el.style.minHeight = "60px";
        el.style.border = "1px dashed #d1d5db";
        break;
      default:
        return;
    }

    const selected = selectedElRef.current;
    if (selected && selected.parentNode) {
      selected.parentNode.insertBefore(el, selected.nextSibling);
    } else {
      doc.body.appendChild(el);
    }

    markDirty();
  }

  return (
    <div className="p-3">
      <p className="text-xs text-gray-500 mb-3">
        {hasSelectedEl ? "Inserts after selected element" : "Inserts at end of page"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {BLOCKS.map((block) => (
          <button
            key={block.type}
            onClick={() => insertBlock(block.type)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
          >
            <block.icon className="w-5 h-5 text-gray-600" />
            <span className="text-xs text-gray-700">{block.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/builder/left-sidebar/ComponentsTab.tsx
git commit -m "feat(builder): implement ComponentsTab with insertable block grid"
```

---

## Task 12: Implement SettingsTab

**Files:**
- Modify: `src/components/builder/left-sidebar/SettingsTab.tsx`

**Step 1: Port settings from PageSettingsModal**

Move the content of `PageSettingsModal.tsx` (191 lines) into a tab panel instead of a modal. Fields:
- SEO Title input with character counter (green < 50, yellow 50-60, red > 60)
- Meta Description textarea with character counter (green < 130, yellow 130-160, red > 160)
- Slug input
- Destination URL: dropdown of `filteredUrls` if available, or custom text input
- Re-translate button (with confirmation if already published)

Also port the **Global Padding Controls** from `PaddingControls.tsx` (100 lines) into a collapsible section at the bottom of this tab:
- Desktop H/V padding inputs
- Mobile H/V padding inputs
- Exclude mode toggle with exclude count badge

Use `useBuilder()` for all state access.

**Step 2: Commit**

```bash
git add src/components/builder/left-sidebar/SettingsTab.tsx
git commit -m "feat(builder): implement SettingsTab with SEO, URL, padding controls"
```

---

## Task 13: Implement RightPanel Container

**Files:**
- Modify: `src/components/builder/right-panel/RightPanel.tsx`

**Step 1: Build the tabbed right panel**

320px wide panel, collapsible. Shows three tabs: Design, Config, AI. When no element is selected, shows a prompt to select one.

```tsx
"use client";

import { useBuilder } from "../BuilderContext";
import { Paintbrush, Settings2, Sparkles } from "lucide-react";
import DesignTab from "./DesignTab";
import ConfigTab from "./ConfigTab";
import AITab from "./AITab";

const TABS = [
  { id: "design" as const, icon: Paintbrush, label: "Design" },
  { id: "config" as const, icon: Settings2, label: "Config" },
  { id: "ai" as const, icon: Sparkles, label: "AI" },
];

export default function RightPanel() {
  const {
    rightTab, setRightTab, rightPanelOpen, setRightPanelOpen,
    hasSelectedEl, clickedImage, clickedVideo,
  } = useBuilder();

  if (!rightPanelOpen) {
    return (
      <div className="w-10 border-l border-gray-200 bg-white shrink-0 flex flex-col items-center pt-2 gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setRightTab(tab.id); setRightPanelOpen(true); }}
            className="p-2 rounded hover:bg-gray-100 text-gray-500"
            title={tab.label}
          >
            <tab.icon className="w-4 h-4" />
          </button>
        ))}
      </div>
    );
  }

  // If image/video clicked, show media panels (port existing ImagePanel/VideoPanel)
  if (clickedImage || clickedVideo) {
    return (
      <div className="w-[320px] border-l border-gray-200 bg-white shrink-0 flex flex-col overflow-y-auto">
        {/* Media panels rendered here — see Task 18 */}
        <div className="p-4 text-sm text-gray-500">Media panel — to be wired</div>
      </div>
    );
  }

  return (
    <div className="w-[320px] border-l border-gray-200 bg-white shrink-0 flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setRightTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              rightTab === tab.id
                ? "text-indigo-600 border-b-2 border-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {!hasSelectedEl ? (
          <div className="p-6 text-center text-sm text-gray-400">
            Click an element on the canvas to edit its properties
          </div>
        ) : (
          <>
            {rightTab === "design" && <DesignTab />}
            {rightTab === "config" && <ConfigTab />}
            {rightTab === "ai" && <AITab />}
          </>
        )}
      </div>
    </div>
  );
}
```

Create stubs for `DesignTab.tsx`, `ConfigTab.tsx`, `AITab.tsx`.

**Step 2: Commit**

```bash
git add src/components/builder/right-panel/
git commit -m "feat(builder): implement RightPanel with tabbed container"
```

---

## Task 14: Implement SpacingControl

**Files:**
- Create: `src/components/builder/right-panel/controls/SpacingControl.tsx`

**Step 1: Build the visual spacing editor**

Port the margin/padding controls from `ElementControls.tsx`. The control shows a visual box model diagram (nested rectangles for margin and padding) with inputs for each side. Includes HV toggle (horizontal+vertical linked vs. individual sides).

Key behavior from current `ElementControls.tsx`:
- Read computed styles from `selectedElRef.current` via `window.getComputedStyle()`
- Apply changes as inline styles: `el.style.marginTop = value + "px"` etc.
- After each change, call `markDirty()`
- HV mode: changing left also changes right, changing top also changes bottom

The control receives the selected element via `useBuilder()` and manages its own local state for the input values. It syncs from the element's computed styles on mount and when selection changes.

**Step 2: Commit**

```bash
git add src/components/builder/right-panel/controls/SpacingControl.tsx
git commit -m "feat(builder): implement SpacingControl with visual box model editor"
```

---

## Task 15: Implement SizeControl

**Files:**
- Create: `src/components/builder/right-panel/controls/SizeControl.tsx`

**Step 1: Build the size editor**

New control (not in current codebase). Reads and edits:
- `width`, `height` — value + unit dropdown (px, %, auto, fit-content, min-content, max-content)
- `min-width`, `min-height` — value + unit
- `max-width`, `max-height` — value + unit

Two-column grid layout. Each property has a number input and a unit select. Unit `auto` disables the number input.

Read from computed styles. Parse the value (e.g. "400px" → value: 400, unit: "px"). When changed, apply as inline style.

**Step 2: Commit**

```bash
git add src/components/builder/right-panel/controls/SizeControl.tsx
git commit -m "feat(builder): implement SizeControl with width/height/min/max"
```

---

## Task 16: Implement TypographyControl

**Files:**
- Create: `src/components/builder/right-panel/controls/TypographyControl.tsx`

**Step 1: Build the typography editor**

Port from `ElementControls.tsx` typography section and extend with new properties:
- Font size (px input)
- Font weight (dropdown: 100-900 in steps of 100)
- Text color (color picker → hex input)
- Text alignment (4 icon buttons: left, center, right, justify)
- Line height (decimal input, e.g. 1.5)
- Letter spacing (px input) — **NEW**
- Text decoration (dropdown: none, underline, line-through) — **NEW**
- Text transform (dropdown: none, uppercase, lowercase, capitalize) — **NEW**

Same pattern: read computed styles, apply inline, markDirty on change.

**Step 2: Commit**

```bash
git add src/components/builder/right-panel/controls/TypographyControl.tsx
git commit -m "feat(builder): implement TypographyControl with font, color, spacing"
```

---

## Task 17: Implement BackgroundControl, BorderControl, EffectsControl, LayoutControl

**Files:**
- Create: `src/components/builder/right-panel/controls/BackgroundControl.tsx`
- Create: `src/components/builder/right-panel/controls/BorderControl.tsx`
- Create: `src/components/builder/right-panel/controls/EffectsControl.tsx`
- Create: `src/components/builder/right-panel/controls/LayoutControl.tsx`

All four are new controls. Follow the same pattern as previous controls.

### BackgroundControl

- Background color (color picker + hex + opacity slider)
- Background image URL (text input + preview thumbnail)
- Background size (dropdown: cover, contain, auto, custom px)
- Background position (dropdown: center, top, bottom, left, right, or custom)
- Background repeat (dropdown: no-repeat, repeat, repeat-x, repeat-y)
- Gradient: type (linear/radial), direction/angle, color stops

Start simple: color + image URL + size. Gradient can be added later as enhancement.

### BorderControl

- Uniform toggle: all sides same, or per-side
- Border width (px input, per-side or uniform)
- Border style (dropdown: none, solid, dashed, dotted)
- Border color (color picker + hex)
- Border radius: uniform or per-corner (top-left, top-right, bottom-right, bottom-left)

### EffectsControl

- Box shadow: offset-x, offset-y, blur, spread (px inputs), color picker
- Multiple shadows support (add/remove)
- Opacity slider (0-100%)

### LayoutControl

- Display (dropdown: block, flex, grid, inline, inline-block, none)
- When flex:
  - Flex direction (row, column, row-reverse, column-reverse) — icon buttons
  - Justify content (flex-start, center, flex-end, space-between, space-around, space-evenly) — icon buttons
  - Align items (flex-start, center, flex-end, stretch, baseline) — icon buttons
  - Gap (px input)
  - Flex wrap (nowrap, wrap)
- When grid:
  - Grid template columns (text input, e.g. "1fr 1fr 1fr")
  - Gap (px input)

**Step 1: Implement all four controls**

Each follows the same pattern: read computed styles, render form inputs, apply inline styles on change, call `markDirty()`.

**Step 2: Commit**

```bash
git add src/components/builder/right-panel/controls/
git commit -m "feat(builder): implement Background, Border, Effects, Layout controls"
```

---

## Task 18: Implement DesignTab

**Files:**
- Modify: `src/components/builder/right-panel/DesignTab.tsx`

**Step 1: Orchestrate all design controls**

The DesignTab renders all control components in collapsible sections:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import SpacingControl from "./controls/SpacingControl";
import SizeControl from "./controls/SizeControl";
import TypographyControl from "./controls/TypographyControl";
import BackgroundControl from "./controls/BackgroundControl";
import BorderControl from "./controls/BorderControl";
import EffectsControl from "./controls/EffectsControl";
import LayoutControl from "./controls/LayoutControl";

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {title}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export default function DesignTab() {
  return (
    <div>
      <Section title="Layout" defaultOpen={false}><LayoutControl /></Section>
      <Section title="Size"><SizeControl /></Section>
      <Section title="Spacing"><SpacingControl /></Section>
      <Section title="Typography"><TypographyControl /></Section>
      <Section title="Background" defaultOpen={false}><BackgroundControl /></Section>
      <Section title="Border" defaultOpen={false}><BorderControl /></Section>
      <Section title="Effects" defaultOpen={false}><EffectsControl /></Section>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/builder/right-panel/DesignTab.tsx
git commit -m "feat(builder): implement DesignTab with collapsible control sections"
```

---

## Task 19: Implement ConfigTab

**Files:**
- Modify: `src/components/builder/right-panel/ConfigTab.tsx`

**Step 1: Build the config tab**

Port element configuration from `ElementControls.tsx`:

- **Link editing**: If selected element is `<a>` or contains an `<a>`, show href input and target dropdown (_self, _blank)
- **Image editing**: If selected element is `<img>`, show src URL input and alt text input
- **Video editing**: If selected element is `<video>`, show src URL input
- **Element visibility**: Hide/Show toggle button
- **Element actions**: Delete, Duplicate buttons
- **Custom CSS class**: Text input that reads/writes `className`

Each section only shows if relevant to the selected element type.

**Step 2: Commit**

```bash
git add src/components/builder/right-panel/ConfigTab.tsx
git commit -m "feat(builder): implement ConfigTab with link, image, video, element actions"
```

---

## Task 20: Implement AITab

**Files:**
- Modify: `src/components/builder/right-panel/AITab.tsx`

**Step 1: Port AI features from ElementControls**

Port the AI headline suggestions and copy variation generation from `ElementControls.tsx`:

**Headline Suggestions section:**
- "Generate Headlines" button
- Calls `POST /api/headlines/suggest` with current text, language, product
- Shows 3-5 generated alternatives as clickable cards
- Click to apply: replaces selected element's text content
- Loading state during generation

**Copy Variation section:**
- Two mode tabs: "Rewrite" and "Hook Inspired"
- "Generate" button
- Calls `POST /api/hooks/generate-variation` with text, mode, language, product
- Shows generated variation as editable text
- "Apply" button to replace selected element's text

Use `useBuilder()` for `selectedElRef`, `language`, `pageProduct`, `markDirty`, `pushUndoSnapshot`.

**Step 2: Commit**

```bash
git add src/components/builder/right-panel/AITab.tsx
git commit -m "feat(builder): implement AITab with headline suggestions and copy variations"
```

---

## Task 21: Wire Up Media Panels in RightPanel

**Files:**
- Modify: `src/components/builder/right-panel/RightPanel.tsx`

**Step 1: Integrate ImagePanel and VideoPanel**

When `clickedImage` is set, render the existing `ImagePanel` component in the right panel. When `clickedVideo` is set, render `VideoPanel`. Both components currently receive their data via props — adapt them to also work with builder context, or pass the needed props through.

The existing `ImagePanel` and `VideoPanel` components accept props like:
- `src`, `index`, `width`, `height` (from the click data)
- `iframeRef` (for DOM manipulation)
- `translationId`, `language`, `pageProduct` etc.
- `onClose` callback
- `onDirty` callback (markDirty)

Wire these from `useBuilder()` in `RightPanel.tsx`.

**Step 2: Verify image/video clicking works**

Click an image in the iframe → ImagePanel should appear in right panel. Click a video → VideoPanel appears. Close → back to Design/Config/AI tabs.

**Step 3: Commit**

```bash
git add src/components/builder/right-panel/RightPanel.tsx
git commit -m "feat(builder): wire ImagePanel and VideoPanel into RightPanel"
```

---

## Task 22: Wire Up Quality Analysis Panel

**Files:**
- Modify: `src/components/builder/BuilderTopBar.tsx` (add quality details expandable section)
- Create: `src/components/builder/QualityPanel.tsx`

**Step 1: Port quality details panel**

Port the quality analysis expandable panel from old `EditPageClient.tsx` (lines ~1120-1230). This shows when `showQualityDetails` is true:
- Overall assessment text
- Fluency issues list
- Grammar issues list
- Context errors list
- Name localization issues list
- Suggested corrections with "Apply Fix" button
- "Analyze" and "Auto-Fix" buttons

Render it as a dropdown panel below the quality badge in the top bar, or as a slide-down panel below the top bar.

**Step 2: Commit**

```bash
git add src/components/builder/QualityPanel.tsx src/components/builder/BuilderTopBar.tsx
git commit -m "feat(builder): implement QualityPanel with analysis details and auto-fix"
```

---

## Task 23: Wire Up Modals and Confirm Dialog

**Files:**
- Modify: `src/components/builder/BuilderShell.tsx`

**Step 1: Add modals to the shell**

Import and render the existing `PublishModal` and `ConfirmDialog` at the root of `BuilderShell`, passing props from `useBuilder()`:

```tsx
// In BuilderShell, inside the BuilderProvider:
<PublishModal
  open={showPublishModal}
  onClose={() => setShowPublishModal(false)}
  translationId={translation.id}
  language={language.value}
/>
<ConfirmDialog
  action={confirmAction}
  onClose={() => setConfirmAction(null)}
/>
```

**Step 2: Commit**

```bash
git add src/components/builder/BuilderShell.tsx
git commit -m "feat(builder): wire PublishModal and ConfirmDialog into BuilderShell"
```

---

## Task 24: End-to-End Verification

**Step 1: Full feature verification checklist**

Open the dev server and verify each feature works:

- [ ] Full-screen layout (no main sidebar visible)
- [ ] Top bar: back button navigates to page detail
- [ ] Top bar: page name displayed with language badge
- [ ] Top bar: undo/redo buttons work (edit text, then undo)
- [ ] Top bar: device switcher toggles desktop/mobile view
- [ ] Top bar: quality badge shows score
- [ ] Top bar: save button saves (check network tab)
- [ ] Top bar: Save & Publish opens publish modal
- [ ] Left sidebar: Layers tab shows DOM tree
- [ ] Left sidebar: clicking a layer selects the element
- [ ] Left sidebar: eye icon toggles element visibility
- [ ] Left sidebar: Components tab shows insert grid
- [ ] Left sidebar: inserting a block adds it to the page
- [ ] Left sidebar: Settings tab shows SEO fields
- [ ] Left sidebar: settings padding controls work
- [ ] Right panel: shows "click to select" when nothing selected
- [ ] Right panel: Design tab shows all controls when element selected
- [ ] Right panel: spacing control changes margin/padding
- [ ] Right panel: typography controls change font/color/alignment
- [ ] Right panel: border controls add borders
- [ ] Right panel: size controls change width/height
- [ ] Right panel: Config tab shows link href for `<a>` elements
- [ ] Right panel: AI tab generates headline suggestions
- [ ] Right panel: clicking an image shows ImagePanel
- [ ] Right panel: clicking a video shows VideoPanel
- [ ] Status bar: shows autosave status
- [ ] Status bar: zoom controls work
- [ ] Keyboard shortcuts: Ctrl+S saves, Ctrl+Z undoes, Ctrl+Shift+Z redoes
- [ ] Autosave triggers after 3s of inactivity
- [ ] Before-unload warning when dirty
- [ ] Exclude mode for padding works
- [ ] Re-translate button works
- [ ] Quality analysis runs and shows results

**Step 2: Fix any issues found**

Address each broken feature one at a time, committing fixes individually.

**Step 3: Commit**

```bash
git commit -m "fix(builder): address issues found during verification"
```

---

## Task 25: Cleanup — Remove Old Components and Reference File

**Files:**
- Delete: `src/components/builder/_OLD_EditPageClient.tsx.bak`
- Optionally delete (if no other routes use them):
  - `src/components/pages/editor/ElementControls.tsx`
  - `src/components/pages/editor/PaddingControls.tsx`
  - `src/components/pages/editor/PageSettingsModal.tsx`
  - `src/components/pages/editor/LayersPanel.tsx`

**Step 1: Check for other usages**

```bash
grep -r "ElementControls\|PaddingControls\|PageSettingsModal\|LayersPanel" src/ --include="*.tsx" --include="*.ts" | grep -v "builder/" | grep -v "_OLD_"
```

If no other files import these, they can be safely deleted.

**Step 2: Remove unused files**

```bash
rm src/components/builder/_OLD_EditPageClient.tsx.bak
# Only delete old components if grep confirms no other usages
```

**Step 3: Verify build passes**

```bash
npm run build
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore(builder): remove old editor components and reference file"
```

---

## Summary of New Files

```
src/
├── app/pages/[id]/edit/
│   └── layout.tsx                          ← NEW: full-screen overlay
├── components/builder/
│   ├── BuilderContext.tsx                   ← NEW: all state + logic
│   ├── BuilderShell.tsx                    ← NEW: layout grid
│   ├── BuilderTopBar.tsx                   ← NEW: navigation + actions
│   ├── BuilderCanvas.tsx                   ← NEW: iframe wrapper
│   ├── BuilderStatusBar.tsx                ← NEW: quality + autosave + zoom
│   ├── QualityPanel.tsx                    ← NEW: quality analysis details
│   ├── left-sidebar/
│   │   ├── LeftSidebar.tsx                 ← NEW: tabbed container
│   │   ├── LayersTab.tsx                   ← NEW: ported from LayersPanel
│   │   ├── ComponentsTab.tsx               ← NEW: insert blocks grid
│   │   └── SettingsTab.tsx                 ← NEW: SEO + padding + URL
│   └── right-panel/
│       ├── RightPanel.tsx                  ← NEW: tabbed container
│       ├── DesignTab.tsx                   ← NEW: orchestrates controls
│       ├── ConfigTab.tsx                   ← NEW: links, images, actions
│       ├── AITab.tsx                       ← NEW: headline + copy AI
│       └── controls/
│           ├── SpacingControl.tsx           ← NEW: box model editor
│           ├── SizeControl.tsx             ← NEW: width/height/min/max
│           ├── TypographyControl.tsx       ← NEW: font + color + alignment
│           ├── BackgroundControl.tsx        ← NEW: color + image + gradient
│           ├── BorderControl.tsx           ← NEW: width + radius + color
│           ├── EffectsControl.tsx          ← NEW: shadow + opacity
│           └── LayoutControl.tsx           ← NEW: flexbox + grid
```

## Modified Files

```
src/app/pages/[id]/edit/[language]/EditPageClient.tsx  ← SLIMMED: now just mounts BuilderShell
```

## Deleted Files (after verification)

```
src/components/pages/editor/ElementControls.tsx        ← Logic moved to right panel controls
src/components/pages/editor/PaddingControls.tsx         ← Moved to SettingsTab
src/components/pages/editor/PageSettingsModal.tsx       ← Moved to SettingsTab
src/components/pages/editor/LayersPanel.tsx             ← Moved to LayersTab
```
