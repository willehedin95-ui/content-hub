# Quiz Builder 2.0 - Authoring Power Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the quiz editor capable of authoring every subEl kind we render at runtime (chips/range/text_input/dropdown/testimonial), add a reusable image picker, and surface a live preview alongside the editor.

**Architecture:** Two phases delivered in three chunks. Phase B extends the existing per-subEl-kind editor pattern in `StepEditor.tsx` plus the flat palette in `ElementPalette.tsx`, and adds a shared `<ImagePicker>` component backed by a new upload endpoint. Phase D reuses the existing `/quizzes/[id]/preview` route as an iframe inside a phone-frame chrome, mounted side-by-side with the editor when the user toggles split-view.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS (light theme: `bg-gray-50` base, `bg-white` cards, `border-gray-200` borders, `indigo-600` primary), Supabase Storage (`translated-images` bucket, path convention `quiz-assets/{quizId}/...`), `lucide-react` icons, vitest, the existing autosave-debounced `QuizContext`.

**Spec:** `docs/superpowers/specs/2026-04-24-quiz-builder-2.0-authoring.md`

**Pre-flight assumptions** (verify once at the start):
- Worktree is `.worktrees/quiz-builder-editor` on branch `feat/quiz-builder-editor`.
- Dev server starts with `unset ANTHROPIC_API_KEY && npm run dev`.
- Run tests with `npm test -- --run`. Run typecheck with `npx tsc --noEmit`. Both must pass before commit.
- `git add` only specific files. NEVER `git add -A` or `git add .`.
- After significant work commit, but DO NOT push to `main` without explicit user OK.

---

## File Structure

| File | Verb | Purpose |
|---|---|---|
| `src/lib/quiz-graph.ts` | modify | Extend `AddSubElInput` union and `addSubEl` switch with `range_slider`, `text_input`, `testimonial_slider`. Existing pattern; ~30 LOC added. |
| `src/lib/quiz-graph.test.ts` | modify | Tests for the new `addSubEl` cases. |
| `src/components/quiz-builder/ElementPalette.tsx` | modify | Add 3 PaletteItem entries (icons: `SlidersHorizontal`, `TextCursorInput`, `MessageSquareQuote`). |
| `src/components/quiz-builder/StepEditor.tsx` | modify | New editor components (`RangeSliderEditor`, `TextInputEditor`, `TestimonialSliderEditor`), extensions to `QuestionEditor`, interpolation hint on Title/Text, switch wiring. Grows ~150 LOC. |
| `src/components/quiz-builder/ImagePicker.tsx` | **create** | Shared component used by `ImageEditor` and per-option image_cards. ~120 LOC. |
| `src/app/api/quiz/[id]/upload-image/route.ts` | **create** | `POST` multipart endpoint, writes to `translated-images/quiz-assets/{quizId}/uploaded/{uuid}.{ext}`. ~50 LOC. |
| `src/components/quiz-builder/QuizContext.tsx` | modify | Expose a `useSaveStateChange(callback)` helper that fires when saveState transitions to `"saved"`. |
| `src/components/quiz-builder/QuizShell.tsx` | modify | 4-column layout when split-view active; collapse `StepsTree` to icon-only width. |
| `src/components/quiz-builder/QuizTopBar.tsx` | modify | "Show preview" toggle button (disabled below 1024px). |
| `src/components/quiz-builder/PreviewPane.tsx` | **create** | Phone-frame chrome + iframe + manual refresh. ~80 LOC. |
| `src/components/quiz-builder/StepsTree.tsx` | modify | Collapsed icon-only mode prop. |

**Test files affected:**
- `src/lib/quiz-graph.test.ts` (existing) - new test cases.
- (No new test files; ImagePicker and PreviewPane are manually tested.)

**No DB schema changes. No runtime-bundle changes (the components already render).**

---

## Chunk 1: Phase B foundation + simple editors

Adds the new defaults to `addSubEl`, three palette buttons, and the simpler editor components (RangeSlider, TextInput, Title/Text interpolation hint). End state: you can add a range slider or text input from the palette and edit its fields, and see the existing tests still pass.

### Task 1: Extend `AddSubElInput` and `addSubEl` for new kinds

**Files:**
- Modify: `src/lib/quiz-graph.ts` (lines 144-150 union, 438-477 switch)
- Test: `src/lib/quiz-graph.test.ts`

- [ ] **Step 1: Write the failing test first**

Add to `src/lib/quiz-graph.test.ts` (place after the existing `addSubEl` tests for question/loading; search the file for `describe("addSubEl"` and add three new `it` blocks inside that describe):

```ts
it("addSubEl creates a range_slider with sensible defaults", () => {
  const start = makeQuizWithEmptyStep();
  const stepId = Object.keys(start.nodes).find(
    (k) => start.nodes[k].kind === "step",
  )!;
  const updated = addSubEl(start, stepId, { kind: "range_slider" });
  const step = updated.nodes[stepId] as Extract<QuizNode, { kind: "step" }>;
  const el = step.subEls[step.subEls.length - 1];
  expect(el.kind).toBe("range_slider");
  if (el.kind !== "range_slider") return;
  expect(el.variable).toBe("score");
  expect(el.min).toBe(0);
  expect(el.max).toBe(100);
  expect(el.step).toBe(1);
  expect(el.initial).toBe(50);
  expect(el.unit).toBe("");
});

it("addSubEl creates a text_input with sensible defaults", () => {
  const start = makeQuizWithEmptyStep();
  const stepId = Object.keys(start.nodes).find(
    (k) => start.nodes[k].kind === "step",
  )!;
  const updated = addSubEl(start, stepId, { kind: "text_input" });
  const step = updated.nodes[stepId] as Extract<QuizNode, { kind: "step" }>;
  const el = step.subEls[step.subEls.length - 1];
  expect(el.kind).toBe("text_input");
  if (el.kind !== "text_input") return;
  expect(el.variable).toBe("answer");
  expect(el.inputType).toBe("text");
  expect(el.placeholder).toBe("");
});

it("addSubEl creates a testimonial_slider with one starter item", () => {
  const start = makeQuizWithEmptyStep();
  const stepId = Object.keys(start.nodes).find(
    (k) => start.nodes[k].kind === "step",
  )!;
  const updated = addSubEl(start, stepId, { kind: "testimonial_slider" });
  const step = updated.nodes[stepId] as Extract<QuizNode, { kind: "step" }>;
  const el = step.subEls[step.subEls.length - 1];
  expect(el.kind).toBe("testimonial_slider");
  if (el.kind !== "testimonial_slider") return;
  expect(el.items).toHaveLength(1);
  expect(el.items[0].name).toBe("Customer");
  expect(el.items[0].rating).toBe(5);
});
```

