# Context-Aware Image Generation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click "Generate for [Product]" button in the page builder that extracts surrounding rewritten text, analyzes the competitor image's visual structure, and generates a product-relevant replacement.

**Architecture:** Client-side context extraction from iframe DOM → new combined API endpoint that calls GPT-4o Vision (with surrounding text + image + product brief) to generate a Nano Banana prompt → Kie.ai image generation → Supabase storage → swap in iframe. Existing manual flow (AI Analyze + Generate Replacement) preserved as advanced option.

**Tech Stack:** Next.js API route, OpenAI GPT-4o Vision, Kie.ai Nano Banana Pro, Supabase Storage

**Spec:** `docs/superpowers/specs/2026-03-10-context-aware-image-generation-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app/api/builder/generate-image/route.ts` | Create | Combined analyze+generate endpoint |
| `src/components/pages/ImagePanel.tsx` | Modify | Add "Generate for [Product]" button, context extraction, two-phase loading state |
| `src/app/api/preview/[id]/route.ts` | Modify | Extend iframe postMessage to include surrounding text on image click |

---

## Task 1: Extend iframe postMessage to include surrounding text

**Files:**
- Modify: `src/app/api/preview/[id]/route.ts:75-91`

The iframe script already sends `cc-image-click` messages when an image is clicked. We need to add `surroundingText` to that message by walking up the DOM from the clicked image.

- [ ] **Step 1: Add context extraction function to the iframe script**

In `src/app/api/preview/[id]/route.ts`, add a `getSurroundingText` function inside the IIFE (before the click handler at line 76). This function walks up from the image element to find a section-level container, then extracts text content capped at 500 words.

Add this before the `document.addEventListener('click', ...)` block (before line 76):

```javascript
  // Extract surrounding text for context-aware image generation
  function getSurroundingText(img) {
    var sectionTags = ['SECTION', 'ARTICLE', 'MAIN'];
    var sectionClasses = /section|block|container|wrapper|row|col/i;
    var el = img.parentElement;
    var container = null;
    var depth = 0;

    // Walk up max 5 levels looking for a section-level container
    while (el && depth < 5) {
      if (sectionTags.indexOf(el.tagName) !== -1 || sectionClasses.test(el.className || '')) {
        container = el;
        break;
      }
      el = el.parentElement;
      depth++;
    }

    // Fallback: use parent of parent (grandparent) if no semantic container found
    if (!container) {
      container = img.parentElement && img.parentElement.parentElement
        ? img.parentElement.parentElement
        : img.parentElement;
    }

    if (!container) return '';

    // Gather text from headings and paragraphs within the container
    var textEls = container.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,span,td,th');
    var texts = [];
    var wordCount = 0;
    for (var i = 0; i < textEls.length; i++) {
      var t = (textEls[i].textContent || '').trim();
      if (!t) continue;
      var words = t.split(/\s+/).length;
      if (wordCount + words > 500) break;
      texts.push(t);
      wordCount += words;
    }
    return texts.join(' \\n ');
  }
```

- [ ] **Step 2: Include surroundingText in the postMessage**

In the same file, modify the image click handler (lines 83-89) to include `surroundingText`:

Change the `window.parent.postMessage` call to:

```javascript
      window.parent.postMessage({
        type: 'cc-image-click',
        src: img.src,
        index: allImgs.indexOf(img),
        width: img.naturalWidth || img.offsetWidth || 200,
        height: img.naturalHeight || img.offsetHeight || 200,
        surroundingText: getSurroundingText(img)
      }, ORIGIN);
```

- [ ] **Step 3: Update BuilderContext to pass surroundingText through**

In `src/components/builder/BuilderContext.tsx`, the `handleMessage` function (line 1773-1788) sets `clickedImage`. Add `surroundingText` to the `ClickedMedia` interface and the state setter.

Find the `cc-image-click` handler and add `surroundingText`:

