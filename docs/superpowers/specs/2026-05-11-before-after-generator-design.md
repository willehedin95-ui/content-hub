# Before/After Generator - Design Doc

**Date:** 2026-05-11
**Author:** Brainstormed with William
**Status:** Approved, ready for implementation plan

## Context & motivation

The Image Swiper in `/assets` has a Replica mode intended for replacing the person in a competitor image while keeping the rest. It does not work well for before/after images: the generated output is near-identical to the source because (a) the prompt re-uses the source person's demographic description, (b) the source image is sent as the primary visual reference, and (c) edit instructions are silently dropped due to a JSON parse fallback bug.

William wants to produce many before/after style images for Hydro13 (marine collagen) - for use on the website, in emails, and in other non-ad marketing surfaces. The Image Swiper tool is NOT the place for Meta ads; that has a separate dedicated tool.

## Scope

A new dedicated tool ("Before/After") under the Assets sidebar that generates side-by-side before/after images of a scandinavian woman showing a specific body zone with a chosen severity of skin improvement. The source image is optional - if provided, it serves as composition/lighting/format reference only.

Out of scope:
- Meta ad creation (separate ad-swiper tool exists)
- Persona-locked generation (William wants variation, not consistency)
- Animated B/A (video, gif) - this is static images only
- Non-skin transformations (weight, hair, etc.) - skin/aging signs only

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mode | Source optional | William wants both "swipe a competitor B/A" and "generate from scratch" |
| Demographic | Always scandinavian woman, randomized per generation | William wants variation; explicitly rejected personas |
| Body zone selection | Preset dropdown + "Other" free text + auto-detect from source | Most cases covered by presets; free text for edge cases; auto-detect speeds up swiping |
| Intensity | 3 tiers: Subtle / Moderate / Dramatic | Simple choice, low decision fatigue |
| Output format | Single side-by-side split image, no text labels | Matches Oslo Skin Lab format; William explicitly rejected "Before"/"After" text overlays |
| UI placement | New tool entry in TOOLS sidebar | Form fields differ enough from Image Swiper that conditional UI would be ugly |
| Aspect ratio | 16:9 wide (or similar wide ratio) | Side-by-side split fits naturally; not constrained to Meta ad specs since not for ads |

## Architecture

### New files
- `src/components/assets/BeforeAfterGenerator.tsx` - main UI component (parallel to `ImageSwiper.tsx`)
- `src/app/api/assets/before-after/route.ts` - main API endpoint, NDJSON streaming
- `src/app/api/assets/before-after/regenerate/route.ts` - retry endpoint

### Files to update
- `src/components/assets/AssetsSidebar.tsx` - add new tool entry under TOOLS
- The parent assets page that switches between tool components - register BeforeAfterGenerator

### Reused infrastructure
- `/api/upload-temp` for source image upload
- `/api/assets/import-url` for save-to-assets
- `createImageTask` / `pollTaskResult` from `src/lib/kie.ts`
- Claude Anthropic SDK for source-image vision analysis
- `ASSET_CATEGORIES` constant - `before_after` already exists as a category

## Form layout

```
┌─────────────────────────────────────────┐
│ [Drop zone] Source image (optional)     │
│  Drop, paste, or click. JPG/PNG/WebP.   │
├─────────────────────────────────────────┤
│ Body zone *                             │
│ [Dropdown ▼]   Default: Full face       │
│   Full face (front)                     │
│   Face profile / 3-quarter              │
│   Eye area + crow's feet                │
│   Forehead                              │
│   Neck + decolletage                    │
│   Cheek closeup                         │
│   Arm / skin texture                    │
│   Hands                                 │
│   Other (free text)                     │
├─────────────────────────────────────────┤
│ Intensity *  Default: Moderate          │
│ [Subtle]  [Moderate]  [Dramatic]        │
├─────────────────────────────────────────┤
│ Notes (optional)                        │
│ [Text input]                            │
├─────────────────────────────────────────┤
│       [Generate Before/After]           │
└─────────────────────────────────────────┘
```