If the test file does not already have a `makeQuizWithEmptyStep()` helper, look for whatever fixture-builder it uses (search for `addSubEl` occurrences). Use the existing pattern; do not invent a new fixture style.

- [ ] **Step 2: Run tests to confirm they fail**

```
cd .worktrees/quiz-builder-editor
npm test -- --run src/lib/quiz-graph.test.ts
```

Expected: 3 new failures with TypeScript errors saying `range_slider` / `text_input` / `testimonial_slider` are not assignable to `AddSubElInput.kind`.

- [ ] **Step 3: Extend the union and switch**

In `src/lib/quiz-graph.ts` lines 144-150, add to the `AddSubElInput` union:

```ts
type AddSubElInput =
  | { kind: "title"; text?: string }
  | { kind: "text"; text?: string }
  | { kind: "question"; kindOf?: "single" | "multi"; layout?: "list" | "cards" | "image_cards" | "chips" | "dropdown" }
  | { kind: "image"; url?: string; alt?: string }
  | { kind: "custom_html"; html?: string }
  | { kind: "loading"; text?: string; seconds?: number }
  | { kind: "range_slider"; variable?: string; min?: number; max?: number }
  | { kind: "text_input"; variable?: string; inputType?: "text" | "number" | "date" }
  | { kind: "testimonial_slider" };
```

Then in the `addSubEl` switch (around line 470, after the existing `loading` case), add three new cases before the closing brace:

```ts
    case "range_slider":
      el = {
        id,
        kind: "range_slider",
        variable: input.variable ?? "score",
        min: input.min ?? 0,
        max: input.max ?? 100,
        step: 1,
        initial: 50,
        unit: "",
      };
      break;
    case "text_input":
      el = {
        id,
        kind: "text_input",
        variable: input.variable ?? "answer",
        inputType: input.inputType ?? "text",
        placeholder: "",
      };
      break;
    case "testimonial_slider":
      el = {
        id,
        kind: "testimonial_slider",
        items: [
          { name: "Customer", text: "Best product I've ever tried.", rating: 5 },
        ],
      };
      break;
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npm test -- --run src/lib/quiz-graph.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```
git add src/lib/quiz-graph.ts src/lib/quiz-graph.test.ts
git commit -m "feat(quiz-graph): addSubEl supports range_slider/text_input/testimonial_slider"
```

---

### Task 2: Add 3 palette buttons

**Files:**
- Modify: `src/components/quiz-builder/ElementPalette.tsx`

- [ ] **Step 1: Update PaletteItem.kind union and PALETTE_ITEMS**

Replace lines 1-19 of `ElementPalette.tsx`:

```tsx
"use client";
import {
  Type, AlignLeft, HelpCircle, Image, Code, Loader,
  SlidersHorizontal, TextCursorInput, MessageSquareQuote,
} from "lucide-react";
import { useQuiz } from "./QuizContext";
import { addSubEl } from "@/lib/quiz-graph";

type PaletteItem = {
  kind:
    | "title" | "text" | "question" | "image" | "custom_html" | "loading"
    | "range_slider" | "text_input" | "testimonial_slider";
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
};

