# Page Builder Redesign — Replo-Inspired

**Date**: 2026-03-09
**Status**: Approved
**Inspiration**: Replo (replo.app) — full-screen e-commerce page builder

## Problem

The current page builder shares the main app sidebar, wasting ~250px of canvas space. All editing controls are stacked in a single left panel (padding, element styles, layers, media panels), making the interface feel cluttered. Styling controls are limited to basic spacing and typography.

## Goals

1. Full-screen builder mode — hide main app sidebar, maximize canvas
2. Tabbed left sidebar — Layers, Components, Settings (one visible at a time)
3. Right properties panel — full styling controls (Design, Config, AI tabs)
4. Clean, professional builder chrome inspired by Replo/Figma

## Architecture

### Approach: New Layout Shell + Component Extraction

Create a dedicated builder layout that replaces the default app layout. Extract the 1,480-line `EditPageClient.tsx` monolith into well-separated components. State management via React Context (`BuilderContext`).

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Back   Page Name (editable)    ↩ ↪  💻 📱  Save  Save & Publish │  Top Bar (48px)
├──────┬──────────────────────────────────────────────┬───────────────┤
│ [L]  │                                              │   Design ▾    │
│ [C]  │                                              │               │
│ [⚙]  │                                              │  Spacing      │
│      │            Canvas (iframe)                   │  Typography   │
│ ───  │                                              │  Borders      │
│Layers│         Desktop: 1440px frame                │  Effects      │
│ tree │         Mobile: 375px frame                  │  Layout       │
│  or  │                                              │  Background   │
│Comps │                                              │               │
│  or  │                                              │  ─── AI ───   │
│Setngs│                                              │  Headlines    │
│      │                                              │  Copy Vars    │
├──────┴──────────────────────────────────────────────┴───────────────┤
│  Quality: 92  │  Autosaved ✓  │  Zoom: 100%  │  View: Desktop      │  Status Bar (32px)
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### Top Bar
- ← Back button → `/pages/[id]`
- Editable page name with language badge (SV, NO, DA)
- Undo / Redo buttons (+ Ctrl+Z / Ctrl+Shift+Z)
- Device switcher (Desktop / Mobile icons)
- Quality score badge (green ≥85, yellow ≥60, red <60)
- Save button (Ctrl+S)
- Save & Publish button → opens publish modal

### Left Sidebar (280px, collapsible)

Three icon-tab panels:

**Layers tab** (tree icon):
- DOM tree with semantic elements only
- Drag-and-drop reordering
- Right-click context menu (duplicate, delete, hide, wrap)
- Eye icon for visibility toggle
- Text preview (30 chars)
- Max 5 depth levels, collapsible groups

**Components tab** (plus icon):
- Grid of insertable blocks: Text, Image, Video, CTA Button, Divider, Container
- Click to insert after selected element
- Future: saved sections library

**Settings tab** (gear icon):
- SEO title (char counter, color-coded)
- Meta description (char counter)
- Slug field
- Destination URL (saved dropdown or custom)
- Re-translate button

### Right Properties Panel (320px, collapsible)

Visible when element is selected. Three tabs:

**Design tab** (collapsible sections):

| Section | Controls |
|---------|----------|
| Spacing | Margin + Padding: visual box model, HV/individual toggle |
| Size | Width, Height, Min-W, Min-H, Max-W, Max-H with unit dropdown (px, %, auto, fit-content) |
| Typography | Font size, weight, color, alignment, line-height, letter-spacing, text-decoration, text-transform |
| Background | Color picker, gradient (linear/radial), image URL, size (cover/contain), position |
| Border | Width (per-side or uniform), color, style (solid/dashed/dotted), radius (per-corner or uniform) |
| Effects | Box shadow (X, Y, blur, spread, color), opacity slider |
| Layout | Display (block/flex/grid/none), flex-direction, justify-content, align-items, gap, flex-wrap |

**Config tab**:
- Link editing (href, target)
- Image src/alt
- Video src
- Element visibility toggle
- Delete / Duplicate element
- Custom CSS class

**AI tab**:
- Headline suggestions (generate 3-5, click to apply)
- Copy variation (rewrite mode, hook-inspired mode)
- Product context display

