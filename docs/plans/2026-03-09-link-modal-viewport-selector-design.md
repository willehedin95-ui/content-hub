# Link Modal & Viewport Selector Design

**Date:** 2026-03-09
**Features:** Link Modal, Viewport Selector
**Scope:** Page builder UX improvements

## Overview

Add two quality-of-life improvements to the page builder:
1. **Link Modal** — Replace `window.prompt()` with proper modal for link insertion
2. **Viewport Selector** — Replace Desktop/Mobile toggle with dropdown supporting 4 device presets

Both features are client-side only, require no new API routes, and integrate with existing BuilderContext state management.

## Architecture

### Component Structure
```
src/components/builder/
├── modals/
│   └── LinkModal.tsx          (new)
├── BuilderTopBar.tsx          (modify - add viewport dropdown)
├── BuilderCanvas.tsx          (modify - apply viewport dimensions)
├── BuilderContext.tsx         (modify - add viewport state + link modal state)
└── right-panel/controls/
    └── TextEditorControl.tsx  (modify - use LinkModal instead of prompt)
```

### State Flow
- **BuilderContext** stores:
  - `showLinkModal: boolean`
  - `viewportConfig: { device: string, width: number | null, height: number | null }`
- LinkModal receives callback from TextEditorControl to insert link
- Viewport dropdown in TopBar updates Context → Canvas reads dimensions → iframe resizes
- No new API routes needed (client-side only)

### Integration Points
- LinkModal integrates with existing `document.execCommand('createLink')` flow
- Viewport selector replaces existing device toggle (BuilderTopBar lines 98-121)
- BuilderCanvas reads viewport dimensions from Context instead of hardcoded 375×812

## Link Modal Component

### Interface
```typescript
interface LinkModalProps {
  show: boolean;
  onClose: () => void;
  onInsert: (url: string) => void;
  initialUrl?: string; // for editing existing links
}
```

### UI Structure
- Fixed overlay (`fixed inset-0 z-50`) with backdrop
- Centered modal card (400px wide)
- Single text input for URL
- Two buttons: "Cancel" (gray) and "Insert" (indigo, primary)
- ESC key closes modal
- Enter key in input triggers insert
- Focus trap (auto-focus input on open, tab cycles between input and buttons)

### URL Validation
- Reuses existing validation from TextEditorControl (lines 65-73)
- Accepts: `http://`, `https://`, `mailto:`, `tel:`, relative paths
- Shows inline error message below input if invalid
- Insert button disabled until valid URL entered

### Behavior
- Clicking backdrop closes modal (same as ESC)
- After successful insert, modal closes automatically
- If user cancels (ESC/Cancel button), no action taken
- Modal renders at root level using React Portal to `document.body`

## Viewport Selector

### Preset Configurations
```typescript
const VIEWPORT_PRESETS = [
  { label: "Desktop", device: "desktop", width: null, height: null }, // full width/height
  { label: "iPhone 13", device: "iphone-13", width: 390, height: 844 },
  { label: "iPad", device: "ipad", width: 768, height: 1024 },
  { label: "Custom", device: "custom", width: 375, height: 812 }, // default, user editable
];
```

### UI Changes in BuilderTopBar
- Replace toggle buttons (lines 98-121) with single dropdown button
- Shows current device label + chevron icon
- Dropdown menu (headlessui `<Menu>`) appears below button on click
- 4 menu items (Desktop, iPhone 13, iPad, Custom)
- Custom option shows inline inputs for width × height in dropdown
- Selected item has checkmark icon

### Behavior
- **Desktop:** iframe uses `w-full h-full`, no centering wrapper
- **iPhone 13/iPad/Custom:** iframe gets fixed dimensions, centered in gray background (like current mobile view)
- Custom dimensions are stored in Context and persist during session
- Switching devices immediately updates iframe dimensions
- No page reload needed (just className change on iframe)

### State in BuilderContext
```typescript
const [viewportConfig, setViewportConfig] = useState({
  device: "desktop",
  width: null,
  height: null
});
```

