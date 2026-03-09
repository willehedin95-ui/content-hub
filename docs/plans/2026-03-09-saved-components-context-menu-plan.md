# Saved Components + Context Menu — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a reusable component library (save/browse/insert HTML sections) and a right-click context menu to the page builder.

**Architecture:** New `saved_components` Supabase table stores HTML + thumbnails. Context menu wired into BuilderContext state, triggered from layers panel and canvas iframe. Components tab redesigned with saved component grid above basic blocks. Thumbnail generation via puppeteer-core (already a dependency).

**Tech Stack:** Next.js App Router, React Context (BuilderContext), Supabase (PostgREST + Storage), puppeteer-core + @sparticuz/chromium, Tailwind CSS, lucide-react icons.

**Security note:** All HTML content in saved components originates from authenticated user's own pages (same-origin, access-controlled). The innerHTML usage follows the same pattern as the existing builder (see BuilderContext `extractHtmlFromIframe` and TextEditorControl). The existing eslint-disable comments for `no-unsanitized/property` apply. Future improvement: add DOMPurify sanitization.

---

### Task 1: Create `saved_components` database table

**Files:**
- None (DDL via Supabase Management API)

**Step 1: Run DDL migration**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "CREATE TABLE IF NOT EXISTS saved_components ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, html TEXT NOT NULL, thumbnail_url TEXT, product TEXT, category TEXT NOT NULL DEFAULT '\''section'\'', created_at TIMESTAMPTZ NOT NULL DEFAULT now() );"}'
```

**Step 2: Create Supabase Storage bucket**

```bash
curl -s -X POST "https://fbpefeqqqfrcmfmjmeij.supabase.co/storage/v1/bucket" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY from .env.local>" \
  -H "Content-Type: application/json" \
  -d '{"id": "component-thumbnails", "name": "component-thumbnails", "public": true}'
```

**Step 3: Verify table exists**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''saved_components'\'' ORDER BY ordinal_position;"}'
```

---

### Task 2: API endpoints — GET + POST `/api/saved-components`

**Files:**
- Create: `src/app/api/saved-components/route.ts`

**Context:**
- Use `createServerSupabase()` from `src/lib/supabase-server.ts` for DB access
- Existing API routes (e.g., `src/app/api/pages/route.ts`) show the pattern
- Thumbnail generation uses puppeteer-core (same as `src/app/api/pages/[id]/screenshot/route.ts`)

**Step 1: Create the route file**

Implements:
- `GET` — list all saved components, optional `?product=` filter, sorted by created_at DESC
- `POST` — save new component with `{ name, html, product? }`, auto-detect category from root tag, generate thumbnail via Puppeteer screenshot, upload to Supabase Storage `component-thumbnails` bucket, return saved record

Category detection: SECTION/HEADER/FOOTER/NAV/MAIN/ARTICLE/ASIDE → "section", H1-H6/P/BLOCKQUOTE → "text", IMG/PICTURE/VIDEO → "media", BUTTON/A → "button", DIV → "section", else → "container"

Thumbnail generation:
1. Launch puppeteer-core with @sparticuz/chromium (same pattern as screenshot route)
2. Set viewport 800×600, wrap HTML in minimal page shell
3. Screenshot as PNG, upload to Supabase Storage
4. Get public URL, store in record

If thumbnail generation fails, save the component anyway (thumbnail is optional).

**Step 2: Verify endpoint works**

```bash
curl -s http://localhost:3000/api/saved-components | jq
```

**Step 3: Commit**

```bash
git add src/app/api/saved-components/route.ts
git commit -m "feat(builder): add saved-components API with thumbnail generation"
```

---

### Task 3: API endpoints — PATCH + DELETE `/api/saved-components/[id]`

**Files:**
- Create: `src/app/api/saved-components/[id]/route.ts`

**Step 1: Create the route file**

Implements:
- `PATCH` — rename: `{ name }` → update record, return updated
- `DELETE` — fetch record to get thumbnail filename, delete from Storage, delete DB record

Note: Use `{ params }: { params: Promise<{ id: string }> }` signature (Next.js 15 async params pattern).

**Step 2: Commit**

```bash
git add src/app/api/saved-components/[id]/route.ts
git commit -m "feat(builder): add PATCH/DELETE endpoints for saved components"
```

---

### Task 4: Context menu component + BuilderContext state