```typescript
      if (e.data?.type === "cc-image-click") {
        setClickedVideo(null);
        setClickedImage({
          src: e.data.src,
          index: e.data.index,
          width: e.data.width,
          height: e.data.height,
          surroundingText: e.data.surroundingText || "",
        });
```

Also add `surroundingText: string;` to the `ClickedMedia` interface (around line 43-48 of BuilderContext.tsx).

- [ ] **Step 4: Update ImagePanel's ClickedImage interface**

In `src/components/pages/ImagePanel.tsx`, add `surroundingText` to the local `ClickedImage` interface (line 18-23):

```typescript
interface ClickedImage {
  src: string;
  index: number;
  width: number;
  height: number;
  surroundingText?: string;
}
```

- [ ] **Step 5: Build and verify no type errors**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/api/preview/[id]/route.ts src/components/builder/BuilderContext.tsx src/components/pages/ImagePanel.tsx
git commit -m "feat(builder): extract surrounding text on image click for context-aware generation"
```

---

## Task 2: Create the combined API endpoint

**Files:**
- Create: `src/app/api/builder/generate-image/route.ts`

This endpoint combines GPT-4o Vision analysis with Nano Banana image generation in a single call. It receives the competitor image, surrounding text, and product ID, then returns a generated image URL.

- [ ] **Step 1: Create the API route file**

Create `src/app/api/builder/generate-image/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { generateImage } from "@/lib/kie";
import { OPENAI_MODEL, STORAGE_BUCKET } from "@/lib/constants";
import type { ProductImage } from "@/types";

