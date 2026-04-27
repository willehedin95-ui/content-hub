# Quiz Builder 2.0 - Authoring Power

**Date:** 2026-04-24
**Status:** Approved (ready for plan)
**Branch:** `feat/quiz-builder-editor`

## Goal

Make the quiz editor capable of authoring every subEl kind we ship at runtime, and make the editor + preview visible side-by-side so you see what you're building as you build it.

Today the runtime renders chips, range sliders, dropdowns, text inputs, testimonial sliders, and richer custom_html, but the editor only has UI for the original subEls (title, text, question, image, custom_html, loading). Authoring the new kinds requires direct JSON edits or DB SQL patches. Editor and preview are also separate routes - context switching between tabs slows iteration.

## Non-goals

- AI-generated custom_html blocks (was option A in brainstorm; deferred)
- Visual builder for custom_html (drag-elements-on-canvas; separate project)
- Workspace-level brand kits (was option C; can come after)
- Conversion analytics dashboard, smart routing, multi-market batching - all out of scope

## Scope: two phases

### Phase B - Editor UI for new subEl kinds

Three new editor components plus extensions to existing ones:

- `RangeSliderEditor`: variable name, unit, min, max, step, initial value
- `TextInputEditor`: variable name, input type (text / number / date), placeholder, optional min/max for number type
- `TestimonialSliderEditor`: list of items with name, avatar URL, rating (0-5), text body, plus add/remove
- `QuestionEditor` extensions: layout dropdown (list / cards / image_cards / chips / dropdown), variable field, searchable toggle and dropdownPlaceholder when layout is dropdown
- `TitleEditor` + `TextEditor`: small "Tip: use {varName} to insert user answers" hint under the textarea
- `ElementPalette`: three new buttons (Range, Text input, Testimonials)
- `quiz-graph.ts`: default-shape map per kind so addSubEl produces a usable element on first add

Plus a reusable `<ImagePicker>` component used in two places:

- `ImageEditor` (replaces today's plain URL field)
- `QuestionEditor` per-option, only when `layout === "image_cards"`

The picker has three sources: file upload, product bank picker (lists `product_images` for the active workspace), and URL paste. Backed by a new `POST /api/quiz/[id]/upload-image` endpoint that stores into `translated-images/quiz-assets/{quizId}/uploaded/{uuid}.{ext}` matching the existing rehosting convention.

For options that arrived from a video swipe carrying `imageDescription`, the picker shows the description as a hint above the upload control so the author knows what illustration to drop in.

### Phase D - Split-view editor

Add a fourth pane to the right of `StepEditor` showing a live preview iframe inside a phone-frame chrome.

- Toggle in `QuizTopBar` ("Show preview" button), state synced to URL `?preview=1` and `localStorage["quiz-editor.preview"]`. URL wins on conflict so split-view links are shareable.
- Iframe `src` is the existing `/quizzes/[id]/preview` route. No new server endpoints.
- Reload trigger: subscribe to `QuizContext.saveState`. When it transitions `"saving" -> "saved"`, set `iframe.src = ${preview}?ts=${Date.now()}` so the HTML rerenders against fresh DB data without forcing the runtime bundle to redownload.
- Phone-frame chrome: 380x780 frame containing a 366x720 iframe. Rounded corners, subtle gray bezel. "Refresh" button above as manual fallback. "Open in new tab" link for full-size testing.
- Mobile breakpoint: hide split-view below 1024px viewport. Toggle button is disabled with tooltip "Available on wider screens".
- When split-view turns off, the iframe is unmounted (no hidden iframe sitting around).
- When split-view is on, `StepsTree` collapses to icon-only width (60px) so the layout fits on 1280-wide laptops.

## Architecture

### Files affected

- `src/components/quiz-builder/StepEditor.tsx` - +3 editor components, extend QuestionEditor and Title/TextEditor, +ImagePicker integration. Grows from 464 lines to roughly 600.
- `src/components/quiz-builder/ElementPalette.tsx` - +3 buttons in PALETTE_ITEMS array.
- `src/components/quiz-builder/ImagePicker.tsx` - NEW. ~80 lines.
- `src/components/quiz-builder/QuizShell.tsx` - split-view 4-column layout + collapsible steps-tree.
- `src/components/quiz-builder/QuizTopBar.tsx` - "Show preview" toggle button.
- `src/components/quiz-builder/QuizContext.tsx` - expose saveState change events for iframe-reload subscription.
- `src/lib/quiz-graph.ts` - SUBEL_DEFAULTS map keyed by kind.
- `src/app/api/quiz/[id]/upload-image/route.ts` - NEW. ~30 lines.

### Data model

No DB schema changes. The new subEl shapes already exist in `src/types/quiz.ts` and the runtime types from a previous commit. We're just adding UI to author them.

### Default values (in `quiz-graph.ts`)

```ts
const SUBEL_DEFAULTS = {
  title:              { kind: "title", text: "", isRichText: true, contentFormat: "html" },
  text:               { kind: "text",  text: "", isRichText: true, contentFormat: "html" },
  question:           { kind: "question", kindOf: "single", layout: "list", options: [] },
  image:              { kind: "image", url: "", alt: "" },
  custom_html:        { kind: "custom_html", html: "" },
  loading:            { kind: "loading", text: "Loading...", style: "dots", seconds: 3 },
  range_slider:       { kind: "range_slider", variable: "score", min: 0, max: 100, step: 1, initial: 50, unit: "" },
  text_input:         { kind: "text_input", variable: "answer", inputType: "text", placeholder: "" },
  testimonial_slider: { kind: "testimonial_slider", items: [{ name: "Customer", text: "...", rating: 5 }] },
};
```

## UI sketches

### `RangeSliderEditor`

```
- Range slider --------------------
Variable name:   [collagenScore  ]
Unit:            [%              ]
Min:  [0      ]  Max:  [100    ]
Step: [1      ]  Initial: [50  ]
                                 [Delete]
```

### `TextInputEditor`

```
- Text input ----------------------
Variable name:   [petName        ]
Input type:      ( Text )( Number )( Date )
Placeholder:     [Your dog's name]
Min/Max (numbers): [0    ] [120 ]
                                 [Delete]
```

### `TestimonialSliderEditor`

```
- Testimonial slider --------------
Items:
  +- Sarah M.            [x]      |
  | Avatar: [https://... ]         |
  | Rating: [5 stars   v]          |
  | Text: +-----------------+      |
  |       | "Best collagen  |      |
  |       |  I've tried..." |      |
  |       +-----------------+      |
  +-------------------------------+
  +- Mike T.             [x]      |
  | ...                            |
  +-------------------------------+
[+ Add testimonial]            [Delete]
```

### `QuestionEditor` extensions

Today's editor stays; we add three controls above the existing options list:

```
- Question ------------------------
( Single )( Multi )
Layout: [ List               v]   <- NEW
Variable: [age              ]      <- NEW

(when layout === "dropdown":)
  [_] Searchable                   <- NEW
  Placeholder: [Pick an option]    <- NEW

Options:
  [... existing option editor ...]
  When layout === "image_cards", each option row gets:
    [thumbnail] [label    ] [x]
    `-> click thumbnail -> ImagePicker modal
```

### `ImagePicker` component

Used inline (not modal) inside ImageEditor and per-option:

```
+----------------------+
| [thumbnail or empty] |
| Drop or click upload |
+----------------------+
[Upload] [Product bank] [URL...]
                            [Clear]
```

Click "Product bank" opens a modal listing `product_images` from the workspace, click an image to set it.

### Split-view layout

```
+------+--------------+--------------+--------------------+
| Tree | Logic Canvas | StepEditor   |  Phone preview     |
| 60px | flex-1       | 320px        |  380px             |
+------+--------------+--------------+--------------------+
```

`Tree` collapses from 220px to 60px (icons only) when split-view is on.

## Risks and mitigations

- **R1 Iframe flicker on rapid edits**: save is already debounced 800ms; iframe reload triggers only on saveState transition to "saved", so reload happens once per quiet period.
- **R2 Image-upload path collisions**: reuse `translated-images/quiz-assets/{quizId}/uploaded/...` path convention from existing rehosting code.
- **R3 TestimonialSliderEditor complexity**: build the simplest viable version (per-item form fields, no drag reordering, no fancy avatar upload). Polish in a follow-up.
- **R4 Product bank coupling**: `quizzes` table has no `product_id` column today. For Fas B, the product-bank picker lists ALL `product_images` for the workspace. Adding an explicit quiz->product link is a follow-up.
- **R5 Width on small laptops**: collapsing the steps-tree to 60px when split-view is active makes it fit on 1280px-wide laptops.

## Effort

| Phase B item | Hours |
|---|---|
| `quiz-graph.ts` defaults | 0.5 |
| `RangeSliderEditor` | 0.5 |
| `TextInputEditor` | 0.5 |
| `TestimonialSliderEditor` | 1.0 |
| `QuestionEditor` extensions | 0.5 |
| Title/TextEditor interpolation hint | 0.2 |
| `ImagePicker` component | 1.0 |
| Image-upload API-route | 0.5 |
| `ImageEditor` rewires to ImagePicker | 0.3 |
| `QuestionEditor` per-option image picker | 0.5 |
| `ElementPalette` 3 new buttons | 0.2 |
| **Phase B subtotal** | **5.5h** |
| Split-view layout | 1.0 |
| Topbar toggle + URL/localStorage sync | 0.5 |
| Phone-frame chrome | 0.5 |
| Iframe reload on saveState | 0.5 |
| Manual refresh button | 0.2 |
| Mobile breakpoint hide | 0.3 |
| **Phase D subtotal** | **3h** |
| **Total** | **~8.5h** |

## Test plan

- Unit tests for `SUBEL_DEFAULTS` lookups in `quiz-graph.ts`.
- Manual happy-path walkthrough on the running dev server: create empty quiz, add each new subEl from palette, edit fields, save, see live preview in split-view update.
- Existing 223 tests must still pass; `npx tsc --noEmit` clean.

## Notes for the planner

- `searchable` and `dropdownPlaceholder` on `question` are added on-demand (only when layout switches to `dropdown`), not part of `SUBEL_DEFAULTS`.
- `QuizContext` already exposes `saveState` via context value, but consumers need a `useEffect` subscribed to its transitions to trigger iframe reload. Sequence the small `useEffect` hook in the split-view component before wiring iframe reload.
- The phone-frame iframe always points at `/quizzes/[id]/preview`, which renders the whole quiz starting from the first step. Navigating between steps in the editor does NOT reposition the preview; the user can either start the preview over manually inside the iframe or use the manual refresh button. (Tracking the editor's selected step in the preview is out of scope for Fas D.)
- Product-bank picker modal: workspaces can have many `product_images`. For Fas B keep it simple - paginated grid with 20 per page, simple text-search by alt text. No sophisticated filtering.
- Test plan addition: smoke-test the upload API route (happy-path multipart upload, unsupported file type rejection, oversize rejection). `ImagePicker` happy-path can be manual unless we set up component tests later.
- Effort table omits ~0.5h for the `QuizContext` saveState subscription hook; budget accordingly.

## Out of scope

- AI custom_html generator (deferred to a later phase)
- Workspace brand-kit
- Visual block library / templates
- Drag-reorder for items inside testimonial slider (manual via add/remove only)
- Drag-reorder for option-level image_cards (out)
- Granular pixel events
- Conversion analytics
