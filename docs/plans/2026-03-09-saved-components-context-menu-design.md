# Saved Components + Context Menu — Design

## Goal

Add a reusable component library to the page builder: save any element/section as a component, browse saved components with thumbnail previews, and insert them into any page. Also add a right-click context menu to the layers panel and canvas for common actions (Copy, Paste, Duplicate, Delete, Rename, Group, Save as Component).

## Architecture

Three new pieces:
1. **`saved_components` Supabase table** — stores HTML chunks + metadata + thumbnail URL
2. **Right-click context menu** — appears on layers panel and canvas elements
3. **Updated Components tab** — saved components grid at top, basic blocks below

## Database — `saved_components` table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID, PK, default `gen_random_uuid()` | Primary key |
| `name` | TEXT NOT NULL | User-given name ("Footer", "Testimonial Card") |
| `html` | TEXT NOT NULL | Cleaned outerHTML of saved element |
| `thumbnail_url` | TEXT | Supabase storage URL for preview image |
| `product` | TEXT | "happysleep", "hydro13", or NULL = shared |
| `category` | TEXT NOT NULL | Auto-detected: "section", "text", "image", "button", "container" |
| `created_at` | TIMESTAMPTZ, default `now()` | |

Category auto-detection logic:
- SECTION, HEADER, FOOTER, NAV, MAIN, ARTICLE, ASIDE → "section"
- H1-H6, P, BLOCKQUOTE → "text"
- IMG, PICTURE, VIDEO → "media"
- BUTTON, A (with button styling) → "button"
- DIV with children → "section"
- Everything else → "container"

## Context Menu

Right-click on any element in **layers panel** or **canvas iframe** shows a positioned context menu:

| Action | Shortcut | Behavior |
|--------|----------|----------|
| Copy | Cmd+C | Copies element's cleaned outerHTML to clipboard |
| Paste | Cmd+V | Parses clipboard HTML, inserts after selected element |
| Duplicate | Cmd+D | Clones element immediately after itself |
| Rename | — | Sets `data-cc-name` attribute (shown in layers panel) |
| Delete | Backspace | Removes element from DOM |
| — separator — | | |
| Group Into Container | Cmd+G | Wraps element in a `<div>` with 16px padding |
| Save as Component | Cmd+Shift+S | Opens name dialog → saves to DB with thumbnail |

### Context menu implementation

- New `ContextMenu` component in `src/components/builder/menus/ContextMenu.tsx`
- State in BuilderContext: `contextMenu: { x, y, el } | null`
- Layers panel: `onContextMenu` handler on each `LayerItem`
- Canvas iframe: `contextmenu` event listener (translate iframe coordinates to page coordinates)
- Closes on click outside, Escape key, or any action
- Keyboard shortcuts registered globally in BuilderContext (existing pattern)

### Rename flow

- Context menu "Rename" opens an inline text input in the layers panel
- Sets `data-cc-name="User Label"` on the element
- Layers panel reads `data-cc-name` as display name (falls back to tag name)
- The `data-cc-name` attribute is preserved in saved HTML (not stripped on save)

## Thumbnail Generation

When saving a component:

1. Extract cleaned outerHTML (strip editor attributes via existing `extractHtmlFromIframe` pattern)
2. POST to `/api/saved-components` with `{ name, html, product }`
3. Server-side thumbnail generation:
   - Wrap HTML in a minimal page shell (viewport 800px wide, white background)
   - Use Puppeteer (already a dependency) to screenshot the rendered HTML
   - Resize to 400×300 max (maintain aspect ratio)
   - Upload to Supabase Storage bucket `component-thumbnails`
   - Save record with `thumbnail_url` to `saved_components` table
4. Return the saved component record to client

## Components Tab Redesign

Layout (top to bottom):
1. **Search bar** — filters both saved and basic components by name
2. **Saved section** — 2-column grid of saved component cards
3. **Basic Elements section** — existing 6 blocks (Text, Image, Video, CTA, Divider, Container)

### Saved component card

```
┌─────────────────┐
│ Saved            │  ← cyan badge (like Replo)
│                  │
│   [thumbnail]    │  ← 160×120 preview image
│                  │
│ Component Name   │  ← truncated with ellipsis
│            ···   │  ← three-dot menu (Rename, Delete)
└─────────────────┘
```

- **Click** → inserts HTML after selected element (or at body end)
- **Hover** → shows larger preview tooltip
- **Three-dot menu** → Rename, Delete

### Insert flow

1. Component HTML already loaded in client state (fetched on builder mount)
2. Parse HTML string into DOM nodes via `DOMParser`
3. Insert after `selectedElRef.current` (or append to `<body>` if nothing selected)
4. Push undo snapshot, mark dirty, refresh layers

## API Endpoints

### `POST /api/saved-components`
- Body: `{ name, html, product? }`
- Generates thumbnail server-side
- Returns: saved component record

### `GET /api/saved-components`
- Returns all saved components (optionally filter by `?product=`)
- Sorted by `created_at DESC`

### `PATCH /api/saved-components/[id]`
- Body: `{ name? }` (rename)

### `DELETE /api/saved-components/[id]`
- Deletes record + thumbnail from storage

## Files to Create/Modify

### New files
- `src/app/api/saved-components/route.ts` — GET, POST
- `src/app/api/saved-components/[id]/route.ts` — PATCH, DELETE
- `src/components/builder/menus/ContextMenu.tsx` — right-click context menu
- `src/components/builder/menus/SaveComponentModal.tsx` — name input dialog

### Modified files
- `src/components/builder/BuilderContext.tsx` — context menu state, keyboard shortcuts, clipboard ops
- `src/components/builder/left-sidebar/ComponentsTab.tsx` — saved components grid + search
- `src/components/builder/left-sidebar/LayersTab.tsx` — onContextMenu handler on LayerItem
- `src/components/builder/BuilderCanvas.tsx` — contextmenu listener on iframe

## Non-goals (V1)

- **Drag-and-drop insertion** — click to insert matches existing basic blocks behavior
- **Component versioning** — no update-in-place, just save new / delete old
- **Shared component library** — single-user system, no team sharing
- **Nested component instances** — inserted HTML is a copy, not a live reference
