# Link Modal & Viewport Selector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `window.prompt()` with proper Link Modal and add Viewport Selector with 4 device presets to page builder.

**Architecture:** Both features integrate with BuilderContext for state management. LinkModal uses React Portal for overlay rendering. Viewport selector uses headlessui Menu component. No API changes, client-side only.

**Tech Stack:** React, TypeScript, Tailwind CSS, headlessui, Next.js 15

---

## Task 1: Add State to BuilderContext

**Files:**
- Modify: `src/components/builder/BuilderContext.tsx`

**Step 1: Add viewport and link modal state**

Add after line 142 (after existing state declarations):

```typescript
// Viewport configuration
type ViewportConfig = {
  device: "desktop" | "iphone-13" | "ipad" | "custom";
  width: number | null;
  height: number | null;
};

const [viewportConfig, setViewportConfig] = useState<ViewportConfig>({
  device: "desktop",
  width: null,
  height: null,
});

// Link modal state
const [showLinkModal, setShowLinkModal] = useState(false);
```

**Step 2: Add to context value object**

Find the `value` object (around line 1602) and add these new values:

```typescript
const value = {
  // ... existing values ...
  viewportConfig,
  setViewportConfig,
  showLinkModal,
  setShowLinkModal,
};
```

**Step 3: Update BuilderContextType interface**

Find the interface (around line 70) and add:

```typescript
export type BuilderContextType = {
  // ... existing fields ...
  viewportConfig: {
    device: "desktop" | "iphone-13" | "ipad" | "custom";
    width: number | null;
    height: number | null;
  };
  setViewportConfig: React.Dispatch<React.SetStateAction<{
    device: "desktop" | "iphone-13" | "ipad" | "custom";
    width: number | null;
    height: number | null;
  }>>;
  showLinkModal: boolean;
  setShowLinkModal: React.Dispatch<React.SetStateAction<boolean>>;
};
```

**Step 4: Verify TypeScript compiles**

Run: `npm run build`
Expected: No TypeScript errors

**Step 5: Commit**