**Files:**
- Create: `src/components/builder/menus/ContextMenu.tsx`
- Modify: `src/components/builder/BuilderContext.tsx`

**Context:**
- BuilderContext already has `handleDeleteElement` (~line 667), `handleDuplicateElement`, keyboard handler (~line 1401), `selectElementInIframe` (~line 1288)
- Existing keyboard shortcuts: Ctrl+S (save), Ctrl+Z (undo), Ctrl+Shift+Z (redo), Backspace/Delete
- All state callbacks follow the pattern: pushUndoSnapshot → mutate DOM → markDirty

**BuilderContext additions:**

State:
- `contextMenu: { x: number; y: number; targetEl: HTMLElement } | null`
- `copiedHtmlRef: useRef<string | null>(null)`
- `renamingEl: HTMLElement | null`
- `showSaveComponentModal: boolean`
- `saveComponentHtml: string`
- `savedComponents: SavedComponent[]`

Callbacks:
- `openContextMenu(el, x, y)` — select element + show menu
- `closeContextMenu()` — hide menu
- `handleCopyElement()` — store outerHTML in copiedHtmlRef
- `handlePasteElement()` — parse copied HTML, insert after selected, select new element
- `handleGroupElement()` — wrap selected in `<div style="padding:16px">`, select wrapper
- `startRenameElement()` — set renamingEl, close context menu
- `handleRenameElement(name)` — set `data-cc-name` attr on element
- `handleSaveAsComponent()` — clone selected el, strip editor attrs, show save modal
- `insertSavedComponent(html)` — parse HTML into iframe doc, insert after selected

