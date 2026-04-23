# Quiz Page Builder Integration

**Status: Deferred - Follow-up**

## Goal

Embed the existing Page Builder (`src/components/builder/`) into `StepEditor` so users get
full rich design controls - 9 control categories (typography, spacing, color, layout, etc.),
AI-assisted editing, countdown timers, image-replace - for quiz step elements.

## Background

The Editor MVP (see `2026-04-23-quiz-funnel-builder-editor-mvp.md`, Task 5.3) shipped with
direct inline controls in `StepEditor.tsx` instead. That approach is simpler but only supports
plain-text editing, basic image URL inputs, and raw HTML textarea for the `custom_html` kind.

The inline controls are a good MVP. This plan replaces them with the full Page Builder UX once
the rest of the quiz runtime is stable.

## Approach - investigate one of two strategies first

### Option A - Props on BuilderShell (lower risk)
Add optional `initialHtml?: string` and `onHtmlChange?: (html: string) => void` props to
`BuilderShell`. When a quiz step is active, pass the serialized subEls HTML in and listen for
changes. Deserialize back to `SubEl[]` via `htmlToSubEls` in `src/lib/quiz-subel-html.ts`.

### Option B - Extract InlineBuilder
Pull out a standalone `InlineBuilder` component from `BuilderShell`/`BuilderContext` that
can be dropped into any parent without the full shell chrome (sidebar, toolbar, page-level
settings). Mount it inside `StepEditor` with `key={selectedNodeId}` to remount on step change.

Read `src/components/builder/BuilderShell.tsx` and `BuilderContext.tsx` before picking a
strategy - the right choice depends on how tightly the shell chrome is coupled to the canvas.

## Serializer

`src/lib/quiz-subel-html.ts` handles the round-trip (`subElsToHtml` / `htmlToSubEls`). The
`custom_html` fallback catches any builder output that cannot be parsed back to a known kind.
Do NOT delete this file - it is also used by the Runtime plan for publishing.

## Task list

1. Read `BuilderShell.tsx` + `BuilderContext.tsx` and sub-components. Decide Option A vs B.
   Document the decision in this file before coding.
2. Implement the chosen strategy. Keep changes isolated to `builder/` and `quiz-builder/`.
3. Replace the inline editors in `StepEditor.tsx` with `<InlineBuilder>` (or updated
   `BuilderShell`), keyed by `selectedNodeId` so state resets on step change.
4. Debounce `onHtmlChange` at 300 ms before calling `setData` to avoid thrashing autosave.
5. Smoke-test: countdown timer, image-replace, and AI edit still work inside a quiz step.
6. Run `npx tsc --noEmit`, `npm run test`, and `npm run build` - all must be clean.

## Notes

- The existing `quiz-subel-html.ts` tests cover the serializer - keep them passing.
- `custom_html` subEls store raw HTML; the editor renders it only via `innerHTML` inside the
  builder iframe/canvas (safe context), never injected into the React tree directly.
- Countdown and image-replace depend on DOM hooks inside the builder canvas - verify they still
  fire correctly when mounted inside the StepEditor panel (different scroll/size context).
