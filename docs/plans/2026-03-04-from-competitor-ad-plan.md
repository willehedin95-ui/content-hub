# "From Competitor Ad" Brainstorm Mode — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 7th brainstorm mode that takes a competitor ad image (+ optional ad copy text), analyzes it with Claude Vision, generates adapted concepts with CASH DNA + ad copy, and immediately generates 3-5 static ad images via Nano Banana using the competitor image as a reference.

**Architecture:** New brainstorm mode `from_competitor_ad` that uses Claude's vision capabilities to analyze uploaded competitor ad images. Unlike other brainstorm modes which produce concepts only, this mode also triggers image generation in the same API call — creating a `pipeline_concept`-equivalent `image_job` with source images already generated. The competitor image is sent both to Claude (for analysis) and to Nano Banana (as `image_input` reference alongside the generated prompt).

**Tech Stack:** Next.js API routes, Anthropic SDK (vision), Kie.ai API (Nano Banana 2), Supabase (storage + DB), React (UI components)

---

### Task 1: Add `from_competitor_ad` to type system

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Update BrainstormMode type**

In `src/types/index.ts`, find the `BrainstormMode` type on line 618:
```typescript
export type BrainstormMode = "from_scratch" | "from_organic" | "from_research" | "from_internal" | "unaware" | "from_template" | "from_competitor_ad";
```

**Step 2: Update BrainstormRequest interface**

