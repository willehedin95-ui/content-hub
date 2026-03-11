# Image Swiper V2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Image Swiper to produce much better style-matched images by using structured JSON extraction instead of loose 2-4 sentence prompts, and make product selection optional.

**Architecture:** Single Claude Vision call extracts a detailed structured JSON (`scene`, `composition`, `subjects`, `colors`, `style`) from the competitor image AND writes a rich Nano Banana prompt informed by all that detail. Product selection is optional — when absent, no product context is injected and Nano Banana gets no reference images.

**Tech Stack:** Next.js API route, Anthropic Claude Vision API, Kie.ai Nano Banana API, React (client component)

**Spec:** `docs/superpowers/specs/2026-03-10-image-swiper-v2-design.md`

---

## Chunk 1: API Route — New Prompt + Optional Product

### Task 1: Make product optional in API route

**Files:**
- Modify: `src/app/api/assets/image-swiper/route.ts:17-33` (request parsing)
- Modify: `src/app/api/assets/image-swiper/route.ts:36-73` (conditional DB queries)

- [ ] **Step 1: Update request parsing to make product optional**

In `route.ts`, change the request validation to allow missing `productSlug`. Remove the 400 error for missing product. Wrap all product-related DB queries in a conditional block.

```typescript
// Lines 17-33: Replace the validation block
const body = await req.json().catch(() => ({}));
const {
  image_url,
  product: productSlug,
  notes,
} = body as {
  image_url?: string;
  product?: string;
  notes?: string;
};

if (!image_url) {
  return NextResponse.json({ error: "image_url is required" }, { status: 400 });
}
// product is now optional — no 400 if missing
```

- [ ] **Step 2: Wrap product DB queries in conditional**

Replace lines 36-73 with conditional logic:

```typescript
const db = createServerSupabase();

let product: ProductFull | null = null;
let guidelines: CopywritingGuideline[] = [];
let segments: ProductSegment[] = [];
let productHeroUrls: string[] = [];
let productBrief: string | undefined;

if (productSlug) {
  const { data: productData, error: productErr } = await db
    .from("products")
    .select("*")
    .eq("slug", productSlug)
    .single();

  if (productErr || !productData) {
    return NextResponse.json({ error: `Product "${productSlug}" not found` }, { status: 404 });
  }
  product = productData as ProductFull;

  const { data: guidelinesData } = await db
    .from("copywriting_guidelines")
    .select("*")
    .or(`product_id.eq.${product.id},product_id.is.null`)
    .order("sort_order", { ascending: true });

  guidelines = (guidelinesData ?? []) as CopywritingGuideline[];
  productBrief = guidelines.find((g) => g.name === "Product Brief")?.content;

  const { data: segmentsData } = await db
    .from("product_segments")
    .select("*")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  segments = (segmentsData ?? []) as ProductSegment[];

  const { data: productImages } = await db
    .from("product_images")
    .select("url")
    .eq("product_id", product.id)
    .eq("category", "hero")
    .order("sort_order", { ascending: true });

  productHeroUrls = (productImages ?? []).map((img: { url: string }) => img.url);
}
```

- [ ] **Step 3: Update system prompt call to handle null product**

Update the `buildImageSwiperSystemPrompt` call (line 76-81) to accept null product:

```typescript
const systemPrompt = buildImageSwiperSystemPrompt(
  product,      // now ProductFull | null
  productBrief,
  guidelines,
  segments
);
```

- [ ] **Step 4: Update usage logging for null product**

Update the metadata in both usage log inserts to handle null product:

```typescript
metadata: {
  product: productSlug || null,
},
```

- [ ] **Step 5: Update Nano Banana call to use empty array when no product**