### Status Bar (bottom, 32px)
- Quality score badge
- Autosave status
- Zoom level (50-200%)
- View mode indicator

### Canvas
- Iframe wrapper with responsive sizing
- Desktop: full width, Mobile: 375px centered with border
- Same postMessage communication as current implementation

## State Architecture

```typescript
interface BuilderState {
  // Page data
  pageId: string;
  pageName: string;
  language: Language;
  isSource: boolean;
  product?: string;

  // Content
  isDirty: boolean;
  autoSaveStatus: 'idle' | 'saving' | 'saved';

  // Selection
  selectedElement: SelectedElement | null;

  // View
  viewMode: 'desktop' | 'mobile';
  zoom: number;
  leftSidebarTab: 'layers' | 'components' | 'settings';
  leftSidebarOpen: boolean;
  rightPanelTab: 'design' | 'config' | 'ai';
  rightPanelOpen: boolean;

  // History
  canUndo: boolean;
  canRedo: boolean;

  // Quality
  qualityScore: number | null;
  qualityAnalysis: PageQualityAnalysis | null;

  // Media
  clickedImage: ClickedImage | null;
  clickedVideo: ClickedVideo | null;

  // Actions
  undo: () => void;
  redo: () => void;
  save: () => void;
  publish: () => void;
  selectElement: (ref: string) => void;
  deselectElement: () => void;
  updateElementStyle: (property: string, value: string) => void;
  insertBlock: (type: BlockType, position: 'before' | 'after') => void;
  deleteElement: () => void;
  duplicateElement: () => void;
  hideElement: () => void;
  markDirty: () => void;
}
```

## File Structure

```
src/
├── app/pages/[id]/edit/
│   ├── layout.tsx                    ← Full-screen layout (no app sidebar)
│   └── [language]/
│       ├── page.tsx                  ← Server component (data fetching)
│       └── EditPageClient.tsx        ← Slim wrapper, mounts BuilderShell
├── components/builder/
│   ├── BuilderShell.tsx              ← Main layout grid
│   ├── BuilderContext.tsx            ← React context + provider
│   ├── BuilderTopBar.tsx             ← Navigation, actions, device switcher
│   ├── BuilderCanvas.tsx             ← Iframe wrapper + responsive frames
│   ├── BuilderStatusBar.tsx          ← Quality, autosave, zoom
│   ├── left-sidebar/
│   │   ├── LeftSidebar.tsx           ← Tab container
│   │   ├── LayersTab.tsx             ← DOM tree
│   │   ├── ComponentsTab.tsx         ← Insert blocks grid
│   │   └── SettingsTab.tsx           ← SEO, slug, URL
│   ├── right-panel/
│   │   ├── RightPanel.tsx            ← Tab container
│   │   ├── DesignTab.tsx             ← Styling controls orchestrator
│   │   ├── ConfigTab.tsx             ← Links, images, visibility
│   │   ├── AITab.tsx                 ← Headlines, copy variations
│   │   └── controls/
│   │       ├── SpacingControl.tsx    ← Visual box model editor
│   │       ├── SizeControl.tsx       ← Width/height with units
│   │       ├── TypographyControl.tsx ← Font controls
│   │       ├── BackgroundControl.tsx ← Color/gradient/image
│   │       ├── BorderControl.tsx     ← Border + radius
│   │       ├── EffectsControl.tsx    ← Shadow + opacity
│   │       └── LayoutControl.tsx     ← Flexbox controls
│   └── modals/
│       ├── PublishModal.tsx           ← Existing, moved
│       └── QualityPanel.tsx          ← Quality analysis details
```

## Migration Strategy

1. Build new components alongside existing ones (no breaking changes)
2. Create the builder layout that suppresses the main sidebar
3. Wire up BuilderContext with same logic as current EditPageClient
4. Swap the edit route to use the new BuilderShell
5. Delete old monolithic components after verification

## What's NOT Changing

- Iframe preview architecture (`/api/preview/[id]`)
- postMessage communication protocol
- API endpoints (save, publish, translate, quality)
- Database schema
- Autosave logic (debounced 3s)
- Undo/redo snapshot approach
- Swiper/ImageMapper (separate flow, not part of builder)