export const maxDuration = 300;

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function buildSystemPrompt(productName: string, productBrief: string): string {
  return `You are an expert visual designer who creates image generation prompts for ecommerce landing pages.

You will receive:
1. A competitor image from an advertorial landing page
2. The surrounding text from the page (already rewritten for ${productName})
3. Product information about ${productName}

Your job is to write a Nano Banana Pro image generation prompt that creates a replacement image.

## STEP 1: VISUAL STRUCTURE ANALYSIS

Analyze the competitor image's visual structure ONLY:
- Layout type: infographic with callouts, lifestyle photo, product shot, comparison chart, diagram, testimonial card, etc.
- Composition: centered subject, split layout, grid of items, overlaid text boxes, etc.
- Visual style: photography, illustration, flat design, realistic render, medical diagram
- Color palette and mood
- Text overlay positions and style (if any)

## STEP 2: CONTENT FROM SURROUNDING TEXT

Read the surrounding text carefully. This text has been rewritten for ${productName} — it tells you what this section of the page is about NOW, not what the competitor's image showed.

Use the surrounding text as the PRIMARY guide for what the image should depict.

## STEP 3: PRODUCT KNOWLEDGE

${productBrief}

## STEP 4: WRITE THE PROMPT

Create an image generation prompt that:
- Recreates the SAME visual structure/layout from Step 1 (if the original was an infographic with callouts, make an infographic with callouts; if lifestyle, make lifestyle)
- Depicts content relevant to ${productName} based on the surrounding text
- Uses product-accurate details (it's a white ergonomic cervical pillow with contoured shape, central head depression, and raised cervical support edges)
- Matches Scandinavian aesthetic: clean, natural, authentic — not overly polished or American stock-photo-like
- NEVER mentions or visually references the competitor's product

If the original image had text overlays, describe what text should appear but note "Include text overlay: [text]" — the image generator handles this.

## OUTPUT FORMAT

Return JSON with exactly these fields:
{
  "visual_structure": "One sentence describing the original image's layout/composition type",
  "content_match": "One sentence describing what the replacement should show based on surrounding text",
  "prompt": "The full Nano Banana Pro image generation prompt"
}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { imageSrc, surroundingText, productId, pageId } = body as {
    imageSrc: string;
    surroundingText: string;
    productId: string;
    pageId?: string;
  };

  if (!imageSrc || !productId) {
    return NextResponse.json(
      { error: "imageSrc and productId are required" },
      { status: 400 }
    );
  }

  if (!isValidUUID(productId)) {
    return NextResponse.json(
      { error: "Invalid product ID" },
      { status: 400 }
    );
  }

  const openai = getOpenAI();
  const db = createServerSupabase();

  // Load product data
  const [productResult, imagesResult, briefResult] = await Promise.all([
    db.from("products").select("name, slug").eq("id", productId).single(),
    db
      .from("product_images")
      .select("*")
      .eq("product_id", productId)
      .in("category", ["hero", "detail"])
      .order("sort_order", { ascending: true }),
    db
      .from("copywriting_guidelines")
      .select("content")
      .eq("product_id", productId)
      .eq("type", "product_brief")
      .single(),
  ]);

  if (productResult.error || !productResult.data) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const productName = productResult.data.name;
  const productBrief = briefResult.data?.content || `${productName} — an ergonomic cervical pillow designed for better sleep.`;
  const referenceImages = ((imagesResult.data ?? []) as ProductImage[]).map(
    (img) => img.url
  );

  try {
    // Step 1: GPT-4o Vision — analyze image + surrounding text → Nano Banana prompt
    const userParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" | "low" } }> = [
      {
        type: "image_url" as const,
        image_url: { url: imageSrc, detail: "high" as const },
      },
    ];

    let textContent = `Analyze this competitor image and create a replacement prompt for ${productName}.`;
    if (surroundingText?.trim()) {
      textContent += `\n\n**Surrounding text on the page (already rewritten for ${productName}):**\n${surroundingText.trim()}`;
    }
    userParts.unshift({ type: "text" as const, text: textContent });

    const visionResponse = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(productName, productBrief) },
        { role: "user", content: userParts },
      ],
    });

    const visionContent = visionResponse.choices[0]?.message?.content;
    if (!visionContent) throw new Error("No response from image analysis");

    let parsed: { visual_structure: string; content_match: string; prompt: string };
    try {
      // Strip markdown fences if present (Claude Haiku quirk applies to GPT too sometimes)
      const cleaned = visionContent.replace(/^```json\s*\n?|\n?```$/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    if (!parsed.prompt) throw new Error("AI response missing prompt field");

    // Step 2: Generate image via Kie.ai
    const { urls, costTimeMs } = await generateImage(
      parsed.prompt,
      referenceImages,
      "4:5"
    );

    if (!urls?.length) throw new Error("No image generated");

    // Step 3: Download and upload to Supabase
    const imageRes = await fetch(urls[0]);
    if (!imageRes.ok) {
      throw new Error(`Failed to download generated image: ${imageRes.status}`);
    }
    const buffer = Buffer.from(await imageRes.arrayBuffer());

    const filePath = `swiper-generated/${Date.now()}-${crypto.randomUUID()}.png`;
    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: urlData } = db.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    // Log usage
    await db.from("usage_logs").insert({
      type: "builder_image_generation",
      model: "nano-banana-pro",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0.12, // ~$0.03 GPT-4o + $0.09 Kie.ai
      metadata: {
        source: "builder",
        original_src: imageSrc,
        has_surrounding_text: !!surroundingText?.trim(),
        generation_time_ms: costTimeMs,
        reference_count: referenceImages.length,
        page_id: pageId || null,
        product_id: productId,
      },
    });

    return NextResponse.json({
      imageUrl: urlData.publicUrl,
      prompt: parsed.prompt,
      analysis: `${parsed.visual_structure}. ${parsed.content_match}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    console.error("[Builder Generate Image Error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build and verify no type errors**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/builder/generate-image/route.ts
git commit -m "feat(builder): add combined analyze+generate API endpoint"
```

---

## Task 3: Add "Generate for [Product]" button to ImagePanel

**Files:**
- Modify: `src/components/pages/ImagePanel.tsx`

Add the one-click button above the existing manual flow, with a divider between them. The button calls the new `/api/builder/generate-image` endpoint and shows two-phase loading state.

- [ ] **Step 1: Add the Sparkles icon import and new state**

In `src/components/pages/ImagePanel.tsx`, add `Sparkles` to the lucide-react imports (line 3-15):

```typescript
import {
  Image as ImageIcon,
  ArrowLeft,
  Loader2,
  X,
  ZoomIn,
  Upload,
  Undo2,
  Wand2,
  Check,
  ImagePlus,
  Sparkles,
} from "lucide-react";
```

Add a new state variable for the smart generation phase, after `analyzing` state (line 75):

```typescript
  const [smartGenerating, setSmartGenerating] = useState(false);
  const [smartPhase, setSmartPhase] = useState<"analyzing" | "generating">("analyzing");
```

- [ ] **Step 2: Add the handleSmartGenerate function**

Add this function after the `handleAnalyze` function (after line 276):

```typescript
  /** One-click: analyze context + generate replacement in one call */
  async function handleSmartGenerate() {
    if (!clickedImage || !productData) return;

    const imageToProcess = { ...clickedImage };

    setError("");
    setSmartGenerating(true);
    setSmartPhase("analyzing");
    onImageTranslating?.(true);

    try {
      // Brief delay then switch to "generating" phase for UX
      const phaseTimer = setTimeout(() => setSmartPhase("generating"), 8000);

      const res = await fetch("/api/builder/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageSrc: imageToProcess.src,
          surroundingText: imageToProcess.surroundingText || "",
          productId: productData.id,
        }),
      });

      clearTimeout(phaseTimer);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const { imageUrl, prompt: usedPrompt, analysis } = await res.json();

      // Show the prompt that was used (so user can tweak and re-generate manually)
      setPrompt(usedPrompt);

      swapImageInIframe(imageToProcess.index, imageUrl);
      onClickedImageClear();
    } catch (err) {
      console.error("Smart image generation failed:", err);
      setError(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setSmartGenerating(false);
      onImageTranslating?.(false);
    }
  }
