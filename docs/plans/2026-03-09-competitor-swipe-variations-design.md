# Competitor Ad Swipe — Multi-Image + Variation Count

**Date:** 2026-03-09
**Status:** Approved

## Problem

When swiping a competitor ad, you only get 1 generated image. Competitors often have 3+ images in one concept, and you want to:
- Upload all images from a competitor concept at once
- Control how many visual variations you get per image
- Replicate what's winning, not brainstorm something new

## Design

### UI (`BrainstormGenerate.tsx`)

- **Multi-image upload**: `File[]` array instead of single `File | null`. Upload area allows adding multiple images. Each shows as a thumbnail with a remove button.
- **"Variations per image" stepper**: Number input (1–10, default 1) below the upload area.
- **Preview math**: Shows e.g. "3 images × 2 variations = 6 images" so you know total output before generating.

### API (`/api/brainstorm/route.ts`)

- Accept `competitor_image_urls: string[]` (array) instead of a single string.
- Upload each image to temp storage, collect URLs.
- Pass all images + `count` (variations per image) to Claude in one message.
- Extend count clamp from 1–5 to 1–10 for competitor ad mode.

### Prompt (`brainstorm.ts` — `buildFromCompetitorAdSystem`)

- Claude receives all N images at once → analyzes the concept holistically (visual style, persuasion, structure).
- For each uploaded image, generates `count` visually distinct variation prompts (different composition, angle, lighting, perspective) with minor hook text tweaks.
- Output shape changes: `image_prompts` entries include `source_index` to link back to which uploaded image they're based on.

```json
{
  "image_prompts": [
    { "source_index": 0, "prompt": "...", "hook_text": "...", "headline_text": "..." },
    { "source_index": 0, "prompt": "...", "hook_text": "...", "headline_text": "..." },
    { "source_index": 1, "prompt": "...", "hook_text": "...", "headline_text": "..." }
  ]
}
```

### Generation (`generate-competitor/route.ts`)

- Loop already handles multiple `image_prompts` — no structural change needed.
- Use `source_index` to pick the correct competitor image as Nano Banana reference for each prompt.
- `pending_competitor_gen` stores `competitor_image_urls: string[]` (array) instead of single URL.

### Cost

1 KIE credit per generated image. Total = uploaded images × variations per image.