```bash
git add src/components/builder/BuilderContext.tsx
git commit -m "feat(builder): add viewport config and link modal state to context

- Add viewportConfig state (device, width, height)
- Add showLinkModal boolean state
- Update BuilderContextType interface

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create LinkModal Component

**Files:**
- Create: `src/components/builder/modals/LinkModal.tsx`

**Step 1: Create modals directory**

Run: `mkdir -p src/components/builder/modals`

**Step 2: Create LinkModal component**

Create file with complete implementation:

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface LinkModalProps {
  show: boolean;
  onClose: () => void;
  onInsert: (url: string) => void;
  initialUrl?: string;
}

export default function LinkModal({ show, onClose, onInsert, initialUrl = "" }: LinkModalProps) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Validate URL
  useEffect(() => {
    if (!url.trim()) {
      setError("");
      return;
    }

    const trimmedUrl = url.trim();
    const safeSchemes = /^(https?|mailto|tel):/i;
    const isRelative = /^[./]|^[^:/?#]+$/;

    if (!safeSchemes.test(trimmedUrl) && !isRelative.test(trimmedUrl)) {
      setError("Invalid URL. Only http://, https://, mailto:, tel:, or relative URLs are allowed.");
    } else {
      setError("");
    }
  }, [url]);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (show && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [show]);

  // Handle ESC key
  useEffect(() => {
    if (!show) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [show, onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || error) return;
    onInsert(url.trim());
    setUrl("");
    setError("");
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  if (!show) return null;

  const isValid = url.trim() && !error;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Insert Link</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            URL
          </label>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 ${
              error
                ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                : "border-gray-300 focus:ring-indigo-500 focus:border-indigo-500"
            }`}
          />
          {error && (
            <p className="mt-1.5 text-xs text-red-600">{error}</p>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Insert
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
```

**Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add src/components/builder/modals/LinkModal.tsx
git commit -m "feat(builder): add LinkModal component

- React Portal overlay with backdrop
- URL validation (http, https, mailto, tel, relative)
- ESC/backdrop click to close
- Enter key submits
- Auto-focus input on open
- Inline error feedback

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Integrate LinkModal in TextEditorControl

**Files:**
- Modify: `src/components/builder/right-panel/controls/TextEditorControl.tsx`

**Step 1: Add imports**

Add at top of file (after existing imports):

```typescript
import LinkModal from "../../modals/LinkModal";
```

**Step 2: Get modal state from context**

Update the `useBuilder()` destructuring (line 14) to include:

```typescript
const {
  selectedElRef,
  hasSelectedEl,
  layersRefreshKey,
  pushUndoSnapshot,
  markDirty,
  showLinkModal,      // new
  setShowLinkModal    // new
} = useBuilder();
```

**Step 3: Replace handleLink function**

Replace the current `handleLink` function (lines 61-76) with:

```typescript
function handleLink() {
  setShowLinkModal(true);
}

function handleInsertLink(url: string) {
  if (!editorRef.current) return;
  editorRef.current.focus();
  document.execCommand("createLink", false, url);
  syncToCanvas();
  setShowLinkModal(false);
}
```

**Step 4: Add LinkModal to JSX**

Add before the closing tag (after line 103, before `</div>`):

```typescript
      {/* Link Modal */}
      <LinkModal
        show={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        onInsert={handleInsertLink}
      />
```

**Step 5: Verify TypeScript compiles**

Run: `npm run build`
Expected: No TypeScript errors

**Step 6: Commit**

```bash
git add src/components/builder/right-panel/controls/TextEditorControl.tsx
git commit -m "feat(builder): replace window.prompt with LinkModal

- Use LinkModal component instead of window.prompt()
- Integrate with BuilderContext state
- Keep existing validation and execCommand flow

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add Viewport Selector to BuilderTopBar

**Files:**
- Modify: `src/components/builder/BuilderTopBar.tsx`

**Step 1: Add imports**

Add to imports (after existing lucide imports):

```typescript
import { ChevronDown, Check } from "lucide-react";
import { Menu } from "@headlessui/react";
```

**Step 2: Get viewport state from context**

Update the `useBuilder()` destructuring (line 16) to include:

```typescript
const {
  // ... existing fields ...
  viewportConfig,     // new
  setViewportConfig,  // new
} = useBuilder();
```

**Step 3: Add viewport presets constant**

Add after imports, before the component:

```typescript
const VIEWPORT_PRESETS = [
  { label: "Desktop", device: "desktop" as const, width: null, height: null },
  { label: "iPhone 13", device: "iphone-13" as const, width: 390, height: 844 },
  { label: "iPad", device: "ipad" as const, width: 768, height: 1024 },
  { label: "Custom", device: "custom" as const, width: 375, height: 812 },
];
```

**Step 4: Replace device switcher UI**

Replace the device switcher section (lines 97-121) with:

```typescript
        {/* Viewport selector */}
        <Menu as="div" className="relative">
          <Menu.Button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
            {VIEWPORT_PRESETS.find((p) => p.device === viewportConfig.device)?.label || "Desktop"}
            <ChevronDown className="w-3.5 h-3.5" />
          </Menu.Button>

          <Menu.Items className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-10 focus:outline-none">
            {VIEWPORT_PRESETS.map((preset) => (
              <Menu.Item key={preset.device}>
                {({ active }) => (
                  <button
                    onClick={() => setViewportConfig(preset)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm ${
                      active ? "bg-gray-100" : ""
                    }`}
                  >
                    <span className={viewportConfig.device === preset.device ? "font-medium text-gray-900" : "text-gray-700"}>
                      {preset.label}
                    </span>
                    {viewportConfig.device === preset.device && (
                      <Check className="w-4 h-4 text-indigo-600" />
                    )}
                  </button>
                )}
              </Menu.Item>
            ))}
          </Menu.Items>
        </Menu>
```

**Step 5: Remove viewMode state and setViewMode**

Remove these lines from destructuring and any references to `viewMode` and `setViewMode`.

**Step 6: Verify TypeScript compiles**

Run: `npm run build`
Expected: No TypeScript errors

**Step 7: Commit**

```bash
git add src/components/builder/BuilderTopBar.tsx
git commit -m "feat(builder): add viewport selector dropdown

- Replace Desktop/Mobile toggle with dropdown
- 4 presets: Desktop, iPhone 13, iPad, Custom
- Shows checkmark for selected device
- Integrates with BuilderContext viewportConfig

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update BuilderCanvas to Use Viewport Config

**Files:**
- Modify: `src/components/builder/BuilderCanvas.tsx`

**Step 1: Get viewport config from context**

Update the `useBuilder()` destructuring (line 7) to include:

```typescript
const {
  iframeRef,
  previewUrl,
  iframeKey,
  handleIframeLoad,
  viewportConfig,  // new
} = useBuilder();
```

**Step 2: Remove viewMode destructuring and references**

Remove `viewMode` from destructuring and all references.

**Step 3: Update iframe rendering logic**

Replace the return statement (lines 19-48) with:

```typescript
  const isFixedViewport = viewportConfig.device !== "desktop";
  const width = viewportConfig.width || 375;
  const height = viewportConfig.height || 812;

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-gray-100 overflow-hidden">
      <div
        className={`flex-1 overflow-auto ${
          isFixedViewport ? "flex justify-center items-start p-8" : ""
        }`}
      >
        {/*
          Security note: allow-scripts + allow-same-origin is required for the editor
          to access iframe contentDocument. This is safe because:
          1. iframe src is same-origin (/api/preview/)
          2. Content is user's own authenticated pages
          3. No external/untrusted content is loaded
        */}
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={previewUrl}
          className={
            isFixedViewport
              ? `border border-gray-300 rounded-lg shadow-lg bg-white shrink-0`
              : "w-full h-full border-0"
          }
          style={
            isFixedViewport
              ? { width: `${width}px`, height: `${height}px` }
              : undefined
          }
          sandbox="allow-scripts allow-same-origin"
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
```