Behavior:
- "Other" in the dropdown reveals an extra free-text field labeled "Describe the body zone".
- Body zone and Intensity are required. Source is optional.
- If source uploaded: Claude vision call on submit auto-detects zone and pre-fills the dropdown. User can override.
- No product toggle (irrelevant for B/A images).

## Generation pipeline

### Request payload
```typescript
POST /api/assets/before-after
{
  image_url?: string;        // optional source
  body_zone: string;          // one of presets OR "other"
  custom_zone?: string;       // required if body_zone === "other"
  intensity: "subtle" | "moderate" | "dramatic";
  notes?: string;
}
```

### Server flow
1. If source uploaded: Claude vision extraction
   - Detect body zone (return detected_zone for client cross-check)
   - Extract composition: camera angle, framing, lighting, background, crop
   - Cost-logged to `usage_logs` table
2. Always: randomize demographic server-side (see below)
3. Build Nano Banana prompt (see below)
4. Call `createImageTask` with prompt + (source as reference image if uploaded) + aspect ratio 16:9 + "2K"
5. Poll task, return image URL
6. Log Nano Banana usage to `usage_logs`

### NDJSON event stream
- `analyzing` - if source provided
- `analyzed` - returns detected_zone, demographic spec
- `generating` - Nano Banana started
- `completed` - returns image_url, prompt_used, demographic, detected_zone
- `error` - on failure

### Demographic randomization (server-side)
Pick one value from each axis per generation. All values target the scandinavian-woman demographic Hydro13 sells to.

```typescript
const AGE_RANGES = ["40-45", "46-50", "51-55", "56-60", "61-65"];
const HAIR_COLORS = [
  "blonde", "dark blonde", "light brown", "brunette",
  "salt-and-pepper", "silver-grey", "ash-blonde"
];
const HAIR_STYLES = [
  "shoulder-length down", "long down", "low ponytail",
  "low bun", "loose waves", "pulled back simply"
];
const EYE_COLORS = ["blue", "blue-grey", "green", "hazel", "light brown"];
const SKIN_TONES = ["fair", "light beige", "light pink-fair", "neutral fair"];
const ACCENTS = [
  null, null, null,           // most generations have no accent (weighted)
  "subtle freckles",
  "very light tan",
  "no makeup, natural face",
  "very light natural makeup"
];
```

The combination is returned in the NDJSON `completed` event so William can see what was generated.

### Intensity prompt fragments

**Subtle**:
> The after-half shows marginally smoother texture, very subtle reduction in fine lines, slightly more even tone. The difference must be visible on close inspection but extremely believable - barely noticeable at first glance. Think 30 days of skincare use.

**Moderate** (default):
> The after-half shows clearly smoother texture, noticeably reduced fine lines and crow's feet, more even tone, healthier glow. The difference is obvious but still realistic. Think 60-90 days of skincare use.

**Dramatic**:
> The after-half shows significant improvement: visibly firmer skin, much smoother texture, notably reduced wrinkles and sagging, brighter and more even tone, healthy glow. The difference is striking but stops short of looking unrealistic or photoshopped.

### Nano Banana prompt structure (JSON format)

Always JSON to avoid the Replica catch-fallback bug where edit instructions get dropped.

