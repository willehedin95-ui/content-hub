# Competitor Swipe Multi-Image + Variation Count — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users upload multiple competitor images and choose how many visual variations per image, replacing the current single-image/single-output flow.

**Architecture:** UI state changes from single File to File[]. API accepts array of image URLs + count. Claude receives all images in one message, generates `count` variation prompts per image with `source_index`. Generation loop uses `source_index` to pick the correct reference image per prompt.

**Tech Stack:** React (Next.js), Anthropic SDK (Claude Vision), Nano Banana (KIE image gen), Supabase

---

### Task 1: Multi-image state in UI

**Files:**
- Modify: `src/components/brainstorm/BrainstormGenerate.tsx:123-127` (state declarations)

**Step 1: Replace single-image state with arrays**

Change lines 123-125 from:
```tsx
const [competitorImage, setCompetitorImage] = useState<File | null>(null);
const [competitorImagePreview, setCompetitorImagePreview] = useState<string>("");
const [competitorImageUrl, setCompetitorImageUrl] = useState<string>("");
```
To:
```tsx
const [competitorImages, setCompetitorImages] = useState<File[]>([]);
const [competitorImagePreviews, setCompetitorImagePreviews] = useState<string[]>([]);
const [competitorImageUrls, setCompetitorImageUrls] = useState<string[]>([]);
const [variationsPerImage, setVariationsPerImage] = useState(1);
```

**Step 2: Add a helper to add an image (file or URL)**

Add below the state declarations:
```tsx
function addCompetitorFile(file: File) {
  setCompetitorImages((prev) => [...prev, file]);
  setCompetitorImagePreviews((prev) => [...prev, URL.createObjectURL(file)]);
}

function addCompetitorUrl(url: string) {
  if (!url.trim()) return;
  setCompetitorImageUrls((prev) => [...prev, url.trim()]);
}

function removeCompetitorImage(index: number, type: "file" | "url") {
  if (type === "file") {
    setCompetitorImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setCompetitorImages((prev) => prev.filter((_, i) => i !== index));
  } else {
    setCompetitorImageUrls((prev) => prev.filter((_, i) => i !== index));
  }
}
```