## Data Flow

### Link Modal Flow
1. User clicks Link button in TextEditorControl → `setShowLinkModal(true)` in Context
2. LinkModal renders with Portal, auto-focuses input
3. User types URL, validation runs on change (inline feedback)
4. User clicks Insert → callback passed to LinkModal executes `document.execCommand('createLink', url)`
5. Modal closes, focus returns to editor

### Viewport Selector Flow
1. User clicks device dropdown in BuilderTopBar → menu opens
2. User selects device → `setViewportConfig({ device, width, height })` in Context
3. BuilderCanvas reads `viewportConfig` from Context
4. Iframe className changes based on device (no reload)
5. Custom dimensions stored in Context, persist for session

## Error Handling

### Link Modal
- **Invalid URL:** Show red border + error message below input, disable Insert button
- **Empty URL:** Disable Insert button (not an error state)
- **Portal mount failure:** Graceful fallback (modal doesn't render, existing `prompt()` keeps working)
- **No text selection:** `document.execCommand` creates link for current word or does nothing (standard browser behavior)

### Viewport Selector
- **Custom viewport validation:** Min 200px, max 4000px for width/height
- **Invalid dimensions:** Clamp to valid range, show warning
- **State persistence:** Viewport config stored in Context only (session-scoped)

## Testing Strategy

### Manual Testing (v1)
No unit tests required initially. Test cases:

**Link Modal:**
- Valid URLs (http, https, mailto, tel, relative)
- Invalid URLs (javascript:, data:, etc.)
- ESC key closes modal
- Backdrop click closes modal
- Enter key inserts link
- Cancel button closes without action
- Focus trap works (tab cycles through input and buttons)

**Viewport Selector:**
- Switch between all 4 devices (Desktop, iPhone 13, iPad, Custom)
- Custom dimensions save and persist
- Iframe resizes correctly for each device
- No page reload when switching
- Viewport persists after page edits

**Integration:**
- Link insertion works from modal
- Links created have correct href
- Viewport changes don't affect link insertion
- Undo/redo still work after both features used

## Implementation Approach

**Approach A: Dedicated Components with Context Integration** (Selected)

### Why This Approach
- Follows existing builder patterns (BuilderContext for state, dedicated components)
- Minimal disruption to current architecture
- Easy to test and maintain
- Link modal is reusable if needed elsewhere
- Viewport state naturally lives in Context with other builder state

### Trade-offs
- Adds new files (but keeps concerns separated)
- Slightly more code than inline solutions
- Worth it for maintainability and reusability

## File Changes Summary

### New Files
- `src/components/builder/modals/LinkModal.tsx` (~150 lines)

### Modified Files
- `src/components/builder/BuilderContext.tsx` (add 2 state variables, update context type)
- `src/components/builder/BuilderTopBar.tsx` (replace toggle with dropdown, ~50 lines changed)
- `src/components/builder/BuilderCanvas.tsx` (read viewport from context, apply dimensions)
- `src/components/builder/right-panel/controls/TextEditorControl.tsx` (replace `window.prompt()` with modal)

### No Changes Required
- No API routes
- No database schema changes
- No external dependencies (uses existing headlessui)

## Success Criteria

### Link Modal
- ✅ No more `window.prompt()` for link insertion
- ✅ Modal has proper UX (ESC/backdrop close, Enter to insert, focus trap)
- ✅ URL validation prevents XSS
- ✅ Works seamlessly with existing `execCommand` flow

### Viewport Selector
- ✅ Can switch between Desktop, iPhone 13, iPad, Custom
- ✅ Custom dimensions persist during session
- ✅ Iframe resizes correctly without reload
- ✅ More intuitive than current toggle

## Future Enhancements (Out of Scope)

- Rotate device orientation (portrait/landscape)
- Save custom viewport presets
- Link editing (detect existing link, pre-fill URL)
- Link target (_blank, _self) option
- More device presets (Android devices, tablets)
- Zoom controls for viewport