```json
{
  "task": "generate_image",
  "format": "single image, side-by-side split, before on left half, after on right half, sharp vertical divider OR seamless transition",
  "subject": {
    "demographic": "<randomized: e.g. 'Scandinavian woman, 52 years old, dark blonde hair in a low ponytail, blue-grey eyes, fair skin, no makeup'>",
    "body_zone": "<resolved body zone, e.g. 'tight crop on neck and decolletage'>",
    "expression": "neutral relaxed face",
    "identity_lock": "BOTH halves must show the EXACT SAME person - identical face shape, hair color, hair style, eye color, age. ONLY the skin condition differs between halves."
  },
  "composition": {
    "camera": "<from source if uploaded, else 'natural smartphone angle, eye-level or slightly above'>",
    "framing": "<from source if uploaded, else zone-appropriate tight crop>",
    "lighting": "<from source if uploaded, else 'natural soft ambient lighting, no studio setup, no harsh shadows'>",
    "background": "<from source if uploaded, else 'neutral home environment, soft out-of-focus'>",
    "composition_lock": "Camera angle, framing, lighting, and background must be IDENTICAL between the two halves."
  },
  "transformation": "<intensity prompt fragment>",
  "style": "Realistic smartphone-quality photo (iPhone), authentic UGC feel. Visible pores, natural skin texture, real imperfections in both halves. NO airbrushing, NO unrealistic smoothing, NO filters, NO beauty mode. The 'after' improvement must look like collagen/skincare results over time - NOT plastic surgery, NOT cosmetic procedures, NOT digital retouching.",
  "hard_constraints": [
    "NEVER render any text, labels, watermarks, captions, or overlays. NO 'Before' or 'After' text anywhere. The image must be completely free of text.",
    "Both halves must show the same person - same face, same hair, same age. Only skin condition differs.",
    "If a reference image is provided, use it for composition and lighting only - the person must be the randomized scandinavian woman described above, NOT the person in the reference.",
    "Both halves must have the same realistic skin texture - the 'before' has more visible aging signs, the 'after' has fewer, but both look like real un-retouched skin."
  ],
  "instruction": "Generate a clean before/after split image with the randomized scandinavian woman in the specified body zone, showing the specified intensity of skin improvement. NO TEXT."
}
```

When source is uploaded:
- Source image is the FIRST reference image passed to Nano Banana
- Prompt explicitly states: reference is for composition only, person comes from demographic spec
- The composition fields are filled from Claude's vision extraction

When source is NOT uploaded:
- No reference images
- Composition fields use sensible defaults for the chosen body zone

## Done-state UI

After generation:
- Side-by-side display: source (if uploaded) | generated
- "Save to Assets" button (opens existing modal, defaults: category `before_after`, product `hydro13` if in Hydro13 workspace)
- "Re-roll demographic" button - re-runs with same body zone/intensity/notes/source but new randomized demographic
- "Start Over" button - resets to upload phase
- Edit instructions field + "Regenerate with edits" button - injects edits into the JSON prompt (works correctly because we use JSON from the start)
- Display the randomized demographic as readable text under the generated image (e.g. "Generated with: 52 years old, dark blonde, low ponytail, blue-grey eyes")

## Error handling

- Source upload fails → error in UI, stay in upload phase, allow retry
- Claude vision detection fails → log error, proceed with user-selected zone, skip composition extraction (use defaults)
- Nano Banana generation timeout/fail → show error, allow retry
- Vercel function timeout (300s on Hobby plan) → set `export const maxDuration = 300`; if we ever hit it, consider switching to async polling pattern (already used elsewhere in repo)
- Stream parse error → show error, no auto-retry

## Verification plan (manual - no test suite)

After implementation:
1. Generate 5 images with no source, body zone "Full face (front)", intensity Moderate → confirm 5 visibly different scandinavian women
2. Generate 3 images using the Oslo Skin Lab eye-area B/A as source → confirm auto-zone-detect picks "Eye area + crow's feet", composition matches source, person varies
3. Generate one of each intensity (Subtle / Moderate / Dramatic) at the same body zone with the same source → confirm visible difference in transformation severity
4. Generate 10 images and confirm ZERO of them have "Before"/"After" text rendered in the output
5. Try "Other" body zone with free text → confirm prompt uses the free text
6. Click "Re-roll demographic" three times on the same generation → confirm three different demographics
7. Use edit instructions on a generated image ("add subtle freckles") → confirm regeneration applies the edit (the bug-fix proof point)

## Open questions

None - all clarified during brainstorming.

## Not doing now (deferred)

- Persona save/load (William rejected)
- Multi-frame B/A (3-stage timeline) - could add later if useful
- Video B/A (after → before reverse animation) - separate effort
- Hydro13 product visible in image - never appropriate for B/A
- Localized text overlays (e.g. "Efter 60 dagar" in Swedish) - we explicitly want NO text