Find `BrainstormRequest` interface (line 636) and add competitor ad fields:
```typescript
export interface BrainstormRequest {
  mode: BrainstormMode;
  product: Product;
  count: number;
  organic_text?: string;
  research_text?: string;
  segment_id?: string;
  unaware_types?: UnawareAdType[];
  template_ids?: AdTemplate[];
  focus_angles?: Angle[];
  focus_awareness?: AwarenessLevel;
  // From Competitor Ad mode
  competitor_image_url?: string;      // Uploaded competitor ad image URL
  competitor_ad_copy?: string;        // Optional pasted ad copy from competitor
}
```

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add from_competitor_ad brainstorm mode type"
```

---

### Task 2: Build Claude Vision prompt for competitor ad analysis

**Files:**
- Modify: `src/lib/brainstorm.ts`

**Step 1: Add the system prompt builder**

Add a new function `buildFromCompetitorAdSystem` after `buildFromTemplateSystem` (around line 832). This prompt tells Claude to:
1. Analyze the competitor ad image (layout, text placement, colors, typography, visual style)
2. Identify the persuasion technique and awareness level
3. Map to CASH DNA
4. Generate adapted ad copy for our product
5. Generate 3-5 Nano Banana prompts that faithfully reproduce the competitor's visual format with our product

```typescript
function buildFromCompetitorAdSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration);

  return `You are a senior direct-response creative strategist specializing in health & wellness ecommerce for Scandinavian markets. You specialize in analyzing winning competitor ads and reverse-engineering their structure to create adapted versions for different products.

Your superpower: You can look at any winning ad and identify exactly WHY it works — the visual structure, the copywriting technique, the psychological trigger — and reproduce that winning formula for a completely different product.

${CASH_FRAMEWORK}

${COPY_BLOCKS_DEEP}

---

## PRODUCT KNOWLEDGE

${productContext}

---

## YOUR PROCESS

1. ANALYZE the competitor ad image carefully:
   - Visual layout: Where is the text? Where is the image? What's the background?
   - Typography style: Bold? Handwritten? Editorial? Sans-serif? Size hierarchy?
   - Color scheme: What are the dominant colors? Dark or light background?
   - Image style: Product shot? Lifestyle? Native/editorial? UGC? Medical?
   - Text content structure: Headline → subheadline → body → CTA? Or different?
   - Persuasion technique: What makes this ad work? (social proof, fear, curiosity, authority, etc.)

2. MAP to CASH DNA:
   - What awareness level is this ad targeting?
   - What angle does it use?
   - What concept type drives it?
   - What copy blocks are in play?

3. ADAPT for our product:
   - Keep the EXACT same visual structure and layout
   - Replace competitor messaging with our product's benefits, claims, and USPs
   - Maintain the same emotional tone and persuasion technique
   - Write new hooks and headlines that mirror the competitor's style but sell our product

4. CREATE NANO BANANA PROMPTS:
   - Each prompt must describe the visual layout faithfully (same structure as competitor)
   - Include specific details: background color/style, text placement zones, image composition
   - Vary the hook/angle across prompts while keeping the same visual format
   - The competitor image will be provided as a reference image to Nano Banana — your prompt should describe what to change (our product, our text) while the reference image provides the visual DNA

## OUTPUT FORMAT

Generate a JSON object with:
{
  "analysis": {
    "visual_structure": "Description of the competitor ad's layout and design",
    "persuasion_technique": "What makes this ad work psychologically",
    "estimated_awareness_level": "Unaware | Problem Aware | Solution Aware | Product Aware | Most Aware",
    "competitor_copy_summary": "Summary of the competitor's text/messaging approach",
    "aspect_ratio": "1:1 | 4:5 | 9:16 (detected from image)"
  },
  "concept": {
    "concept_name": "Short memorable name (2-5 words)",
    "concept_description": "2-3 sentences describing the adapted concept",
    "cash_dna": {
      "concept_type": "avatar_facts | market_facts | product_facts | psychology_toolkit",
      "angle": "one of the 20 angles",
      "style": "one of the 11 styles",
      "hooks": ["3-5 hook line variations adapted for our product"],
      "awareness_level": "Unaware | Problem Aware | Solution Aware | Product Aware | Most Aware",
      "ad_source": "Swipe (competitor)",
      "copy_blocks": ["Pain: ...", "Proof: ...", etc.],
      "concept_description": "same as outer"
    },
    "ad_copy_primary": ["2-3 primary ad text variations (English, 100-200 words each)"],
    "ad_copy_headline": ["2-3 headline variations (English, max 40 chars each)"],
    "visual_direction": "Detailed description of the visual format to reproduce",
    "differentiation_note": "How this adapts the competitor's approach for our product",
    "suggested_tags": ["competitor-swipe", "2-4 other relevant tags"]
  },
  "image_prompts": [
    {
      "prompt": "Nano Banana prompt (2-4 dense sentences) — MUST describe the same visual layout as the competitor ad but adapted for our product. Subject first, weave details naturally, be specific about lighting/texture/composition, mood last.",
      "hook_text": "The main text to appear on the ad image",
      "headline_text": "Secondary/supporting text (if applicable)"
    }
  ]
}

CRITICAL RULES:
- Generate 3-5 image prompts, each with a DIFFERENT hook but the SAME visual structure as the competitor
- The competitor image will be passed to Nano Banana as a reference — your prompts should describe what changes (our product, our messaging) while the visual layout is preserved via the reference
- NEVER copy competitor claims — only use claims from our product brief
- Write ALL text in English (translation happens later)
- Prompts must follow Nano Banana rules: subject first, 2-4 dense sentences, no bullet points
- If the competitor ad has text overlay, describe WHERE text should appear and what STYLE it should use
- Return ONLY valid JSON, no markdown fences, no explanation text`;
}
```

**Step 2: Register in SYSTEM_BUILDERS map**

Add to the `SYSTEM_BUILDERS` record (line 838-854):
```typescript
from_competitor_ad: buildFromCompetitorAdSystem,
```

**Step 3: Add user prompt handler in buildBrainstormUserPrompt**

Add a new case in the switch statement (after `from_template` case, around line 1013):
```typescript
case "from_competitor_ad": {
  parts.push("## SWIPE: FROM COMPETITOR AD");
  parts.push(
    "Analyze the competitor ad image attached below. Reverse-engineer its visual structure, identify why it works, and create an adapted version for our product."
  );
  if (request.competitor_ad_copy) {
    parts.push(`\n### COMPETITOR AD COPY (from Meta Ads Library)\n${request.competitor_ad_copy.slice(0, 3000)}`);
    parts.push("Use this copy to understand the competitor's messaging approach. Do NOT copy their claims — adapt the structure and technique for our product.");
  }
  parts.push(`\nGenerate 1 concept with ${count} image prompt variations.`);
  break;
}
```

**Step 4: Add mode metadata for UI**

Add to `BRAINSTORM_MODES` array (after `from_template` entry, around line 1091):
```typescript
{
  value: "from_competitor_ad",
  label: "From Competitor Ad",
  description: "Upload a winning competitor ad — AI reproduces its format for your product",
  icon: "Copy",
},
```

**Step 5: Commit**

```bash
git add src/lib/brainstorm.ts
git commit -m "feat: add From Competitor Ad prompt builder and mode metadata"
```

---

### Task 3: Create the API endpoint for competitor ad brainstorm

**Files:**
- Modify: `src/app/api/brainstorm/route.ts`

This is the most complex task. The endpoint needs to:
1. Accept an uploaded image (as a URL from Supabase storage)
2. Send the image to Claude Vision for analysis
3. Parse the response (concept + image prompts)
4. Generate images via Nano Banana (with competitor image as reference)
5. Create an `image_job` with source images
6. Return the job ID

**Step 1: Add `from_competitor_ad` to VALID_MODES**

Line 17-24, add to array:
```typescript
const VALID_MODES: BrainstormMode[] = [
  "from_scratch",
  "from_organic",
  "from_research",
  "from_internal",
  "unaware",
  "from_template",
  "from_competitor_ad",
];
```

**Step 2: Add competitor ad handling in the POST handler**

After the existing prompt-building logic (line ~138), add a branch for `from_competitor_ad` mode. When mode is `from_competitor_ad`:

- Extract `competitor_image_url` and `competitor_ad_copy` from the request body
- Build the system prompt using the existing `buildBrainstormSystemPrompt`
- Build a vision-capable user message with the image as `image_url` content block
- Call Claude with the vision message
- Parse the response into `{ analysis, concept, image_prompts }`
- For each image prompt: call `generateImage()` with `[competitor_image_url, ...productImageUrls]` as references
- Upload generated images to Supabase storage, create `source_images` rows
- Create the `image_job` with concept data
- Return `{ job_id, concept, analysis }`

Key code for the vision message:
```typescript
const messages = [{
  role: "user" as const,
  content: [
    { type: "image" as const, source: { type: "url" as const, url: competitorImageUrl } },
    { type: "text" as const, text: userPrompt },
  ],
}];
```

The response parsing needs a new function since this mode returns a different JSON structure (`analysis` + `concept` + `image_prompts`) rather than the standard `proposals` array.

For image generation, use the existing `generateImage` from `src/lib/kie.ts`:
```typescript
import { generateImage } from "@/lib/kie";
// For each prompt:
const { urls, costTimeMs } = await generateImage(
  prompt.prompt,
  [competitorImageUrl, ...productHeroUrls],  // competitor ad as primary reference
  detectedAspectRatio  // from analysis
);
```

Upload each result to Supabase storage and create source_images rows, same pattern as `generate-static/route.ts`.

**Step 3: Run dev server and test manually**

Run: `npm run dev`
Test: Upload competitor ad via the UI (task 4) or via curl

**Step 4: Commit**

```bash
git add src/app/api/brainstorm/route.ts
git commit -m "feat: handle from_competitor_ad mode in brainstorm API with vision + image generation"
```

---

### Task 4: Build the UI for competitor ad upload in BrainstormGenerate

**Files:**
- Modify: `src/components/brainstorm/BrainstormGenerate.tsx`

**Step 1: Add state for competitor ad inputs**

Add these state variables in the component (around line 63):
```typescript
const [competitorImage, setCompetitorImage] = useState<File | null>(null);
const [competitorImagePreview, setCompetitorImagePreview] = useState<string>("");
const [competitorAdCopy, setCompetitorAdCopy] = useState("");
const [uploadingImage, setUploadingImage] = useState(false);
```

**Step 2: Add the `Copy` icon import**

Add `Copy` to the lucide-react imports (line 1-19).

**Step 3: Add the mode-specific input UI**

After the `from_template` conditional UI block (around line 355), add:
```tsx
{mode === "from_competitor_ad" && (
  <div className="space-y-4">
    {/* Image upload */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Competitor Ad Image
      </label>
      {competitorImagePreview ? (
        <div className="relative inline-block">
          <img
            src={competitorImagePreview}
            alt="Competitor ad"
            className="max-h-64 rounded-xl border border-gray-200"
          />
          <button
            onClick={() => {
              setCompetitorImage(null);
              setCompetitorImagePreview("");
            }}
            className="absolute top-2 right-2 p-1 bg-white/80 rounded-lg border border-gray-200 text-gray-500 hover:text-red-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
          <Upload className="w-6 h-6 text-gray-400 mb-2" />
          <span className="text-sm text-gray-500">
            Drop competitor ad image or click to upload
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setCompetitorImage(file);
                setCompetitorImagePreview(URL.createObjectURL(file));
              }
            }}
          />
        </label>
      )}
    </div>

    {/* Optional ad copy */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Competitor Ad Copy
        <span className="font-normal text-gray-400 ml-1">(optional)</span>
      </label>
      <textarea
        value={competitorAdCopy}
        onChange={(e) => setCompetitorAdCopy(e.target.value)}
        placeholder="Paste the competitor's primary text and headline from Meta Ads Library..."
        className="w-full h-28 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 resize-none"
      />
    </div>
  </div>
)}
```

Also add `Upload` and `X` to the lucide-react imports.

**Step 4: Update handleGenerate to upload image first, then call API**

Modify `handleGenerate` to handle the competitor ad flow:
- When mode is `from_competitor_ad`, first upload the image to Supabase storage (via a small upload API endpoint, or as base64 in the request)
- Pass the uploaded URL in the API call as `competitor_image_url`
- On success, redirect to the image job detail page (not the proposals view)

The simplest approach: create a small API endpoint `/api/upload-temp` that accepts a file and uploads it to Supabase storage, returning the public URL. The brainstorm component then calls this first, then calls `/api/brainstorm` with the URL.

**Step 5: Handle the different response shape**

When mode is `from_competitor_ad`, the API returns `{ job_id, concept, analysis }` instead of `{ proposals }`. Redirect straight to `/images/${data.job_id}` on success (like the approve flow does).

**Step 6: Update the disabled state for the generate button**

Add `from_competitor_ad` to the disabled check:
```typescript
disabled={
  (mode === "from_organic" && !organicText.trim()) ||
  (mode === "from_research" && !researchText.trim()) ||
  (mode === "from_competitor_ad" && !competitorImage)
}
```

**Step 7: Commit**

```bash
git add src/components/brainstorm/BrainstormGenerate.tsx
git commit -m "feat: add competitor ad upload UI to brainstorm page"
```

---

### Task 5: Create temp image upload endpoint

**Files:**
- Create: `src/app/api/upload-temp/route.ts`

A simple endpoint that accepts a multipart form upload, stores it in Supabase storage under a `temp/` prefix, and returns the public URL. This is used by the brainstorm UI to upload the competitor ad image before calling the brainstorm API.

```typescript
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase";
import { STORAGE_BUCKET } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() ?? "png";
  const fileId = crypto.randomUUID();
  const filePath = `temp/${fileId}.${ext}`;

  const db = createServerSupabase();
  const { error } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json(
      { error: `Upload failed: ${error.message}` },
      { status: 500 }
    );
  }

  const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

  return NextResponse.json({ url: data.publicUrl });
}
```

**Step 2: Commit**

```bash
git add src/app/api/upload-temp/route.ts
git commit -m "feat: add temp image upload endpoint for competitor ad swipe"
```

---

### Task 6: Integration test — end to end

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Manual test**

1. Go to `/brainstorm`
2. Select "From Competitor Ad" mode
3. Upload a competitor ad image (screenshot from Meta Ads Library)
4. Optionally paste competitor ad copy
5. Select product (HappySleep)
6. Hit Generate
7. Verify: loading state shows progress
8. Verify: redirects to `/images/{job_id}` on completion
9. Verify: the concept has CASH DNA, adapted ad copy, 3-5 generated images
10. Verify: images look visually similar to the competitor ad's format but with HappySleep content

**Step 3: Fix any issues found during testing**

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: polish from_competitor_ad mode after integration testing"
```