```

- [ ] **Step 3: Add the button and divider to the JSX**

In the JSX, after the mode tabs section (after line 450, the closing `{canTranslate && (...)}`), and before the prompt area (line 452 `{/* Prompt area */}`), add the smart generate button. This button only shows in "replace" mode (or when `isSource` is true, meaning there are no translate/replace tabs):

```tsx
      {/* Smart one-click generate (only in replace mode or source editor) */}
      {(mode === "replace" || isSource) && productData && (
        <>
          <button
            onClick={handleSmartGenerate}
            disabled={uploading || generating || analyzing || smartGenerating}
            className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white text-xs font-semibold py-3 rounded-lg transition-all shadow-sm"
          >
            {smartGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {smartPhase === "analyzing" ? "Analyzing image..." : "Generating replacement..."}
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Generate for {productData.images[0] ? productData.id.slice(0, 0) : ""}
                {pageProduct === "happysleep" ? "HappySleep" : pageProduct === "hydro13" ? "Hydro13" : "Product"}
              </>
            )}
          </button>

          <div className="flex items-center gap-2 text-[10px] text-gray-300 uppercase tracking-wider">
            <div className="flex-1 border-t border-gray-200" />
            or edit manually
            <div className="flex-1 border-t border-gray-200" />
          </div>
        </>
      )}
```

- [ ] **Step 4: Disable existing buttons while smart generating**

Update the existing "Generate Replacement" button (line 502-512) to also be disabled during smart generation. Change the `disabled` prop:

```tsx
          disabled={uploading || generating || analyzing || smartGenerating || !prompt.trim()}
```

Also update the "AI Analyze" button (line 459-471) disabled prop:

```tsx
              disabled={analyzing || smartGenerating}
```

- [ ] **Step 5: Build and verify no type errors**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/pages/ImagePanel.tsx
git commit -m "feat(builder): add one-click 'Generate for Product' button with context-aware generation"
```

---

## Task 4: Build verification and final commit

- [ ] **Step 1: Full build check**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run tests**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npm test`
Expected: All tests pass (27/27)

- [ ] **Step 3: Final commit if any fixes were needed**

If any fixes were required during build/test, commit them:

```bash
git add -A
git commit -m "fix(builder): address build/test issues for context-aware image generation"
```