**Step 4: Verify TypeScript compiles**

Run: `npm run build`
Expected: No TypeScript errors

**Step 5: Commit**

```bash
git add src/components/builder/BuilderCanvas.tsx
git commit -m "feat(builder): apply viewport dimensions to iframe

- Read viewportConfig from context
- Desktop: full width/height
- Other devices: fixed dimensions with centering
- Apply dimensions via inline styles

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Manual Testing

**No files to modify** — this is verification only.

**Step 1: Start dev server**

Run: `npm run dev`
Expected: Server starts on http://localhost:3000

**Step 2: Navigate to page builder**

1. Open http://localhost:3000
2. Log in with test credentials (if required)
3. Navigate to any page in the builder
4. Confirm page editor loads without errors

**Step 3: Test Link Modal**

1. Select text in the text editor
2. Click the Link button (🔗)
3. Verify modal appears with input focused
4. Enter valid URL: `https://example.com`
5. Click Insert
6. Verify link is created in editor
7. Click Link button again
8. Enter invalid URL: `javascript:alert('xss')`
9. Verify error message appears
10. Press ESC
11. Verify modal closes without inserting

**Step 4: Test Viewport Selector**

1. Click viewport dropdown (should show "Desktop")
2. Select "iPhone 13"
3. Verify iframe resizes to 390×844px with centered layout
4. Select "iPad"
5. Verify iframe resizes to 768×1024px
6. Select "Desktop"
7. Verify iframe goes full width/height
8. Make edit to page (change text)
9. Switch viewport again
10. Verify viewport persists and edit is preserved

**Step 5: Test Integration**

1. Switch to iPhone 13 viewport
2. Insert a link using Link Modal
3. Verify link works in all viewports
4. Make Undo (Ctrl+Z)
5. Verify undo works correctly
6. Switch viewport
7. Verify undo history is preserved

**Step 6: Browser testing**

1. Test in Chrome
2. Test in Firefox (if available)
3. Test in Safari (if on macOS)

Expected: All features work in all browsers

**Step 7: Final commit**

If any fixes were needed, commit them. Otherwise, proceed to next task.

---

## Task 7: Final Verification & Cleanup

**Files:**
- Verify: All modified files

**Step 1: Build for production**

Run: `npm run build`
Expected: Clean build with no errors or warnings

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No TypeScript errors

**Step 3: Check for console errors**

1. Open browser DevTools console
2. Navigate through builder
3. Use both features
4. Verify no console errors or warnings

**Step 4: Review changes**

Run: `git diff main`
Review all changes to ensure:
- No commented code left behind
- No debug console.logs
- No TODO comments
- Consistent code style

**Step 5: Final commit (if cleanup needed)**

```bash
git add .
git commit -m "chore(builder): cleanup and final verification

- Remove debug code
- Add missing error handling
- Final polish

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 6: Push to remote (if applicable)**

Run: `git push origin <branch-name>`

---

## Success Criteria Checklist

### Link Modal
- [ ] No more `window.prompt()` for link insertion
- [ ] Modal has proper UX (ESC/backdrop close, Enter to insert, focus trap)
- [ ] URL validation prevents XSS (javascript:, data: URLs blocked)
- [ ] Works seamlessly with existing `execCommand` flow
- [ ] Error messages display for invalid URLs
- [ ] Insert button disabled when URL invalid or empty

### Viewport Selector
- [ ] Can switch between Desktop, iPhone 13, iPad, Custom
- [ ] Iframe resizes correctly for each device
- [ ] No page reload when switching
- [ ] Desktop shows full width/height
- [ ] Other devices show fixed dimensions with centering
- [ ] Viewport persists during session

### Integration
- [ ] Link insertion works in all viewports
- [ ] Viewport changes don't affect link modal
- [ ] Undo/redo work with both features
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Clean production build

---

## Notes

- **No unit tests required** per design doc — manual testing only
- **No API changes** — all client-side state management
- **No database migrations** — state is session-scoped only
- **Uses existing dependencies** — headlessui already in project
- **Custom viewport dimensions** not implemented in v1 (can add later via inline inputs in menu)

## Rollback Plan

If issues arise:
1. Revert commits in reverse order (Task 7 → Task 1)
2. Each commit is atomic and can be reverted independently
3. No database changes to roll back
4. No API changes to coordinate

## Future Enhancements (Out of Scope)

- Custom dimension inputs in dropdown
- Save custom presets to localStorage
- Link editing (detect existing link, pre-fill URL)
- Link target (_blank, _self) option
- More device presets (Android devices)
- Device orientation toggle (portrait/landscape)
