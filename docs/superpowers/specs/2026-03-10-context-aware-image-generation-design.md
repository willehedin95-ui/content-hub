# Context-Aware Image Generation for Page Builder

## Problem

When a competitor page is swiped, the text gets rewritten for the target product (e.g. HappySleep), but images remain from the competitor (e.g. reindeer anatomy diagrams from Primal Viking). The current "AI Analyze" + "Generate Replacement" flow has three issues:

1. **Prompt copies the competitor image** rather than adapting the concept for HappySleep
2. **Too many clicks** — analyze, review prompt, generate is 3 steps
3. **No surrounding text context** — the rewritten text says "Premium memory foam core holds its shape for years" but the image generator doesn't know this; it only sees the reindeer image

## Solution

A single "Generate for [Product]" button that extracts surrounding rewritten text from the page, combines it with the original image's visual structure, and generates a product-relevant replacement in one click.

## Flow

### Step 1: Extract context from iframe (client-side)

When the user clicks "Generate for HappySleep":

1. Find the clicked `<img>` element in the iframe by its index
2. Walk up the DOM to find the nearest section-level container:
   - Look for `<section>`, `<article>`, or element with `section`/`block`/`container` in class/ID
   - Stop at 3 levels up if no semantic container found
3. Extract all text content within that container (headings, paragraphs, list items)
4. Cap at ~500 words, prioritizing text closest to the image
5. Send as `surroundingText` alongside the image URL

### Step 2: Smart prompt generation (server-side, GPT-4o Vision)

New API endpoint `POST /api/builder/generate-image` receives:
- `imageSrc` — the original competitor image URL
- `surroundingText` — rewritten text extracted from the page
- `productId` — target product (e.g. "happysleep")
- `pageId` — for usage tracking

Server-side:
1. Fetch product brief + product bank reference images (hero & detail categories)
2. Call GPT-4o Vision with a system prompt that:
   - Analyzes the original image's **visual structure only** (composition, layout, infographic vs lifestyle vs product shot, callout positions, color scheme)
   - Reads the surrounding text to understand what this image **should** depict
   - Reads the product brief for brand knowledge
   - Writes a Nano Banana Pro prompt that recreates the same visual structure with content relevant to the product and surrounding text
   - Never references the competitor's product in the output prompt

### Step 3: Generate image (Kie.ai Nano Banana Pro)

Same pipeline as current flow:
1. Send prompt + product bank reference images to Kie.ai
2. Poll for result (exponential backoff, max ~280s)
3. Download image, upload to Supabase Storage (`translated-images/swiper-generated/`)
4. Return public URL

### Step 4: Place in canvas

1. Call `swapImageInIframe()` to replace the image `src` in the iframe
2. Call `markDirty()` to mark page as unsaved
3. Populate the prompt textarea with the generated prompt (so user can see what was used and tweak + re-generate if needed)

## UI Changes

### ImagePanel layout

```
+---------------------------+
|  [Image Preview]          |
|                           |
|  +---------------------+ |
|  | Generate for         | |  <-- NEW primary button, purple/gradient
|  | HappySleep           | |
|  +---------------------+ |
|                           |
|  --- or edit manually --- |  <-- subtle divider
|                           |
|  PROMPT       [AI Analyze]|  <-- existing, now secondary
|  +---------------------+ |
|  | textarea...          | |
|  +---------------------+ |
|  [Generate Replacement]   |  <-- existing purple button
|                           |
|  [Upload Image]           |
|  [Product Bank]           |
+---------------------------+
```

- "Generate for [Product]" is the primary action — large, prominent
- Divider separates one-click from manual flow
- Everything below the divider is unchanged (existing behavior preserved)

### Loading state

While generating (~15-30 seconds):
- Button shows spinner + "Analyzing image..." then "Generating..."
- Image preview shows a subtle pulse/skeleton animation
- User can still click other images or navigate (generation continues in background, result applied when ready)

## API Endpoint

### `POST /api/builder/generate-image`

**Request:**
```typescript
{
  imageSrc: string;          // Original competitor image URL
  surroundingText: string;   // Rewritten text near the image (~500 words max)
  productId: string;         // e.g. "happysleep"
  pageId?: string;           // For usage tracking
}
```

**Response:**
```typescript
{
  imageUrl: string;          // Public URL of generated image in Supabase
  prompt: string;            // The Nano Banana prompt that was used
  analysis: string;          // Brief description of what GPT-4o saw
}
```

**Server-side steps:**
1. Fetch product from DB (with brief, guidelines, product images)
2. Filter product images to hero + detail categories for reference
3. Call GPT-4o Vision with:
   - System: instructions for visual structure analysis + product adaptation
   - User: original image + surrounding text + product name
4. Parse response to get Nano Banana prompt
5. Call `generateImage()` from `src/lib/kie.ts` with prompt + reference images
6. Upload result to Supabase Storage
7. Log usage (`type: "builder_image_generation"`)
8. Return URL + prompt + analysis

### GPT-4o System Prompt (key sections)

```
You analyze competitor advertorial images and create image generation prompts adapted for a different product.

STEP 1 — VISUAL STRUCTURE ANALYSIS
Look at the original image and identify:
- Layout type (infographic with callouts, lifestyle photo, product shot, comparison chart, etc.)
- Composition (centered subject, split layout, grid of items, etc.)
- Visual style (photography, illustration, flat design, realistic render)
- Color palette and mood
- Text overlay positions and style (if any)

STEP 2 — CONTENT FROM SURROUNDING TEXT
Read the surrounding text to understand what this section of the page is about.
This text has already been rewritten for [ProductName] — use it as the PRIMARY guide
for what the image should depict.

STEP 3 — WRITE NANO BANANA PROMPT
Create an image generation prompt that:
- Recreates the SAME visual structure/layout from Step 1
- Depicts content relevant to [ProductName] based on the surrounding text from Step 2
- Uses product details from the product brief
- NEVER mentions or visually references the competitor's product
```

## Files to create/modify

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/builder/generate-image/route.ts` | Create | New combined analyze+generate endpoint |
| `src/components/pages/ImagePanel.tsx` | Modify | Add "Generate for [Product]" button, context extraction, loading states |
| `src/app/api/preview/[id]/route.ts` | Modify | Extend iframe postMessage to include surrounding text on image click |

## What stays unchanged

- Upload Image, Product Bank, Asset Bank buttons
- Manual "AI Analyze" + "Generate Replacement" flow (kept as advanced option)
- `src/lib/kie.ts` — same Nano Banana Pro wrapper
- `swapImageInIframe()` — same image placement
- Supabase Storage bucket and path conventions
- Usage logging structure (new type: `builder_image_generation`)

## Cost per generation

- GPT-4o Vision call: ~$0.01-0.03 (image + text input)
- Nano Banana Pro: $0.09
- Total: ~$0.10-0.12 per image