The `createImageTask` call (line 200-205) already receives `productHeroUrls` which will be `[]` when no product. No change needed — just verify this works.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/assets/image-swiper/route.ts
git commit -m "feat(image-swiper): make product selection optional in API"
```

---

### Task 2: Rewrite system prompt with structured JSON extraction

**Files:**
- Modify: `src/app/api/assets/image-swiper/route.ts:250-334` (`buildImageSwiperSystemPrompt`)
- Modify: `src/app/api/assets/image-swiper/route.ts:336-344` (`buildImageSwiperUserPrompt`)

- [ ] **Step 1: Update `buildImageSwiperUserPrompt` for optional product**

The user prompt currently says "with my product" even when no product is selected. Update to accept a `hasProduct` flag:

```typescript
function buildImageSwiperUserPrompt(imageUrl: string, notes?: string, hasProduct?: boolean): string {
  let prompt = hasProduct
    ? "Analyze this competitor image and create a Nano Banana prompt for an adapted version featuring my product."
    : "Analyze this competitor image and create a Nano Banana prompt that recreates this visual style.";

  if (notes) {
    prompt += `\n\n**Additional Notes:** ${notes}`;
  }

  return prompt;
}
```

Update the call site (around line 83) to pass the flag:

```typescript
const userPrompt = buildImageSwiperUserPrompt(image_url, notes, !!productSlug);
```

- [ ] **Step 2: Rewrite `buildImageSwiperSystemPrompt` with structured JSON extraction**

Replace the entire function. Key changes:
- Accept `product: ProductFull | null` (nullable)
- When product is null, omit product context section and change task to "recreate this style"
- When product is present, include product context and task is "adapt for this product"
- Request structured `extraction` JSON + `nano_banana_prompt` in response
- Constrain `aspect_ratio` to valid Nano Banana values
- Instruct Claude to write a detailed multi-sentence prompt using ALL extracted details (specific hex colors, lighting, composition, etc.)
- For subjects with `is_competitor_product: true`: if product selected, Claude replaces with product description; if no product, describes generically

```typescript
function buildImageSwiperSystemPrompt(
  product: ProductFull | null,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[]
): string {
  // Product context block (only when product is selected)
  let productContext = "";
  if (product) {
    const guidelinesText = guidelines
      .map((g) => `### ${g.name}\n${g.content}`)
      .join("\n\n");

    const segmentsText = segments
      .map((s) => {
        const parts = [`### ${s.name}`];
        if (s.description) parts.push(`**Description:** ${s.description}`);
        if (s.core_desire) parts.push(`**Core Desire:** ${s.core_desire}`);
        if (s.core_constraints) parts.push(`**Core Constraints:** ${s.core_constraints}`);
        if (s.demographics) parts.push(`**Demographics:** ${s.demographics}`);
        return parts.join("\n");
      })
      .join("\n\n");

    productContext = `
# Target Product

**Product:** ${product.name}
${product.tagline ? `**Tagline:** ${product.tagline}` : ""}
${product.description ? `**Description:** ${product.description}` : ""}

${productBrief ? `## Product Brief\n${productBrief}\n` : ""}
${product.benefits.length > 0 ? `**Benefits:**\n${product.benefits.map((b) => `- ${b}`).join("\n")}\n` : ""}
${product.usps.length > 0 ? `**USPs:**\n${product.usps.map((u) => `- ${u}`).join("\n")}\n` : ""}
${product.claims.length > 0 ? `**Claims:**\n${product.claims.map((c) => `- ${c}`).join("\n")}\n` : ""}
${product.target_audience ? `**Target Audience:** ${product.target_audience}\n` : ""}
${segmentsText ? `## Customer Segments\n${segmentsText}\n` : ""}
${guidelinesText ? `## Copywriting Guidelines\n${guidelinesText}\n` : ""}`;
  }

  const productTask = product
    ? `Then write a detailed Nano Banana image generation prompt that recreates this visual style but adapted for ${product.name}. For any subject marked "is_competitor_product": true, replace it with ${product.name} — use the product's actual appearance (provided in the product context above), NOT the competitor product's colors or shape.`
    : `Then write a detailed Nano Banana image generation prompt that recreates this visual style with a generic/unbranded product in place of the competitor's.`;

  return `You are an expert visual analyst. Your task has two parts:

1. **Extract** every visual detail from the provided image as structured JSON
2. **Write** a detailed image generation prompt based on that extraction

# Part 1: Structured Visual Extraction

Analyze the image and extract ALL visual details into this exact JSON structure:

\`\`\`json
{
  "extraction": {
    "scene": {
      "setting": "Describe the environment/location",
      "background": "Specific background elements, textures, wall colors with hex codes",
      "lighting": "Light direction, quality (soft/hard/diffused), color temperature (warm/cool), shadow behavior",
      "atmosphere": "Overall environmental feel"
    },
    "composition": {
      "layout": "How the frame is organized (centered, rule-of-thirds, split/diptych, diagonal, etc.)",
      "framing": "Shot type (extreme close-up, close-up, medium, wide, etc.)",
      "focal_point": "What draws the eye and where",
      "negative_space": "How empty space is used",
      "aspect_ratio": "MUST be one of: 1:1, 4:5, 5:4, 3:2, 2:3, 16:9, 9:16"
    },
    "subjects": [
      {
        "type": "person | product | prop | text | graphic",
        "description": "Detailed visual description — age, clothing, expression, material, color with hex codes",
        "position": "Where in the frame (center, top-left, bottom-third, etc.)",
        "action": "What they are doing (if applicable)",
        "is_competitor_product": false
      }
    ],
    "colors": {
      "palette": ["#hex1", "#hex2", "...at least 5 dominant colors"],
      "dominant_tone": "warm | cool | neutral",
      "contrast": "high | medium | low",
      "mood": "What the color palette communicates (e.g., 'Clean clinical whites with warm wood accents')"
    },
    "style": {
      "category": "lifestyle | studio | clinical | native-ad | UGC | editorial | graphic | before-after",
      "feel": "Describe the overall aesthetic in one sentence",
      "texture": "clean | grainy | soft-focus | sharp | matte | glossy"
    }
  }
}
\`\`\`

**Rules for extraction:**
- Use specific hex color codes wherever possible (background colors, product colors, clothing colors)
- For subjects: mark exactly ONE subject as \`"is_competitor_product": true\` — the main product being advertised
- Be precise about lighting direction (e.g., "soft light from upper-left, no harsh shadows")
- Be precise about composition (e.g., "product occupies lower-right third, person upper-left")
${product ? `- Do NOT describe the competitor product's brand name — just its physical appearance` : ""}

# Part 2: Nano Banana Prompt

${productTask}

**Prompt requirements:**
- Write 4-8 detailed sentences (NOT 2-4 vague ones)
- Reference SPECIFIC hex colors from the extraction (e.g., "background color #F5F0E8")
- Describe exact lighting setup from the extraction
- Describe exact composition and framing from the extraction
- Describe the mood and atmosphere
- Do NOT mention "competitor" or "original image" — write it as a standalone creative brief
- Do NOT copy the competitor image — create a NEW image inspired by the same visual principles
${product ? `- The product in the image MUST be ${product.name} with its correct appearance` : "- Use a generic/unbranded product similar in category to the competitor's"}

${productContext}

# Output Format

Return ONLY valid JSON:

\`\`\`json
{
  "extraction": { ... },
  "nano_banana_prompt": "Your detailed 4-8 sentence prompt here"
}
\`\`\`

Do not include markdown fences or extra text outside the JSON.`;
}
```

- [ ] **Step 3: Update response parsing and flat analysis derivation**

Update the parsed type and derive flat `analysis` from nested `extraction` (around lines 132-162):

```typescript
let parsed: {
  extraction: {
    scene: { setting: string; background: string; lighting: string; atmosphere: string };
    composition: { layout: string; framing: string; focal_point: string; negative_space?: string; aspect_ratio: string };
    subjects: Array<{ type: string; description: string; position: string; action?: string; is_competitor_product?: boolean }>;
    colors: { palette: string[]; dominant_tone: string; contrast: string; mood: string };
    style: { category: string; feel: string; texture: string };
  };
  nano_banana_prompt: string;
};
try {
  const cleaned = rawContent
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  parsed = JSON.parse(cleaned);
} catch (parseErr) {
  const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
  console.error("[image-swiper] Parse error:", msg, "\nRaw:", rawContent.slice(0, 500));
  await emit({ step: "error", message: `Failed to parse AI response: ${msg}` });
  await writer.close();
  return;
}

if (!parsed.extraction || !parsed.nano_banana_prompt) {
  await emit({ step: "error", message: "AI response missing required fields" });
  await writer.close();
  return;
}

// Derive flat analysis for UI backward compatibility (optional chaining for safety)
const ext = parsed.extraction;
const flatAnalysis = {
  composition: `${ext.composition?.layout ?? "Unknown layout"}. ${ext.composition?.framing ?? ""}. Focal point: ${ext.composition?.focal_point ?? ""}`,
  colors: ext.colors?.mood ?? "Unknown",
  mood: ext.scene?.atmosphere ?? "Unknown",
  style: `${ext.style?.category ?? "Unknown"}. ${ext.style?.feel ?? ""}`,
};
```

- [ ] **Step 4: Update the analyzed emit and aspect ratio extraction**

Update the `analyzed` emit (around line 184) and aspect ratio (around line 198):

```typescript
await emit({
  step: "analyzed",
  message: "Analysis complete",
  analysis: flatAnalysis,
  extraction: parsed.extraction,
  nano_banana_prompt: parsed.nano_banana_prompt,
});

// Aspect ratio from extraction, fallback to 4:5
const validRatios = ["1:1", "4:5", "5:4", "3:2", "2:3", "16:9", "9:16"];
const rawRatio = (parsed.extraction.composition?.aspect_ratio ?? "").trim();
const detectedRatio = validRatios.includes(rawRatio) ? rawRatio : "4:5";
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/assets/image-swiper/route.ts
git commit -m "feat(image-swiper): structured JSON extraction + richer prompt"
```

---

## Chunk 2: UI — Deselectable Product + Label Updates

### Task 3: Make product buttons deselectable

**Files:**
- Modify: `src/components/assets/ImageSwiper.tsx:45` (state type)
- Modify: `src/components/assets/ImageSwiper.tsx:339-356` (product buttons)

- [ ] **Step 1: Change product state to nullable**

```typescript
// Line 45: Change type and default
const [product, setProduct] = useState<Product | null>(null);
```

- [ ] **Step 2: Update product buttons to toggle on re-click**

Replace lines 339-356:

```typescript
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Adapt for product <span className="text-gray-400 font-normal">(optional)</span>
  </label>
  <div className="flex gap-2">
    {PRODUCTS.map((p) => (
      <button
        key={p.value}
        onClick={() => setProduct(prev => prev === p.value ? null : p.value)}
        className={cn(
          "px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
          product === p.value
            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
            : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
        )}
      >
        {p.label}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Update API call to omit product when null**

In `handleAnalyze` (around line 139), conditionally include product:

```typescript
body: JSON.stringify({
  image_url: imageUrl,
  ...(product && { product }),
  notes: notes.trim() || undefined,
}),
```

- [ ] **Step 4: Commit**

```bash
git add src/components/assets/ImageSwiper.tsx
git commit -m "feat(image-swiper): make product selection optional (click to deselect)"
```

---

### Task 4: Update labels and save-to-assets for null product

**Files:**
- Modify: `src/components/assets/ImageSwiper.tsx:482-489` (generated label)
- Modify: `src/components/assets/ImageSwiper.tsx:192-236` (save handler)

- [ ] **Step 1: Update generated image label**

Replace line 483-484:

```typescript
<p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
  Generated {product ? `(${product === "happysleep" ? "HappySleep" : "Hydro13"})` : "(Style)"}
</p>
```

- [ ] **Step 2: Update download filename**

Replace line 488:

```typescript
download={`image-swiper-${product || "style"}-${Date.now()}.png`}
```

- [ ] **Step 3: Update save-to-assets handler**

In `handleSaveToAssets` (around lines 212-214), conditionally include product:

```typescript
formData.append("name", `Image Swiper${product ? ` - ${product}` : ""} - ${new Date().toLocaleDateString()}`);
formData.append("category", "lifestyle");
if (product) formData.append("product", product);
formData.append("media_type", "image");
```

- [ ] **Step 4: Commit**

```bash
git add src/components/assets/ImageSwiper.tsx
git commit -m "feat(image-swiper): handle null product in labels and save flow"
```

---

## Chunk 3: Test & Verify

### Task 5: Manual end-to-end verification

- [ ] **Step 1: Start dev server**

```bash
# Kill any existing dev server first
lsof -ti:3000 | xargs kill -9 2>/dev/null; npm run dev
```

- [ ] **Step 2: Test with product selected**

Navigate to `/assets` → Swipe Image. Upload a competitor image, select HappySleep, click Analyze & Generate. Verify:
- Analysis shows rich structured data (composition, colors, mood, style)
- Generated image uses correct HappySleep product colors (NOT blue)
- Generated image captures the vibe of the original
- Save to assets works with product name in metadata

- [ ] **Step 3: Test with no product selected**

Click Start Over. Upload the same competitor image, do NOT select any product, click Analyze & Generate. Verify:
- No 400 error from API
- Analysis still shows
- Generated label says "Generated (Style)"
- Save to assets works without product field

- [ ] **Step 4: Test product toggle**

Verify clicking HappySleep selects it, clicking it again deselects it (returns to no product). Same for Hydro13.

- [ ] **Step 5: Build check**

```bash
npm run build
```

Verify no TypeScript errors related to the nullable product type.

- [ ] **Step 6: Final commit and push**

```bash
git push origin main
```

Report the commit hash and summary to the user.