**Step 3: Verify no TypeScript errors**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | head -30`
Expected: Errors about references to old state names (competitorImage, etc.) — that's expected, we fix those next.

**Step 4: Commit**
```bash
git add src/components/brainstorm/BrainstormGenerate.tsx
git commit -m "feat: multi-image state for competitor ad swipe"
```

---

### Task 2: Update upload UI for multi-image

**Files:**
- Modify: `src/components/brainstorm/BrainstormGenerate.tsx:820-928` (competitor ad image UI section)

**Step 1: Replace single-image upload UI with multi-image UI**

Replace the entire competitor ad image section (lines ~820-928) with:
- An upload zone that stays visible even after images are added (so you can keep adding)
- A thumbnail grid showing all added images (files + URLs) with individual remove buttons
- URL input that has an "Add" button (adds to array instead of replacing)
- A "Variations per image" number stepper (1-10, default 1)
- A summary line: "{N} images × {V} variations = {total} images"

The upload zone handlers should call `addCompetitorFile(file)` instead of `setCompetitorImage(file)`.
The URL input should call `addCompetitorUrl(url)` on submit and clear the input field.
The file input `onChange` should call `addCompetitorFile(file)` and also support multi-select (`multiple` attribute).
Paste handler should call `addCompetitorFile(file)`.
Drop handler should iterate all dropped files and call `addCompetitorFile` for each.

The thumbnail grid shows both file previews (`competitorImagePreviews[i]`) and URL entries (`competitorImageUrls[i]`) with X buttons calling `removeCompetitorImage(i, type)`.

The variations stepper:
```tsx
<div className="flex items-center gap-3">
  <label className="text-sm font-medium text-gray-700">Variations per image</label>
  <div className="flex items-center gap-1">
    <button
      onClick={() => setVariationsPerImage((v) => Math.max(1, v - 1))}
      className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
    >-</button>
    <input
      type="number"
      min={1}
      max={10}
      value={variationsPerImage}
      onChange={(e) => setVariationsPerImage(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
      className="w-12 text-center rounded-lg border border-gray-200 py-1 text-sm"
    />
    <button
      onClick={() => setVariationsPerImage((v) => Math.min(10, v + 1))}
      className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
    >+</button>
  </div>
</div>
```

Summary line:
```tsx
{totalImages > 0 && (
  <p className="text-xs text-gray-500">
    {totalImages} image{totalImages !== 1 ? "s" : ""} × {variationsPerImage} variation{variationsPerImage !== 1 ? "s" : ""} = {totalImages * variationsPerImage} generated image{totalImages * variationsPerImage !== 1 ? "s" : ""}
  </p>
)}
```

Where `totalImages = competitorImages.length + competitorImageUrls.length`.

**Step 2: Update the generate button disabled condition**

Change line ~1385 from:
```tsx
(mode === "from_competitor_ad" && !competitorImage && !competitorImageUrl.trim())
```
To:
```tsx
(mode === "from_competitor_ad" && competitorImages.length === 0 && competitorImageUrls.length === 0)
```

**Step 3: Verify UI renders without errors**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | head -30`
Expected: May still have errors in `handleGenerate` — those are fixed in Task 3.

**Step 4: Commit**
```bash
git add src/components/brainstorm/BrainstormGenerate.tsx
git commit -m "feat: multi-image upload UI with variations stepper"
```

---

### Task 3: Update handleGenerate to send multiple images

**Files:**
- Modify: `src/components/brainstorm/BrainstormGenerate.tsx:264-298` (competitor ad branch of handleGenerate)

**Step 1: Replace single-image upload logic with multi-image**

Replace lines ~264-298 with:
```tsx
if (mode === "from_competitor_ad" && (competitorImages.length > 0 || competitorImageUrls.length > 0)) {
  const allImageUrls: string[] = [...competitorImageUrls];

  // Initialize progress steps
  setProgressSteps([
    { step: "uploading", message: "Uploading competitor images...", done: false },
  ]);

  // Upload each file to temp storage
  for (const file of competitorImages) {
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await fetch("/api/upload-temp", { method: "POST", body: formData });
    if (!uploadRes.ok) throw new Error("Failed to upload image");
    const uploadData = await uploadRes.json();
    allImageUrls.push(uploadData.url);
  }

  // Mark upload done
  setProgressSteps((prev) =>
    prev.map((s) => (s.step === "uploading" ? { ...s, done: true, message: `${allImageUrls.length} image${allImageUrls.length !== 1 ? "s" : ""} uploaded` } : s))
  );

  // Call brainstorm API with array of URLs
  const res = await fetch("/api/brainstorm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      product,
      count: variationsPerImage,
      competitor_image_urls: allImageUrls,
      competitor_ad_copy: competitorAdCopy || undefined,
    }),
  });
```

Note: The API body field changes from `competitor_image_url` (singular string) to `competitor_image_urls` (string array), and `count` now represents variations-per-image.

**Step 2: Verify TypeScript compiles**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | head -30`
Expected: PASS (or errors only in API route, fixed next)

**Step 3: Commit**
```bash
git add src/components/brainstorm/BrainstormGenerate.tsx
git commit -m "feat: send multiple competitor images to API"
```

---

### Task 4: Update brainstorm API to accept multiple images

**Files:**
- Modify: `src/app/api/brainstorm/route.ts:136-353` (competitor ad code path)

**Step 1: Accept array of image URLs**

Change line ~137 from:
```tsx
const competitorImageUrl: string | undefined = body.competitor_image_url;
```
To:
```tsx
// Support both legacy single URL and new array format
const competitorImageUrls: string[] = body.competitor_image_urls
  ?? (body.competitor_image_url ? [body.competitor_image_url] : []);
```

Update the validation (line ~140):
```tsx
if (competitorImageUrls.length === 0) {
  return NextResponse.json(
    { error: "competitor_image_urls is required for from_competitor_ad mode" },
    { status: 400 }
  );
}
```

Extend the count clamp (line ~45) for competitor ad mode — after mode validation, add:
```tsx
const effectiveCount = mode === "from_competitor_ad"
  ? Math.min(Math.max(body.count ?? 1, 1), 10)
  : count;
```
Use `effectiveCount` in the competitor ad path instead of `count`.

**Step 2: Pass all images to Claude Vision**

Change the Claude messages (line ~187-193) from sending a single image to sending all images:
```tsx
const response = await client.messages.create({
  model: CLAUDE_MODEL,
  max_tokens: 8000,
  temperature: 0.7,
  system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
  messages: [{
    role: "user",
    content: [
      ...competitorImageUrls.map((url, i) => ({
        type: "image" as const,
        source: { type: "url" as const, url },
      })),
      { type: "text" as const, text: userPrompt },
    ],
  }],
});
```

**Step 3: Update the parsed type to include source_index**

Change the `image_prompts` type (line ~222-226):
```tsx
image_prompts: Array<{
  source_index: number;
  prompt: string;
  hook_text: string;
  headline_text: string;
}>;
```

**Step 4: Store array of URLs in pending_competitor_gen**

Change line ~318-321 from:
```tsx
pending_competitor_gen: {
  image_prompts: parsed.image_prompts,
  competitor_image_url: competitorImageUrl,
  product_hero_urls: productHeroUrls,
},
```
To:
```tsx
pending_competitor_gen: {
  image_prompts: parsed.image_prompts,
  competitor_image_urls: competitorImageUrls,
  product_hero_urls: productHeroUrls,
},
```

**Step 5: Update usage log metadata**

Change line ~270-271 to log the array:
```tsx
competitor_image_urls: competitorImageUrls,
competitor_image_count: competitorImageUrls.length,
image_prompts_count: parsed.image_prompts.length,
```

**Step 6: Pass effectiveCount through the user prompt builder**

In the call to `buildBrainstormUserPrompt` (line ~158-163), ensure `count` is `effectiveCount`:
```tsx
const userPrompt = buildBrainstormUserPrompt(
  { ...body, count: effectiveCount },
  segments,
  undefined,
  rejectedConcepts
);
```

**Step 7: Verify TypeScript compiles**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | head -30`

**Step 8: Commit**
```bash
git add src/app/api/brainstorm/route.ts
git commit -m "feat: accept multiple competitor images in brainstorm API"
```

---

### Task 5: Update system prompt for multi-image + variation count

**Files:**
- Modify: `src/lib/brainstorm.ts:956-1094` (buildFromCompetitorAdSystem)

**Step 1: Add parameters for image count**

Change the function signature (line ~956) to accept image count and variations:
```tsx
function buildFromCompetitorAdSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string,
  learningsContext?: string,
  imageCount?: number,
  variationsPerImage?: number
): string {
```

**Step 2: Rewrite the image prompt generation section**

Replace section 5 "NANO BANANA IMAGE PROMPT GENERATION" (lines ~1021-1040) with:

```
### 5. NANO BANANA IMAGE PROMPT GENERATION

You will receive ${imageCount ?? 1} competitor image(s). For EACH image, generate exactly ${variationsPerImage ?? 1} visually distinct Nano Banana prompt(s).

${(imageCount ?? 1) > 1 ? `Since there are ${imageCount} images in this competitor concept, analyze them as a COHESIVE SET. Understand the overall concept, then generate prompts for each image that maintain the set's visual consistency while adapting for our product.` : ""}

Each variation of the same image MUST differ in visual composition — NOT just rewording. Vary these elements across variations:
- Camera angle / framing (close-up, medium shot, wide, overhead, low angle)
- Lighting setup (warm morning light, cool studio, harsh directional, soft diffused)
- Background treatment (different textures, environments, or color temperatures)
- Composition balance (product placement, negative space, asymmetry)

Minor hook text tweaks are encouraged across variations (same core message, different emphasis or wording).

Total image_prompts entries: ${(imageCount ?? 1)} images × ${variationsPerImage ?? 1} variations = ${(imageCount ?? 1) * (variationsPerImage ?? 1)} entries.

Each entry MUST include "source_index" (0-based) indicating which uploaded image it's a variation of.
```

Keep the existing Nano Banana Prompt Rules and prompt structure sections unchanged.

**Step 3: Update the output format section**

Replace the `image_prompts` part of the JSON schema (lines ~1074-1080) with:
```
"image_prompts": [
    {
      "source_index": 0,
      "prompt": "Nano Banana prompt (2-4 dense sentences)...",
      "hook_text": "Main text overlay...",
      "headline_text": "Secondary text line..."
    }
  ]
```

**Step 4: Update the final CRITICAL RULES section**

Change line ~1092 from:
```
- Generate exactly 3-5 entries in the image_prompts array, each with a different hook_text variation
```
To:
```
- Generate exactly ${(imageCount ?? 1) * (variationsPerImage ?? 1)} entries in the image_prompts array
- Each entry MUST have a source_index (0-based) matching the uploaded image it's based on
- For each source image, generate exactly ${variationsPerImage ?? 1} visually distinct variation(s)
```

**Step 5: Update the user prompt for competitor ad mode**

In `buildBrainstormUserPrompt` (line ~1286-1296), change:
```tsx
case "from_competitor_ad": {
  parts.push("## SWIPE: FROM COMPETITOR AD");
  const imgCount = request.competitor_image_urls?.length ?? 1;
  parts.push(
    imgCount > 1
      ? `Analyze the ${imgCount} competitor ad images attached below as a cohesive concept set. Reverse-engineer their visual structure, identify why they work together, and create adapted versions for our product.`
      : "Analyze the competitor ad image attached below. Reverse-engineer its visual structure, identify why it works, and create an adapted version for our product."
  );
  if (request.competitor_ad_copy) {
    parts.push(`\n### COMPETITOR AD COPY (from Meta Ads Library)\n${request.competitor_ad_copy.slice(0, 3000)}`);
    parts.push("Use this copy to understand the competitor's messaging approach. Do NOT copy their claims — adapt the structure and technique for our product.");
  }
  parts.push(`\nGenerate 1 concept. For each of the ${imgCount} image(s), generate ${count} visual variation(s) = ${imgCount * count} total image prompts.`);
  break;
}
```

**Step 6: Wire the new parameters through buildBrainstormSystemPrompt**

Find where `buildFromCompetitorAdSystem` is called (via the mode→builder map, line ~1117) and pass `imageCount` and `variationsPerImage` through. This likely means updating `buildBrainstormSystemPrompt` to accept and forward these params when mode is `from_competitor_ad`.

In the public `buildBrainstormSystemPrompt` function, add optional params:
```tsx
export function buildBrainstormSystemPrompt(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  mode: BrainstormMode,
  hookInspiration?: string,
  learningsContext?: string,
  competitorImageCount?: number,
  variationsPerImage?: number
): string {
```

And in the competitor ad case, pass them through to `buildFromCompetitorAdSystem`.

Then in `route.ts`, pass `competitorImageUrls.length` and `effectiveCount` to the system prompt builder.

**Step 7: Verify TypeScript compiles**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | head -30`
Expected: PASS

**Step 8: Commit**
```bash
git add src/lib/brainstorm.ts src/app/api/brainstorm/route.ts
git commit -m "feat: multi-image + variation count in competitor ad prompt"
```

---

### Task 6: Update generate-competitor route for multi-image references

**Files:**
- Modify: `src/app/api/image-jobs/[id]/generate-competitor/route.ts:45-76`

**Step 1: Support array of competitor image URLs**

Change the destructuring (lines ~45-53) from:
```tsx
const {
  image_prompts,
  competitor_image_url,
  product_hero_urls,
} = job.pending_competitor_gen as {
  image_prompts: Array<{ prompt: string; hook_text: string; headline_text: string }>;
  competitor_image_url: string;
  product_hero_urls: string[];
};
```
To:
```tsx
const pendingGen = job.pending_competitor_gen as {
  image_prompts: Array<{ source_index?: number; prompt: string; hook_text: string; headline_text: string }>;
  competitor_image_urls?: string[];
  competitor_image_url?: string; // legacy single-URL support
  product_hero_urls: string[];
};

const image_prompts = pendingGen.image_prompts;
const competitorImageUrls = pendingGen.competitor_image_urls
  ?? (pendingGen.competitor_image_url ? [pendingGen.competitor_image_url] : []);
const product_hero_urls = pendingGen.product_hero_urls;
```

**Step 2: Use source_index to pick the correct reference image**

Change line ~62 from:
```tsx
const referenceUrls = [competitor_image_url, ...product_hero_urls];
```
To dynamic per-prompt reference selection inside the loop:
```tsx
// Move inside the for loop, before generateImage call:
const sourceIdx = imgPrompt.source_index ?? 0;
const competitorRef = competitorImageUrls[sourceIdx] ?? competitorImageUrls[0];
const referenceUrls = [competitorRef, ...product_hero_urls];
```

Remove the old `const referenceUrls = [competitor_image_url, ...product_hero_urls];` line outside the loop.

**Step 3: Verify TypeScript compiles**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit 2>&1 | head -30`
Expected: PASS

**Step 4: Commit**
```bash
git add src/app/api/image-jobs/[id]/generate-competitor/route.ts
git commit -m "feat: use source_index for per-image reference in competitor generation"
```

---

### Task 7: End-to-end test

**Step 1: Start dev server (check for existing first)**

Run: `lsof -i :3000 | grep LISTEN` — if something is running, kill it first.
Then: `cd "/Users/williamhedin/Claude Code/content-hub" && npm run dev`

**Step 2: Test the flow in the browser**

1. Navigate to `/brainstorm`
2. Select "From Competitor Ad" mode
3. Upload 2 competitor images (drag & drop or paste)
4. Verify both appear as thumbnails with remove buttons
5. Set variations per image to 2
6. Verify summary shows "2 images × 2 variations = 4 images"
7. Add competitor ad copy (optional)
8. Click Generate
9. Verify progress shows "Uploading competitor images..."
10. Verify it redirects to the image job detail page
11. Verify 4 images are generated (polling shows them progressively)

**Step 3: Test single image (regression)**

1. Upload 1 image, 1 variation — should behave like old flow but actually produce output
2. Upload 1 image, 3 variations — should produce 3 visually distinct images

**Step 4: Final commit if any fixes needed**