---

## Task Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Add types | `src/types/index.ts` |
| 2 | Claude Vision prompt | `src/lib/brainstorm.ts` |
| 3 | API endpoint | `src/app/api/brainstorm/route.ts` |
| 4 | Upload UI | `src/components/brainstorm/BrainstormGenerate.tsx` |
| 5 | Temp upload endpoint | `src/app/api/upload-temp/route.ts` |
| 6 | Integration test | Manual E2E |

## Key Implementation Notes

- **Claude Vision**: Use `type: "image"` content block with `source: { type: "url", url: "..." }` in the messages array. The Anthropic SDK supports this natively.
- **Nano Banana references**: `createImageTask` already accepts `imageUrls` array — pass `[competitorImageUrl, ...productHeroUrls]` to give it the competitor ad as primary visual reference.
- **Aspect ratio**: Claude should auto-detect from the image. Default to `4:5` if unclear. Pass detected ratio to `generateImage()`.
- **No style system**: This mode bypasses `generateImageBriefs()` and the 8-style system entirely. The Claude Vision prompt generates Nano Banana prompts directly.
- **Parallel generation**: Use `Promise.allSettled` for generating all 3-5 images in parallel (same pattern as `generate-static/route.ts`).
- **Storage cleanup**: Temp uploads should eventually be cleaned up. Not critical for v1 — can add a cron later.
