# Image Swiper V2 — Structured JSON Style Extraction

**Date:** 2026-03-10
**Status:** Approved

## Problem

The current Image Swiper asks Claude Vision to analyze a competitor image and produce a "2-4 sentence Nano Banana prompt." This loses critical visual information — colors drift (HappySleep pillow turns blue), composition diverges, and the generated image doesn't capture the competitor's vibe.

Additionally, product selection is currently required but shouldn't be — sometimes you just want to recreate a style without adapting it for a specific product.

## Solution

Two changes:

### 1. Product Selection Is Optional

**UI:** Make product buttons deselectable (click again to deselect). When no product is selected, the swiper becomes a pure style recreation tool.

**API:** The `product` field becomes optional. When absent:
- Skip all product-related DB queries (product, guidelines, segments, hero images)
- System prompt omits the "Product Context" section entirely
- Claude's task changes from "adapt for product X" to "recreate this style"
- `subjects` with `is_competitor_product: true` are described generically in the prompt
- No product hero images passed to Nano Banana `image_input` (empty array)

**API with product:** Same as before — fetch product data, include product context in system prompt, Claude adapts the prompt for the target product, hero images passed as `image_input`.

**Save-to-assets:** When no product selected, omit `product` field from save request. Generated image label shows "GENERATED (STYLE)" instead of "GENERATED (HAPPYSLEEP)".

**Usage logging:** When no product, log `metadata.product: null`.

### 2. Structured JSON Style Extraction

Replace the current loose analysis + free-text prompt. Claude does both extraction AND prompt-building in a single call — the structured JSON gives Claude the discipline to capture every detail, and then it uses that same detail to write a much richer Nano Banana prompt.

**Claude returns both structured JSON + prompt:**

```json
{
  "extraction": {
    "scene": {
      "setting": "Medical office / examination room",
      "background": "Beige wall, spinal anatomy chart, soft natural light from left",
      "lighting": "Warm overhead diffused + soft side light, no harsh shadows",
      "atmosphere": "Professional, clinical but approachable"
    },
    "composition": {
      "layout": "Split diptych — two frames side by side",
      "framing": "Medium shot, waist-up",
      "focal_point": "Product interaction in left frame, anatomical context in right",
      "aspect_ratio": "16:9"
    },
    "subjects": [
      {
        "type": "person",
        "description": "Male professional, 40s, glasses, white lab coat",
        "position": "Center-left of each frame",
        "action": "Demonstrating product placement on patient/model"
      },
      {
        "type": "product",
        "description": "Cervical/orthopedic pillow, light blue",
        "position": "Held in hands, center of left frame",
        "is_competitor_product": true
      },
      {
        "type": "prop",
        "description": "Anatomical spine model, red muscle attachments",
        "position": "Right frame, being demonstrated"
      }
    ],
    "colors": {
      "palette": ["#FFFFFF", "#F5F0E8", "#4A7FB5", "#C0392B", "#2C3E50"],
      "dominant_tone": "cool",
      "contrast": "medium",
      "mood": "Clean clinical whites with medical blue accents"
    },
    "style": {
      "category": "native-ad",
      "feel": "Authoritative yet approachable — medical professional demonstrating product",
      "texture": "sharp"
    }
  },
  "nano_banana_prompt": "A detailed multi-sentence prompt built from the extraction above, with product-specific adaptations when a product is selected..."
}
```

The `extraction` JSON forces Claude to systematically capture every visual detail before writing the prompt. The `nano_banana_prompt` then uses all that detail — specific hex colors, lighting descriptions, composition layout, etc. — resulting in a 5-10x more specific prompt than the current "2-4 sentences."

**Aspect ratio:** Constrained to valid Nano Banana ratios: `1:1, 4:5, 5:4, 3:2, 2:3, 16:9, 9:16`. Fallback to `"4:5"` if missing.

**Generate with Nano Banana:**
- Prompt: `extraction.nano_banana_prompt` from Claude's response
- `image_input`: product hero URLs (when product selected), empty array (when no product)
- Competitor image is NOT passed as reference (avoids creating an identical copy)
- Aspect ratio: `extraction.composition.aspect_ratio`, fallback `"4:5"`

### NDJSON Stream Events

The `analyzed` event shape changes to include the full extraction:

```json
{
  "step": "analyzed",
  "message": "Analysis complete",
  "analysis": {
    "composition": "derived from extraction.composition.layout + framing",
    "colors": "derived from extraction.colors.mood",
    "mood": "derived from extraction.scene.atmosphere",
    "style": "derived from extraction.style.category + feel"
  },
  "extraction": { "...full structured JSON..." },
  "nano_banana_prompt": "the detailed prompt"
}
```

The `analysis` field stays flat (4 strings) for backward compatibility with the UI's Analysis Summary display. The full `extraction` is also included for potential future use (e.g., editable JSON UI).

## Files Changed

| File | Change |
|------|--------|
| `src/app/api/assets/image-swiper/route.ts` | New system prompt with structured JSON schema. Product becomes optional — conditionally skip product DB queries and product context in prompt. Derive flat `analysis` from nested `extraction`. Update aspect ratio path. |
| `src/components/assets/ImageSwiper.tsx` | Product buttons become deselectable (click selected = deselect). API call omits `product` when none selected. Generated image label shows "STYLE" when no product. Save-to-assets omits product when none selected. |

## What Stays The Same

- Streaming NDJSON UI flow (analyzing → analyzed → generating → completed)
- Analysis Summary display format (still flat: composition/colors/mood/style)
- `src/lib/kie.ts` — no changes needed
- Upload flow (drag/paste/URL)

## Design Decisions

- **No competitor image as Nano Banana reference:** Passing the competitor image to `image_input` would push Nano Banana toward an identical copy. The structured JSON captures the style without pixel-level copying.
- **Single Claude call (extraction + prompt):** Claude extracts the structured JSON AND writes the Nano Banana prompt in one call. The JSON forces systematic analysis; the prompt benefits from having all that detail in context. No need for a separate `buildNanaBananaPrompt()` TypeScript function — Claude handles the variability (scenes with/without people, text overlays, different layouts) more naturally.
- **Flat `analysis` preserved for UI:** The NDJSON event includes both the flat 4-string `analysis` (for the existing Analysis Summary component) and the full `extraction` (for future use). No UI changes needed for the summary display.
