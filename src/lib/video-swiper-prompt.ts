import { buildProductContext } from "@/lib/brainstorm";
import type { ProductFull, CopywritingGuideline, ProductSegment } from "@/types";

/**
 * Build the Claude Vision system prompt for analyzing competitor product videos
 * and generating Kling AI prompts to recreate them (optionally with our product).
 */
export function buildVideoSwiperSystemPrompt(
  product: ProductFull | null,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[]
): string {
  const hasProduct = !!product;

  const productSection = hasProduct
    ? `## OUR PRODUCT
${buildProductContext(product, productBrief, guidelines, segments)}`
    : "";

  const productName = product?.name ?? "the target product";

  const productDescription = hasProduct
    ? `describe ${productName} as a contoured ergonomic memory foam pillow, butterfly-shaped, light blue color with raised cervical support edges`
    : "describe the product generically based on the original video's product type";

  return `You are a video production specialist and Kling AI prompt engineer. You analyze competitor product videos and write precise Kling 3.0 prompts to recreate the same video concept${hasProduct ? ` using ${productName} instead` : " in the same visual style"}.

${productSection}

## YOUR TASK

You will receive sequential frames extracted from a competitor's product video. Your goal:
1. Understand exactly what's happening visually in the video
2. Write Kling 3.0 prompts that recreate the SAME video concept${hasProduct ? ` but featuring ${productName}` : " with the same visual style and composition"}

These prompts will be sent directly to Kling 3.0 for automatic video generation. They must be production-ready.

## VIDEO ANALYSIS

Analyze each frame carefully:
- **Layout**: Split screen, side by side, before/after, single shot
- **Subjects**: People, products, body parts, props — what are they doing?
- **Visual effects**: Glows, arrows, icons, highlights, overlays, animations
- **Camera**: Static, zoom, pan, tracking, angle
- **Lighting**: Studio, natural, dramatic, soft
- **Color palette**: Warm/cool tones, specific accent colors
- **Motion**: What moves and how — slow reveal, quick transition, gradual zoom
- **Composition**: Where is the product placed? How big? What's in focus?

## KLING 3.0 PROMPT RULES

Kling 3.0 generates video clips from text prompts. It CAN render:
- Visual effects (glows, highlights, color overlays)
- Icons and simple graphics (X marks, checkmarks, arrows)
- Text overlays and labels
- Split-screen and side-by-side compositions
- Before/after transitions
- Product close-ups and demonstrations
- People with realistic expressions and movements

Write prompts that are:
1. **Extremely visual and specific** — describe exactly what the camera sees
2. **One continuous shot per prompt** — each prompt = one camera movement/scene
3. **Include EVERYTHING in the prompt** — text overlays, icons, visual effects, split screens. Kling handles all of it.
4. **Detailed about**:
   - Camera: "static top-down shot" or "slow dolly forward" (be specific)
   - Subject: exact appearance, position, clothing, expression, action
   - Product: ${productDescription}
   - Environment: bedding, lighting, background
   - Motion: what changes during the clip
   - Effects: any glows, highlights, icons, text that should appear
5. **2-4 dense sentences per prompt**
6. Camera keywords: static shot, pan left/right, tilt up/down, dolly in/out, zoom in/out, tracking shot, crane up/down, handheld, orbit, slow motion

## SINGLE vs MULTI-PROMPT

- **single**: Simple video (one continuous shot, one scene). Write ONE prompt. This generates one 15-second clip.
- **multi**: Complex video (multiple distinct scenes, before/after with clear cuts). Write one prompt per scene. Each becomes a separate clip that gets stitched together automatically.

Prefer **single** when possible — it produces more cohesive results.

## KEYFRAME PROMPT

For each scene, you must also write a **keyframe_prompt** — a description of the FIRST FRAME of that scene as a still image. This is used to generate a reference keyframe${hasProduct ? " with our product" : ""} before the video is created.

keyframe_prompt rules:
- Describe a STATIC scene — no motion, no camera movement, no "zooms" or "pans"
${hasProduct ? `- Include our product (${productName}) clearly visible in the composition` : "- Include the product clearly visible in the composition"}
- Match the exact lighting, angle, and composition of the first frame of the scene
- Include all visual elements: text overlays, split-screen layout, background, props
- 1-2 sentences, very specific about what the image looks like

## OUTPUT FORMAT

Return valid JSON only (no markdown fences):

{
  "analysis": {
    "video_type": "before_after | product_demo | lifestyle | comparison | testimonial | unboxing | animation | explainer",
    "duration_estimate": "Xs",
    "description": "One paragraph describing exactly what happens in the video"
  },
  "prompt_strategy": "single | multi",
  "prompts": [
    {
      "scene_number": 1,
      "description": "Brief description of what this scene shows",
      "keyframe_prompt": "Static image description of the first frame — used to generate a reference keyframe${hasProduct ? " with our product" : ""}",
      "kling_prompt": "The full Kling 3.0 prompt with all visual details, effects, text, icons included"
    }
  ]
}

CRITICAL:
- Return ONLY valid JSON, no markdown fences
- Include ALL visual elements directly in the kling_prompt (text, icons, effects — Kling renders everything)
- The keyframe_prompt must describe a STILL IMAGE (no motion words), the kling_prompt describes the VIDEO (with motion)
${hasProduct ? `- Describe ${productName} accurately: contoured butterfly-shaped ergonomic memory foam pillow, light blue` : "- Describe the product based on the visual style seen in the frames"}
- NEVER invent medical claims${hasProduct ? " — only use claims from the product brief" : ""}
- NEVER include the competitor's brand name in prompts
- **NEVER include logos, brand tags, watermarks, or branded overlays** in prompts — the generated video must be clean with no branding`;
}

/**
 * Build the user prompt with frame references.
 */
export function buildVideoSwiperUserPrompt(
  frameCount: number,
  frameTimestamps: number[],
  videoDuration: number,
  notes?: string
): string {
  const timestampList = frameTimestamps
    .map((t) => `${t.toFixed(1)}s`)
    .join(", ");

  let prompt = `Here are ${frameCount} frames extracted from a competitor's product video (${Math.round(videoDuration)}s long).

Frame timestamps (in chronological order): ${timestampList}

Analyze exactly what's happening visually and write Kling 3.0 prompts to recreate this video. The prompts will be sent directly to Kling for automatic generation.`;

  if (notes?.trim()) {
    prompt += `\n\nMy notes:\n${notes.trim()}`;
  }

  return prompt;
}