New keyboard shortcuts (add to existing handleKeyDown, only when not typing in INPUT/TEXTAREA):
- Cmd+C → `handleCopyElement()` (don't preventDefault, let browser also copy text)
- Cmd+V → `handlePasteElement()` (only if copiedHtmlRef has content + element selected)
- Cmd+D → `handleDuplicateElement()` (already exists, just add shortcut)
- Cmd+G → `handleGroupElement()`
- Cmd+Shift+S → `handleSaveAsComponent()`
- Escape → `closeContextMenu()` (when menu is open)

**ContextMenu component:**

Positioned at `position: fixed` at (x, y) from click, clamped to viewport. Items:
1. Copy (⌘C)
2. Paste (⌘V) — disabled if nothing copied
3. Duplicate (⌘D)
4. Rename
5. Delete (⌫) — with separator above
6. Group Into Container (⌘G) — with separator above
7. Save as Component (⌘⇧S)

Close on: outside click (mousedown), Escape key, any action.

**Step: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/builder/menus/ContextMenu.tsx src/components/builder/BuilderContext.tsx
git commit -m "feat(builder): add context menu component with copy/paste/duplicate/rename/delete/group"
```

---

### Task 5: Wire context menu to Layers panel

**Files:**
- Modify: `src/components/builder/left-sidebar/LayersTab.tsx`

**Changes to LayerItem:**

1. Add `onContextMenu` handler to the main row div:
   ```
   onContextMenu → preventDefault, stopPropagation, call openContextMenu(node.el, e.clientX, e.clientY)
   ```

2. Show `data-cc-name` as display name override:
   ```
   const displayName = node.el.getAttribute("data-cc-name") || TAG_LABELS[node.tag] || node.tag;
   ```

3. Inline rename input: when `renamingEl === node.el`, render `<input>` instead of label text. Input: autoFocus, defaultValue from data-cc-name, onBlur/onEnter → handleRenameElement, onEscape → cancel.

**Step: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/builder/left-sidebar/LayersTab.tsx
git commit -m "feat(builder): wire context menu + rename to layers panel"
```

---

### Task 6: Wire context menu to canvas iframe

**Files:**
- Modify: `src/components/builder/BuilderContext.tsx` (inside `handleIframeLoad`)

**Context:**
- `handleIframeLoad` (~line 894) sets up click handlers on the iframe document
- Need to add `contextmenu` event listener that translates iframe coordinates to page coordinates
- Use ref pattern for openContextMenu to avoid stale closures (same as other iframe callbacks)

**Changes:**

1. Add `openContextMenuRef` alongside existing refs:
   ```
   const openContextMenuRef = useRef(openContextMenu);
   useEffect(() => { openContextMenuRef.current = openContextMenu; });
   ```

2. In `handleIframeLoad`, after existing click listener, add:
   ```
   doc.addEventListener("contextmenu", (e) => {
     e.preventDefault();
     const target = e.target as HTMLElement;
     if (!target || target === doc.body || target === doc.documentElement) return;
     // Translate iframe coords to page coords
     const rect = iframe.getBoundingClientRect();
     openContextMenuRef.current(target, rect.left + e.clientX, rect.top + e.clientY);
   });
   ```

**Step: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/builder/BuilderContext.tsx
git commit -m "feat(builder): wire context menu to canvas iframe right-click"
```

---

### Task 7: Save as Component modal

**Files:**
- Create: `src/components/builder/menus/SaveComponentModal.tsx`

**Component:**
- Props: `show`, `html`, `product?`, `onClose`, `onSaved`
- UI: modal overlay with name input, Cancel/Save buttons
- On Save: POST to `/api/saved-components`, show loading state, call onSaved with returned record
- Close on: Escape, backdrop click, Cancel button
- Error handling: show error message inline

**Mount in builder shell** alongside ContextMenu. Wire to `showSaveComponentModal` and `saveComponentHtml` from BuilderContext. `onSaved` callback adds new component to `savedComponents` state array.

**Step: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/builder/menus/SaveComponentModal.tsx
git commit -m "feat(builder): save as component modal with name input"
```

---

### Task 8: Redesign ComponentsTab with saved components grid

**Files:**
- Modify: `src/components/builder/left-sidebar/ComponentsTab.tsx`

**Layout (top to bottom):**
1. Search bar (filters both saved and basic by name)
2. "Saved" section header + 2-column grid of saved component cards
3. "Basic Elements" section header + existing 2-column grid

**Saved component card:**
- Cyan "Saved" badge top-left
- Thumbnail image (or "No preview" placeholder)
- Component name (truncated)
- Three-dot menu on hover (Rename, Delete)
- Click → calls `insertSavedComponent(html)`

**Three-dot menu:** Opens small dropdown with Rename and Delete. Rename shows inline input. Delete calls API then removes from state.

**Empty state:** When search matches nothing, show "No components match" message.

**Step: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/builder/left-sidebar/ComponentsTab.tsx
git commit -m "feat(builder): redesign components tab with saved components grid"
```

---

### Task 9: Integration, build, and browser test

**Files:**
- May need minor fixes across modified files

**Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

**Step 2: Build**

```bash
npm run build
```

If `.next` cache causes issues: `rm -rf .next && npm run build`

**Step 3: Browser test checklist**

1. **Context menu on layers**: Right-click layer item → menu with all 7 actions
2. **Context menu on canvas**: Right-click element in iframe → same menu
3. **Copy + Paste**: Copy element → select another → Paste → element inserted after
4. **Duplicate**: Duplicate → element cloned after itself
5. **Delete**: Delete → element removed
6. **Rename**: Rename → inline input → type name → Enter → name shows in layers
7. **Group**: Group Into Container → element wrapped in div
8. **Save as Component**: Save as Component → modal → enter name → Save → success
9. **Components tab**: Saved component appears with thumbnail
10. **Insert saved component**: Click card → HTML inserted into page
11. **Search**: Type → filters both saved and basic
12. **Three-dot menu**: Hover → Rename/Delete work
13. **Keyboard shortcuts**: Cmd+C, Cmd+V, Cmd+D, Cmd+G, Cmd+Shift+S

**Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat(builder): complete saved components + context menu"
git push origin main
```

---

## Summary of all files

### New files (4)
| File | Purpose |
|------|---------|
| `src/app/api/saved-components/route.ts` | GET + POST endpoints |
| `src/app/api/saved-components/[id]/route.ts` | PATCH + DELETE endpoints |
| `src/components/builder/menus/ContextMenu.tsx` | Right-click context menu |
| `src/components/builder/menus/SaveComponentModal.tsx` | Save dialog |

### Modified files (3)
| File | Changes |
|------|---------|
| `src/components/builder/BuilderContext.tsx` | Context menu state, clipboard ops, keyboard shortcuts, saved components state, insert function |
| `src/components/builder/left-sidebar/ComponentsTab.tsx` | Full redesign with saved grid, search, three-dot menu |
| `src/components/builder/left-sidebar/LayersTab.tsx` | onContextMenu handler, data-cc-name display, inline rename |
