# From Competitor Ad — Brainstorm Mode Design

## Problem

No winning ads yet. Need to bootstrap creative testing by adapting proven competitor ads rather than inventing from scratch. The PDF "Module X" describes a manual workflow: find 100 winning ads → Claude analyzes each → generate adapted versions via Nano Banana. This feature automates that workflow inside Content Hub.

## Solution

New brainstorm mode "From Competitor Ad" that takes a competitor ad image (+ optional ad copy) as input and produces a pipeline concept with 3-5 generated images + adapted ad copy, ready for the normal translation/push flow.

## User Flow

1. Select "From Competitor Ad" mode in brainstorm
2. Upload competitor ad image (drag & drop or file picker)
3. Optionally paste competitor's ad copy (primary text + headline)
4. Select product (HappySleep / Hydro13)
5. Hit Generate

## Processing Pipeline

### Step 1: Claude Vision Analysis

Claude receives the competitor image (+ pasted copy if provided) with product bank context and:

- Extracts exact visual structure (layout, text placement, background style, color scheme, typography feel)
- Identifies persuasion technique (before/after, social proof, fear, urgency, etc.)
- Maps to CASH DNA (awareness level, angle, concept type) for pipeline tracking
- Generates adapted ad copy (2-3 primary text variations + 2-3 headlines) using product bank claims/benefits
- Generates 3-5 Nano Banana prompts — each a variation of the competitor's visual format adapted for the target product (different hooks/angles, same visual structure)
- Auto-detects aspect ratio of original ad

### Step 2: Image Generation

For each of the 3-5 prompts:

- Send to Nano Banana (Kie.ai) with:
  - The generated text prompt describing the visual
  - The competitor ad image as `image_input` reference
  - Product photo as additional reference (if applicable)
- Generate at detected aspect ratio (user can override)
- Poll until complete (existing `pollTaskResult` flow)

### Step 3: Pipeline Concept Creation

A `pipeline_concept` is created with:

- `generation_mode: "from_competitor_ad"`
- CASH DNA from the analysis
- Adapted ad copy (primary + headlines)
- Links to generated source images
- Reference to original competitor ad URL (stored in concept metadata)
- Status: `pending_review`

From here: normal flow — review, approve, translate to target languages, push to Meta.

## Key Difference From Existing Modes

| Aspect | Normal brainstorm | From Competitor Ad |
|---|---|---|
| Input | Product + mode params | Competitor ad image + optional copy |
| Style selection | 8 styles, awareness-filtered | Bypassed — competitor ad IS the style |
| Image briefs | Claude generates from CASH DNA | Claude generates from visual analysis |
| Nano Banana input | Text prompt only | Text prompt + competitor image reference |
| Output | 5-8 concepts (no images yet) | 1 concept with 3-5 generated images |

## What Stays the Same

- Concept lives in `pipeline_concepts` with full CASH DNA
- Ad copy editable, translatable to target languages
- Images enter normal translation pipeline (4:5 + 9:16)
- Push to Meta works identically
- Concept queue review flow unchanged

## Database Changes

- Add `"from_competitor_ad"` to `generation_mode` values
- Store competitor reference image URL in concept metadata (JSONB field on `pipeline_concepts` or new column `competitor_reference_url`)

## Files to Modify

- `src/lib/brainstorm.ts` — new mode + Claude Vision prompt
- `src/components/brainstorm/BrainstormGenerate.tsx` — UI for image upload + optional copy paste
- `src/app/api/brainstorm/route.ts` — handle image upload, call Claude Vision, generate images
- `src/lib/kie.ts` — already supports `image_input`, no changes needed
- `src/types/index.ts` — add new generation mode type