const PALETTE_ITEMS: PaletteItem[] = [
  { kind: "title", label: "Title", Icon: Type },
  { kind: "text", label: "Text", Icon: AlignLeft },
  { kind: "question", label: "Question", Icon: HelpCircle },
  { kind: "image", label: "Image", Icon: Image },
  { kind: "custom_html", label: "Custom HTML", Icon: Code },
  { kind: "loading", label: "Loading", Icon: Loader },
  { kind: "range_slider", label: "Range", Icon: SlidersHorizontal },
  { kind: "text_input", label: "Input", Icon: TextCursorInput },
  { kind: "testimonial_slider", label: "Reviews", Icon: MessageSquareQuote },
];
```

- [ ] **Step 2: Verify the grid still looks right**

The grid is `grid-cols-3`. With 9 items it becomes 3x3, no layout changes needed.

- [ ] **Step 3: Run typecheck and tests**

```
npx tsc --noEmit
npm test -- --run
```

Expected: clean.

- [ ] **Step 4: Manual smoke check** (dev server already running on :3000)

Visit `/quizzes/[any-id]/edit`. Click any step. The palette should show 9 buttons in a 3x3 grid. Click "Range" - a new `range_slider` subEl appears in the StepEditor as a placeholder card (no editor yet, that's Task 3).

- [ ] **Step 5: Commit**

```
git add src/components/quiz-builder/ElementPalette.tsx
git commit -m "feat(quiz-builder): add range / text-input / testimonials to element palette"
```

---

### Task 3: `RangeSliderEditor` component + switch wiring

**Files:**
- Modify: `src/components/quiz-builder/StepEditor.tsx`

- [ ] **Step 1: Add the RangeSliderEditor function**

Insert into `StepEditor.tsx` after the existing `LoadingEditor` (around line 380, before the switch). Use the existing `EditorProps`, `inputBase`, `labelBase`, and `DeleteElButton` patterns from the file:

```tsx
function RangeSliderEditor({ el, stepId }: EditorProps) {
  if (el.kind !== "range_slider") return null;
  const { setData } = useQuiz();
  const patch = (p: Partial<Extract<SubEl, { kind: "range_slider" }>>) =>
    setData((prev) => updateSubEl(prev, stepId, el.id, p));
  return (
    <div className="mb-3 p-3 border border-gray-200 rounded-md bg-white">
      <span className={labelBase}>Range slider</span>
      <label className="block text-xs text-gray-500 mt-2">Variable</label>
      <input
        className={inputBase}
        value={el.variable}
        placeholder="score"
        onChange={(e) => patch({ variable: e.target.value })}
      />
      <label className="block text-xs text-gray-500 mt-2">Unit (optional)</label>
      <input
        className={inputBase}
        value={el.unit ?? ""}
        placeholder="%, kg, hours..."
        onChange={(e) => patch({ unit: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div>
          <label className="block text-xs text-gray-500">Min</label>
          <input type="number" className={inputBase} value={el.min}
            onChange={(e) => patch({ min: Number(e.target.value) })} />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Max</label>
          <input type="number" className={inputBase} value={el.max}
            onChange={(e) => patch({ max: Number(e.target.value) })} />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Step</label>
          <input type="number" className={inputBase} value={el.step ?? 1}
            onChange={(e) => patch({ step: Number(e.target.value) })} />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Initial</label>
          <input type="number" className={inputBase} value={el.initial ?? Math.round((el.min + el.max) / 2)}
            onChange={(e) => patch({ initial: Number(e.target.value) })} />
        </div>
      </div>
      <DeleteElButton onClick={() => setData((prev) => removeSubEl(prev, stepId, el.id))} />
    </div>
  );
}
```

If `SubEl` is not already imported into the file, add it to the existing `@/types/quiz` import. If `updateSubEl` and `removeSubEl` aren't already imported, add them to the `@/lib/quiz-graph` import.

- [ ] **Step 2: Wire the switch**

Around line 384 in `StepEditor.tsx`, find the `switch (el.kind)` for the editor components and add:

```tsx
case "range_slider": return <RangeSliderEditor el={el} stepId={stepId} />;
```

- [ ] **Step 3: Run typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Manual smoke check**

Add a Range from the palette. The editor sidebar shows the variable / unit / min / max / step / initial fields. Type "collagenScore" into Variable; type "%" into Unit; change Max to 80. Switch to preview - the slider's bounds should reflect the new max.

- [ ] **Step 5: Commit**

```
git add src/components/quiz-builder/StepEditor.tsx
git commit -m "feat(quiz-builder): RangeSliderEditor with variable / unit / min / max / step / initial"
```

---

### Task 4: `TextInputEditor` component + switch wiring

**Files:**
- Modify: `src/components/quiz-builder/StepEditor.tsx`

- [ ] **Step 1: Add the TextInputEditor function**

Insert after `RangeSliderEditor`:

```tsx
function TextInputEditor({ el, stepId }: EditorProps) {
  if (el.kind !== "text_input") return null;
  const { setData } = useQuiz();
  const patch = (p: Partial<Extract<SubEl, { kind: "text_input" }>>) =>
    setData((prev) => updateSubEl(prev, stepId, el.id, p));
  return (
    <div className="mb-3 p-3 border border-gray-200 rounded-md bg-white">
      <span className={labelBase}>Text input</span>
      <label className="block text-xs text-gray-500 mt-2">Variable</label>
      <input
        className={inputBase}
        value={el.variable}
        placeholder="petName"
        onChange={(e) => patch({ variable: e.target.value })}
      />
      <label className="block text-xs text-gray-500 mt-2">Input type</label>
      <div className="flex gap-2 mt-1">
        {(["text", "number", "date"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => patch({ inputType: t })}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              (el.inputType ?? "text") === t
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <label className="block text-xs text-gray-500 mt-2">Placeholder</label>
      <input
        className={inputBase}
        value={el.placeholder ?? ""}
        placeholder="Type your answer..."
        onChange={(e) => patch({ placeholder: e.target.value })}
      />
      {el.inputType === "number" && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="block text-xs text-gray-500">Min</label>
            <input type="number" className={inputBase} value={el.min ?? ""}
              onChange={(e) => patch({ min: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Max</label>
            <input type="number" className={inputBase} value={el.max ?? ""}
              onChange={(e) => patch({ max: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </div>
        </div>
      )}
      <DeleteElButton onClick={() => setData((prev) => removeSubEl(prev, stepId, el.id))} />
    </div>
  );
}
```

- [ ] **Step 2: Wire the switch**

Add to the `switch (el.kind)`:

```tsx
case "text_input": return <TextInputEditor el={el} stepId={stepId} />;
```

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit
```

- [ ] **Step 4: Manual smoke check**

Add Input from palette. Variable / Input type / Placeholder / (Min/Max only when Number selected). Switch type to Number, both Min and Max appear. Switch back to Text - they disappear.

- [ ] **Step 5: Commit**

```
git add src/components/quiz-builder/StepEditor.tsx
git commit -m "feat(quiz-builder): TextInputEditor with type / placeholder / number bounds"
```

---

### Task 5: Title / Text variable-interpolation hint

**Files:**
- Modify: `src/components/quiz-builder/StepEditor.tsx`

- [ ] **Step 1: Add hint to TitleEditor and TextEditor**

In `TitleEditor` (~line 40) and `TextEditor` (~line 64), find the place where the textarea/input is closed and add a small help line right after each one. They share the same pattern:

```tsx
<p className="text-[11px] text-gray-400 mt-1">
  Tip: use <code className="px-1 py-px rounded bg-gray-100 text-[10px]">{'{varName}'}</code> to insert a captured answer.
</p>
```

The `{'{varName}'}` is JSX-escaped so the literal curly braces render. Don't paste raw `{varName}` inside JSX - it would be parsed as an expression.

- [ ] **Step 2: Typecheck + manual look**

```
npx tsc --noEmit
```

The hint appears under both Title and Text textareas. Tiny gray text, doesn't dominate.

- [ ] **Step 3: Commit**

```
git add src/components/quiz-builder/StepEditor.tsx
git commit -m "feat(quiz-builder): add {varName} interpolation hint under title and text editors"
```

---

### Task 6: Run full chunk-1 verification

- [ ] **Step 1: Full test + typecheck + build**

```
npm test -- --run
npx tsc --noEmit
```

Both must pass clean.

- [ ] **Step 2: Smoke test the running dev server**

Open `/quizzes/[any-id]/edit`. Add Range, then Input, then Reviews from palette. Each one shows a placeholder card in the StepEditor:
- Range: full editor with all 6 fields - functional now.
- Input: full editor - functional.
- Reviews: there is no editor yet (Task 7). Just the deletable card with the kind name.

- [ ] **Step 3: Optional safety commit**

If anything was tweaked during smoke testing, commit. Otherwise skip.

---

## Chunk 2: Phase B remaining (Testimonial editor, Question extensions, ImagePicker, image-upload route)

End state: every subEl kind has an editor; ImagePicker is integrated into ImageEditor and per-option image_cards; uploads work end-to-end.

### Task 7: `TestimonialSliderEditor`

**Files:**
- Modify: `src/components/quiz-builder/StepEditor.tsx`

- [ ] **Step 1: Add the TestimonialSliderEditor function**

Insert after `TextInputEditor`:

```tsx
function TestimonialSliderEditor({ el, stepId }: EditorProps) {
  if (el.kind !== "testimonial_slider") return null;
  const { setData } = useQuiz();
  const updateItems = (items: Extract<SubEl, { kind: "testimonial_slider" }>["items"]) =>
    setData((prev) => updateSubEl(prev, stepId, el.id, { items }));
  const updateAt = (i: number, patch: Partial<Extract<SubEl, { kind: "testimonial_slider" }>["items"][number]>) => {
    const next = el.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    updateItems(next);
  };
  const removeAt = (i: number) => updateItems(el.items.filter((_, idx) => idx !== i));
  const addItem = () =>
    updateItems([...el.items, { name: "New customer", text: "", rating: 5 }]);

  return (
    <div className="mb-3 p-3 border border-gray-200 rounded-md bg-white">
      <span className={labelBase}>Testimonials</span>
      <div className="flex flex-col gap-2 mt-2">
        {el.items.map((item, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-2 bg-gray-50">
            <div className="flex items-center gap-1.5 mb-1">
              <input
                className={`${inputBase} flex-1`}
                value={item.name}
                placeholder="Name"
                onChange={(e) => updateAt(i, { name: e.target.value })}
              />
              <button
                type="button"
                aria-label="Remove testimonial"
                onClick={() => removeAt(i)}
                className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
            <input
              className={`${inputBase} mb-1`}
              value={item.avatar ?? ""}
              placeholder="Avatar URL (optional)"
              onChange={(e) => updateAt(i, { avatar: e.target.value || undefined })}
            />
            <select
              className={`${inputBase} mb-1`}
              value={item.rating ?? 5}
              onChange={(e) => updateAt(i, { rating: Number(e.target.value) })}
            >
              {[5, 4, 3, 2, 1, 0].map((r) => (
                <option key={r} value={r}>{r} {r === 1 ? "star" : "stars"}</option>
              ))}
            </select>
            <textarea
              className={`${inputBase} resize-none`}
              rows={3}
              value={item.text}
              placeholder="Review text"
              onChange={(e) => updateAt(i, { text: e.target.value })}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors mt-2"
      >
        <PlusCircle size={13} />
        Add testimonial
      </button>
      <DeleteElButton onClick={() => setData((prev) => removeSubEl(prev, stepId, el.id))} />
    </div>
  );
}
```

`X` and `PlusCircle` are already imported in this file. If not, add to existing `lucide-react` import.

- [ ] **Step 2: Wire the switch**

```tsx
case "testimonial_slider": return <TestimonialSliderEditor el={el} stepId={stepId} />;
```

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit
```

- [ ] **Step 4: Manual smoke**

Add Reviews. Edit name + text + avatar + rating. Add 2 more items. Delete the middle one - the other two stay. Switch to preview - the testimonial slider should show all items with prev/next nav.

- [ ] **Step 5: Commit**

```
git add src/components/quiz-builder/StepEditor.tsx
git commit -m "feat(quiz-builder): TestimonialSliderEditor with per-item form fields"
```

---

### Task 8: `QuestionEditor` extensions (layout, variable, searchable, dropdownPlaceholder)

**Files:**
- Modify: `src/components/quiz-builder/StepEditor.tsx`

- [ ] **Step 1: Extend QuestionEditor body**

Find the existing `function QuestionEditor` (~line 238). Just before the existing "Options" block (where `{el.options.map((opt)` starts), insert these three control groups:

```tsx
{/* Layout selector */}
<label className="block text-xs text-gray-500 mt-1">Layout</label>
<select
  className={inputBase}
  value={el.layout}
  onChange={(e) =>
    setData((prev) =>
      updateSubEl(prev, stepId, el.id, { layout: e.target.value as typeof el.layout }),
    )
  }
>
  <option value="list">List (vertical stack)</option>
  <option value="cards">Cards (2 per row)</option>
  <option value="image_cards">Image cards (with photos)</option>
  <option value="chips">Chips (pill grid, multi-select)</option>
  <option value="dropdown">Dropdown (15+ options)</option>
</select>

{/* Variable */}
<label className="block text-xs text-gray-500 mt-2">
  Variable <span className="text-gray-400 font-normal">(optional)</span>
</label>
<input
  className={inputBase}
  value={el.variable ?? ""}
  placeholder="e.g. age - the picked label is stored as {age}"
  onChange={(e) =>
    setData((prev) =>
      updateSubEl(prev, stepId, el.id, { variable: e.target.value || undefined }),
    )
  }
/>

{/* Dropdown-only controls */}
{el.layout === "dropdown" && (
  <>
    <label className="flex items-center gap-2 mt-2 text-xs text-gray-700">
      <input
        type="checkbox"
        checked={el.searchable ?? false}
        onChange={(e) =>
          setData((prev) =>
            updateSubEl(prev, stepId, el.id, {
              searchable: e.target.checked || undefined,
            }),
          )
        }
      />
      Searchable (filter as you type)
    </label>
    <label className="block text-xs text-gray-500 mt-2">Placeholder</label>
    <input
      className={inputBase}
      value={el.dropdownPlaceholder ?? ""}
      placeholder="Pick an option"
      onChange={(e) =>
        setData((prev) =>
          updateSubEl(prev, stepId, el.id, {
            dropdownPlaceholder: e.target.value || undefined,
          }),
        )
      }
    />
  </>
)}
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

- [ ] **Step 3: Manual smoke**

Pick an existing question. Switch layout to Chips - in preview the options should reflow as pills. Switch to Dropdown - the Searchable + Placeholder inputs appear. Tick searchable, type "Pick a breed" - preview's dropdown should reflect.

- [ ] **Step 4: Commit**

```
git add src/components/quiz-builder/StepEditor.tsx
git commit -m "feat(quiz-builder): QuestionEditor exposes layout / variable / searchable / dropdownPlaceholder"
```

---

### Task 9: Image upload API route

**Files:**
- Create: `src/app/api/quiz/[id]/upload-image/route.ts`

- [ ] **Step 1: Write the route**

```ts
// POST /api/quiz/[id]/upload-image
// multipart/form-data { image: File }
// Saves to Supabase Storage at translated-images/quiz-assets/{quizId}/uploaded/{uuid}.{ext}
// Returns { url } - the public URL.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
]);
const BUCKET = "translated-images";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  // Verify the quiz belongs to this workspace
  const db = createServerSupabase();
  const { data: quiz, error: qErr } = await db
    .from("quizzes")
    .select("id, workspace_id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (qErr || !quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "'image' field is required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image too large (${Math.round(file.size / 1024 / 1024)} MB; max 10 MB)` },
      { status: 413 },
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${file.type}` },
      { status: 415 },
    );
  }

  const ext =
    file.type === "image/svg+xml"
      ? "svg"
      : (file.type.split("/")[1] || "bin");
  const path = `quiz-assets/${id}/uploaded/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) {
    return NextResponse.json(
      { error: `Upload failed: ${upErr.message}` },
      { status: 500 },
    );
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test from a terminal** (dev server running):

```
curl -X POST -H "Cookie: $YOUR_SESSION_COOKIE" \
  -F "image=@/path/to/test.png" \
  http://localhost:3000/api/quiz/<quizId>/upload-image
```

If you don't have a session cookie handy, skip and rely on the UI smoke in Task 11.

Expected: `{"url":"https://...supabase.co/.../quiz-assets/.../uploaded/UUID.png"}`. Open the URL - the image should load.

- [ ] **Step 4: Commit**

```
git add src/app/api/quiz/[id]/upload-image/route.ts
git commit -m "feat(quiz-builder): image upload endpoint for editor + image-cards options"
```

---

### Task 10: `<ImagePicker>` shared component

**Files:**
- Create: `src/components/quiz-builder/ImagePicker.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Upload, Image as ImageIcon, Link as LinkIcon, X, Loader2 } from "lucide-react";
import { useQuiz } from "./QuizContext";

type ImagePickerProps = {
  /** Current image URL (or empty string). */
  value: string;
  /** Called with the new URL whenever the picker resolves a new image. */
  onChange: (url: string) => void;
  /** Optional dashed-placeholder hint shown when value is empty (e.g. Gemini description). */
  hint?: string;
  /** Compact mode for per-option pickers in image_cards layout. */
  compact?: boolean;
};

type ProductImage = { id: string; url: string; alt: string | null };

export function ImagePicker({ value, onChange, hint, compact }: ImagePickerProps) {
  const { quiz } = useQuiz();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showBank, setShowBank] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [bankImgs, setBankImgs] = useState<ProductImage[] | null>(null);
  const [bankQuery, setBankQuery] = useState("");

  async function handleFile(file: File) {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("image", file);
    try {
      const res = await fetch(`/api/quiz/${quiz.id}/upload-image`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { url: string };
      onChange(json.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!showBank || bankImgs !== null) return;
    fetch(`/api/products?images=true`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { product_images?: ProductImage[] }[] | ProductImage[]) => {
        const flat: ProductImage[] = Array.isArray(data)
          ? (data as ProductImage[])
          : (data as { product_images?: ProductImage[] }[])
              .flatMap((p) => p.product_images ?? []);
        setBankImgs(flat);
      })
      .catch(() => setBankImgs([]));
  }, [showBank, bankImgs]);

  const filteredBank = bankImgs?.filter((img) =>
    bankQuery.trim()
      ? (img.alt ?? "").toLowerCase().includes(bankQuery.trim().toLowerCase())
      : true,
  );

  const previewBoxClass = compact
    ? "w-20 h-20 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden"
    : "w-full aspect-video rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden";

  return (
    <div className="flex flex-col gap-1.5">
      <div className={previewBoxClass}>
        {value ? (
          <Image src={value} alt="" width={400} height={300}
            className="w-full h-full object-cover" unoptimized />
        ) : (
          <div className="text-[11px] text-gray-400 px-2 text-center">
            {hint ? <em>{hint}</em> : "No image"}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-[11px] text-gray-700 hover:border-indigo-300">
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Upload
        </button>
        <button type="button" onClick={() => setShowBank((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-[11px] text-gray-700 hover:border-indigo-300">
          <ImageIcon size={11} /> Product bank
        </button>
        <button type="button" onClick={() => setShowUrl((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-[11px] text-gray-700 hover:border-indigo-300">
          <LinkIcon size={11} /> URL
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-[11px] text-gray-500 hover:text-red-600">
            <X size={11} /> Clear
          </button>
        )}
      </div>
      {showUrl && (
        <div className="flex gap-1 mt-1">
          <input className="flex-1 border border-gray-200 rounded px-2 py-1 text-[11px]"
            placeholder="https://..." value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)} />
          <button type="button" disabled={!urlInput.trim()}
            onClick={() => { onChange(urlInput.trim()); setUrlInput(""); setShowUrl(false); }}
            className="px-2 py-1 rounded bg-indigo-600 text-white text-[11px] disabled:opacity-50">
            Set
          </button>
        </div>
      )}
      {showBank && (
        <div className="border border-gray-200 rounded-md p-2 bg-white max-h-48 overflow-y-auto">
          <input
            className="w-full border border-gray-200 rounded px-2 py-1 text-[11px] mb-1"
            placeholder="Search by alt text..."
            value={bankQuery}
            onChange={(e) => setBankQuery(e.target.value)}
          />
          {bankImgs === null && <div className="text-[11px] text-gray-400">Loading...</div>}
          {bankImgs && filteredBank!.length === 0 && (
            <div className="text-[11px] text-gray-400">No images.</div>
          )}
          <div className="grid grid-cols-3 gap-1">
            {filteredBank?.slice(0, 60).map((img) => (
              <button key={img.id} type="button"
                onClick={() => { onChange(img.url); setShowBank(false); }}
                className="aspect-square rounded overflow-hidden border border-gray-200 hover:border-indigo-400">
                <Image src={img.url} alt={img.alt ?? ""} width={120} height={120}
                  className="w-full h-full object-cover" unoptimized />
              </button>
            ))}
          </div>
        </div>
      )}
      {err && <div className="text-[11px] text-red-600">{err}</div>}
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.currentTarget.value = "";
        }} />
    </div>
  );
}
```

- [ ] **Step 2: Verify the assumed `/api/products?images=true` endpoint**

Look for it:
```
grep -rn "api/products" src/app/api/ src/components/
```

If it doesn't return product_images joined, either (a) extend it - if you do, add `?images=true` flag that joins `product_images` and returns them, or (b) inline the query in `ImagePicker.tsx` (`fetch('/api/products')` then for each, fetch images, OR just make a new lightweight `GET /api/quiz/[id]/product-images` route). Pick whichever is least invasive in the existing codebase. Document the choice in the commit message.

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
git add src/components/quiz-builder/ImagePicker.tsx <other files>
git commit -m "feat(quiz-builder): ImagePicker with upload / product-bank / URL sources"
```

---

### Task 11: Wire ImagePicker into ImageEditor

**Files:**
- Modify: `src/components/quiz-builder/StepEditor.tsx`

- [ ] **Step 1: Replace the URL field in ImageEditor**

Find `function ImageEditor` (~line 86). Today it has a plain text input for URL. Replace its body so the URL input is replaced by `<ImagePicker value={el.url} onChange={(url) => patch({ url })} />`. Keep the `alt` text input. Keep the delete button.

- [ ] **Step 2: Import ImagePicker**

Add to existing imports:
```tsx
import { ImagePicker } from "./ImagePicker";
```

- [ ] **Step 3: Manual smoke**

Add Image to a step. Click Upload, pick a local PNG, see it appear in the preview within ~1s after save. Try Product bank - the modal lists images. Try URL - paste a public image URL.

- [ ] **Step 4: Commit**

```
git add src/components/quiz-builder/StepEditor.tsx
git commit -m "feat(quiz-builder): ImageEditor uses ImagePicker (upload / product-bank / URL)"
```

---

### Task 12: Per-option image picker for image_cards layout

**Files:**
- Modify: `src/components/quiz-builder/StepEditor.tsx`

- [ ] **Step 1: Extend QuestionEditor's option row**

In `QuestionEditor` (~line 267), inside the `el.options.map((opt) =>` block, when `el.layout === "image_cards"`, render an `ImagePicker` (compact mode) above the label input. Pass `value={opt.imageUrl ?? ""}`, `hint={opt.imageDescription}`, and `onChange={(url) => setData((prev) => updateOption(prev, stepId, el.id, opt.id, { imageUrl: url || undefined }))}`.

```tsx
{el.layout === "image_cards" && (
  <div className="mb-1">
    <ImagePicker
      compact
      value={opt.imageUrl ?? ""}
      hint={opt.imageDescription}
      onChange={(url) =>
        setData((prev) =>
          updateOption(prev, stepId, el.id, opt.id, {
            imageUrl: url || undefined,
          }),
        )
      }
    />
  </div>
)}
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

- [ ] **Step 3: Manual smoke**

Pick a question with image_cards layout (e.g. Woofz "Choose your dog's age" if you still have it imported). Each option now has an ImagePicker above its label. Upload an illustration - it appears in preview's option card.

- [ ] **Step 4: Commit**

```
git add src/components/quiz-builder/StepEditor.tsx
git commit -m "feat(quiz-builder): per-option image picker on image_cards layout"
```

---

### Task 13: Chunk-2 verification

- [ ] **Step 1: Full check**

```
npm test -- --run
npx tsc --noEmit
npm run build
```

All three clean.

- [ ] **Step 2: End-to-end editor walk**

Add every subEl kind from the palette in one fresh step. Edit each. Switch the question to every layout in turn. Confirm preview reflects every change after the 800ms autosave debounce.

---

## Chunk 3: Phase D Split-view editor

End state: a "Show preview" toggle in the topbar reveals a phone-frame iframe to the right that auto-reloads after each save.

### Task 14: `useSaveStateChange` hook in QuizContext

**Files:**
- Modify: `src/components/quiz-builder/QuizContext.tsx`

- [ ] **Step 1: Add the hook**

At the bottom of `QuizContext.tsx`, add:

```ts
import { useEffect, useRef as useRefImported } from "react";

/**
 * Fires the callback whenever saveState transitions INTO "saved" from a
 * different value. Used by the split-view preview iframe to know when it's
 * safe to reload (i.e. the latest edit has been persisted).
 */
export function useSaveStateChange(onSaved: () => void) {
  const { saveState } = useQuiz();
  const prev = useRefImported<typeof saveState | null>(null);
  useEffect(() => {
    if (prev.current !== "saved" && saveState === "saved") {
      onSaved();
    }
    prev.current = saveState;
  }, [saveState, onSaved]);
}
```

(`useRef` is probably already imported at the top of the file - if so, drop the alias and use it directly. The alias just sidesteps a duplicate-import lint error.)

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/quiz-builder/QuizContext.tsx
git commit -m "feat(quiz-builder): useSaveStateChange hook for split-view iframe reload"
```

---

### Task 15: `<PreviewPane>` component (phone frame + iframe + refresh)

**Files:**
- Create: `src/components/quiz-builder/PreviewPane.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import { useRef, useState, useCallback } from "react";
import { ExternalLink, RotateCw } from "lucide-react";
import { useQuiz, useSaveStateChange } from "./QuizContext";

const FRAME_W = 380;
const FRAME_H = 780;
const IFRAME_W = 366;
const IFRAME_H = 720;

export function PreviewPane() {
  const { quiz } = useQuiz();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  // Auto-reload after every successful save
  useSaveStateChange(reload);

  const src = `/quizzes/${quiz.id}/preview?ts=${version}`;

  return (
    <div className="flex flex-col items-center gap-2 p-4 bg-gray-100 border-l border-gray-200 overflow-y-auto"
      style={{ width: FRAME_W + 32 }}>
      <div className="flex gap-2 self-stretch justify-end">
        <button
          type="button"
          onClick={reload}
          aria-label="Refresh preview"
          className="p-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
        >
          <RotateCw size={13} />
        </button>
        <a
          href={`/quizzes/${quiz.id}/preview`}
          target="_blank"
          rel="noreferrer"
          aria-label="Open preview in new tab"
          className="p-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
        >
          <ExternalLink size={13} />
        </a>
      </div>
      <div
        className="rounded-[36px] bg-black p-2 shadow-xl"
        style={{ width: FRAME_W, height: FRAME_H }}
      >
        <iframe
          ref={iframeRef}
          key={version}
          src={src}
          className="rounded-[28px] bg-white"
          style={{ width: IFRAME_W, height: IFRAME_H, border: "none", display: "block" }}
          title="Quiz preview"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/quiz-builder/PreviewPane.tsx
git commit -m "feat(quiz-builder): PreviewPane phone-frame iframe with auto-reload + manual refresh"
```

---

### Task 16: Topbar toggle + URL/localStorage sync

**Files:**
- Modify: `src/components/quiz-builder/QuizTopBar.tsx`

- [ ] **Step 1: Add the toggle**

Find an appropriate slot (next to the existing tabs, e.g. Editor / Settings / Analytics buttons). Add:

```tsx
import { Eye, EyeOff } from "lucide-react";
import { usePreviewToggle } from "./usePreviewToggle";
// ... inside the component:
const { showPreview, toggle, narrow } = usePreviewToggle();
// ... in JSX:
<button
  type="button"
  onClick={toggle}
  disabled={narrow}
  title={narrow ? "Available on screens 1024px wide and above" : showPreview ? "Hide preview" : "Show preview"}
  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors ${
    showPreview ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-gray-200 text-gray-600"
  } ${narrow ? "opacity-50 cursor-not-allowed" : "hover:border-indigo-300"}`}
>
  {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
  Preview
</button>
```

- [ ] **Step 2: Create the hook**

Create `src/components/quiz-builder/usePreviewToggle.ts`:

```ts
"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const LS_KEY = "quiz-editor.preview";
const NARROW_BP = 1024;

export function usePreviewToggle() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [narrow, setNarrow] = useState(false);

  const urlSays = params.get("preview") === "1";
  const lsSays = typeof window !== "undefined" && localStorage.getItem(LS_KEY) === "1";
  const showPreview = !narrow && (urlSays || (!params.has("preview") && lsSays));

  useEffect(() => {
    function check() {
      setNarrow(window.innerWidth < NARROW_BP);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toggle = useCallback(() => {
    if (narrow) return;
    const next = !showPreview;
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, next ? "1" : "0");
    }
    const sp = new URLSearchParams(params);
    if (next) sp.set("preview", "1");
    else sp.delete("preview");
    router.replace(`${pathname}?${sp.toString()}`);
  }, [narrow, showPreview, params, pathname, router]);

  return { showPreview, toggle, narrow };
}
```

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit
```

- [ ] **Step 4: Manual smoke**

Click Preview in topbar - URL gains `?preview=1`. Refresh - the toggle stays on. Drop the URL param manually - localStorage value still keeps it on. Set `localStorage.removeItem("quiz-editor.preview")` then reload - off. Resize browser to <1024px - button greys out and hides preview.

- [ ] **Step 5: Commit**

```
git add src/components/quiz-builder/QuizTopBar.tsx src/components/quiz-builder/usePreviewToggle.ts
git commit -m "feat(quiz-builder): preview toggle in topbar with URL + localStorage sync, mobile-disabled"
```

---

### Task 17: `<QuizShell>` 4-column layout + StepsTree collapsing

**Files:**
- Modify: `src/components/quiz-builder/QuizShell.tsx`
- Modify: `src/components/quiz-builder/StepsTree.tsx`

- [ ] **Step 1: Wire PreviewPane into QuizShell**

Find where `QuizShell` renders the existing 3-column structure. Add a conditional 4th column on the right:

```tsx
import { PreviewPane } from "./PreviewPane";
import { usePreviewToggle } from "./usePreviewToggle";
// ... inside the component:
const { showPreview } = usePreviewToggle();
// ... in JSX (3-column wrapper):
<div className="flex flex-1 overflow-hidden">
  <StepsTree collapsed={showPreview} />
  <LogicCanvas />
  <StepEditor />
  {showPreview && <PreviewPane />}
</div>
```

- [ ] **Step 2: Add `collapsed` prop to StepsTree**

In `StepsTree.tsx`, accept an optional `collapsed?: boolean` prop. When true, render the panel at width 60px showing only step icons / index numbers, no labels. When false, today's behaviour stays.

A minimal pattern:
```tsx
export function StepsTree({ collapsed = false }: { collapsed?: boolean }) {
  // ... existing data fetching ...
  return (
    <aside className={collapsed ? "w-[60px] border-r border-gray-200 bg-white py-2" : "w-[220px] border-r border-gray-200 bg-white"}>
      {/* iterate steps */}
      {steps.map((step, i) => collapsed
        ? <CollapsedStepDot step={step} index={i} key={step.id} />
        : <FullStepRow step={step} key={step.id} />)}
    </aside>
  );
}
```

Keep the existing rendering logic, just split between the two visual treatments. `CollapsedStepDot` shows just the step number in a 32px circle with click-to-select.

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit
```

- [ ] **Step 4: Manual smoke**

Toggle Preview on - StepsTree collapses to 60px icons; PreviewPane appears on the right. Toggle off - tree expands; preview disappears.

- [ ] **Step 5: Commit**

```
git add src/components/quiz-builder/QuizShell.tsx src/components/quiz-builder/StepsTree.tsx
git commit -m "feat(quiz-builder): split-view 4-column layout with collapsing StepsTree"
```

---

### Task 18: Final verification + journal

- [ ] **Step 1: Full check + build**

```
npm test -- --run
npx tsc --noEmit
npm run build
```

All clean.

- [ ] **Step 2: End-to-end walkthrough on the dev server**

1. Open `/quizzes/[your-Hydro13-quiz-id]/edit`.
2. Click Preview - phone-frame appears on the right, mirrors the quiz.
3. Add a Range subEl, set min/max - preview updates after ~1s.
4. Switch a question's layout to Chips - preview reflects.
5. Add an Image subEl, upload a local PNG - preview reflects.
6. Open the same URL with `?preview=1` removed - preview stays on (localStorage).
7. Resize the browser to ~900px - preview pane hides, toggle button disables.

Each interaction should feel responsive (<2s round trip). If anything stalls or flickers, capture details and fix in a follow-up commit.

- [ ] **Step 3: Update HANDOVER doc**

In `docs/superpowers/HANDOVER-2026-04-24.md` (existing file), append a "Resolved 2026-04-24 (authoring 2.0)" section listing the new editors, ImagePicker, upload route, split-view + reload behaviour, and bundle/commit hashes. Keep it brief, similar to existing sections.

- [ ] **Step 4: Final commit**

```
git add docs/superpowers/HANDOVER-2026-04-24.md
git commit -m "docs: HANDOVER update for quiz builder 2.0 authoring (B + D)"
```

---

## Notes for the executor

- **Subagent dispatch**: each task is self-contained. A subagent can take any task from 1 onward and finish it in isolation, but tasks within a chunk reference each other (Task 11 depends on 10's `ImagePicker`). Run within a chunk in order; chunks themselves are sequential.
- **Style consistency**: existing editor uses `inputBase`, `labelBase`, and Tailwind tokens defined at the top of `StepEditor.tsx`. Reuse them - don't introduce new styling primitives.
- **No premature optimisation**: TestimonialSliderEditor's items don't need drag-reordering. The image-bank picker doesn't need pagination beyond the 60-image cap. We can polish in a follow-up.
- **Don't push to main**. After all tasks land on `feat/quiz-builder-editor`, ask the user before any merge or `git push`.
