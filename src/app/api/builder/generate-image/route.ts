import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { generateImage } from "@/lib/kie";
import { CLAUDE_MODEL, STORAGE_BUCKET } from "@/lib/constants";
import { calcClaudeCost } from "@/lib/pricing";
import type { ProductImage } from "@/types";

export const maxDuration = 300;

/**
 * Claude Vision structured extraction prompt — identical to the Assets image swiper.
 * Extracts visual structure as JSON so Nano Banana can faithfully recreate it.
 */
function buildSystemPrompt(): string {
  return `You are an expert visual analyst. Extract every visual detail from the provided image as structured JSON. This JSON will be passed directly to an image generation model, so be extremely precise and detailed.

# CRITICAL: Camera Perspective & Human Actions

The MOST IMPORTANT thing to get right is the camera perspective and what any people are doing. These are the #1 cause of bad generations. Ask yourself:

- **Who is taking this photo?** Is it a first-person POV (photographer holding/showing something)? A selfie? A third-person shot? A tripod/studio shot?
- **What are the hands/body ACTUALLY doing?** "Hand touching pillow" is NOT the same as "person holding pillow out in front of them over a bed, first-person POV". Be specific about the exact action and body position.
- **Where is the camera relative to the scene?** Eye-level? Looking down at a surface? Looking up? Held at arm's length?

Examples of BAD vs GOOD descriptions:
- BAD: "Medium shot from above, bird's eye perspective looking down at bed surface"
- GOOD: "First-person POV — person holding the pillow with one hand, arm extended forward over their bed, camera at chest height looking slightly down at the pillow and bed below"
- BAD: "Person with hand on pillow"
- GOOD: "Person's left hand gripping the side of the pillow, holding it up at arm's length in front of them — only the hand and forearm are visible, rest of body is behind camera"

# Photo Quality & Naturalness

Describe the ACTUAL quality level of the image — do NOT assume studio perfection:
- Is it a casual phone photo with natural imperfections?
- Slightly overexposed or underexposed?
- Is the focus soft or slightly off?
- Does it look like a professional shoot or a real person's photo?
- Is the lighting natural/ambient or carefully set up?

This matters because the generated image should match the same quality level — a casual UGC-style photo should NOT become a studio-perfect shot.

# Structured Visual Extraction

Analyze the image and extract ALL visual details into this exact JSON structure:

\`\`\`json
{
  "scene": {
    "setting": "Describe the environment/location",
    "background": "Specific background elements, textures, wall colors with hex codes",
    "lighting": "Light direction, quality (soft/hard/diffused), color temperature (warm/cool), shadow behavior. Also note if lighting looks natural/casual vs studio-controlled",
    "atmosphere": "Overall environmental feel"
  },
  "composition": {
    "camera_perspective": "CRITICAL — exactly describe the camera position and who is taking the photo. e.g. 'First-person POV, camera held at chest height' or 'Third-person, eye-level tripod shot' or 'Overhead flat-lay from directly above'",
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
      "action": "CRITICAL — describe EXACTLY what they are doing with their body, hands, arms. Not just 'touching' but HOW they are interacting. e.g. 'holding pillow with right hand at arm's length, palm underneath, fingers gripping the side'",
      "visibility": "What parts are visible? Full body, upper body, just hands, etc.",
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
    "texture": "clean | grainy | soft-focus | sharp | matte | glossy",
    "photo_quality": "Describe the actual quality — e.g. 'casual phone photo, slightly soft focus, natural imperfections' or 'professional studio shot, tack-sharp, controlled lighting'"
  }
}
\`\`\`

# Rules

- Use specific hex color codes wherever possible (background colors, product colors, clothing colors)
- For subjects: mark exactly ONE subject as \`"is_competitor_product": true\` — the main product being advertised
- **camera_perspective is the MOST important field** — get this wrong and the entire generation will look nothing like the original
- **action descriptions must be specific and physical** — describe exact hand positions, grip, arm angles, body posture
- Be precise about lighting direction (e.g., "soft light from upper-left, no harsh shadows")
- Be precise about composition (e.g., "product occupies lower-right third, person upper-left")
- Describe each subject in enough visual detail that an image generator could recreate it
- Do NOT describe the competitor product's brand name — just its physical appearance
- **NEVER include logos, brand tags, watermarks, or branded overlays** in the extraction — skip them entirely from the subjects list. The generated image must be clean with no branding.

Return ONLY the JSON object. No markdown fences, no extra text.`;
}

/**
 * Text-only mode prompt — when there's no competitor image, just surrounding text.
 * Uses Claude to write a Nano Banana JSON prompt from scratch.
 */
function buildTextOnlySystemPrompt(productName: string, productBrief: string, forceProduct?: boolean): string {
  return `You are an expert visual designer who creates structured image generation prompts for ecommerce landing pages.

You will receive:
1. The surrounding text from a landing page section (already rewritten for ${productName})
2. Product information about ${productName}

Your job is to write a structured JSON prompt that an image generation model can use directly.

## STEP 1: CONTENT FROM SURROUNDING TEXT

Read the surrounding text carefully. This text tells you what this section of the page is about.
Use it to understand the THEME — do NOT copy headlines or text into the image.

## STEP 2: PRODUCT KNOWLEDGE

${productBrief}

## STEP 3: CREATE THE STRUCTURED PROMPT

Create a JSON prompt matching this structure:

\`\`\`json
{
  "scene": {
    "setting": "Environment/location",
    "background": "Background elements with hex colors",
    "lighting": "Light direction and quality",
    "atmosphere": "Overall feel"
  },
  "composition": {
    "camera_perspective": "Camera position and angle",
    "layout": "Frame organization",
    "framing": "Shot type",
    "focal_point": "What draws the eye",
    "negative_space": "How empty space is used",
    "aspect_ratio": "4:5"
  },
  "subjects": [
    {
      "type": "person | product | prop",
      "description": "Detailed visual description",
      "position": "Where in frame",
      "action": "What they are doing",
      "visibility": "What parts visible"
    }
  ],
  "colors": {
    "palette": ["#hex1", "#hex2", "..."],
    "dominant_tone": "warm | cool | neutral",
    "contrast": "high | medium | low",
    "mood": "What the colors communicate"
  },
  "style": {
    "category": "lifestyle | studio | clinical | native-ad | UGC | editorial | graphic",
    "feel": "Overall aesthetic",
    "texture": "clean | grainy | soft-focus | sharp",
    "photo_quality": "Quality level description"
  },
  "task": "generate_image",
  "instruction": "Generate instruction here"
}
\`\`\`

Guidelines:
- Choose a visual style appropriate for the section theme
${forceProduct
  ? `- MANDATORY: Include ${productName} as a prominent subject in the image`
  : `- Only include the physical product when the section text is specifically about product features. For lifestyle/benefit sections, show the SCENE or FEELING instead`}
- Match Scandinavian aesthetic: clean, natural, authentic
- NEVER copy page text/headlines into the image — the image should ILLUSTRATE the theme, not repeat the words
- Use specific hex color codes

Return ONLY the JSON object. No markdown fences, no extra text.`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { imageSrc, surroundingText, productId, pageId, aspectRatio, hint } = body as {
    imageSrc?: string;
    surroundingText: string;
    productId: string;
    aspectRatio?: string;
    pageId?: string;
    hint?: string;
  };

  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  if (!imageSrc && !surroundingText?.trim()) {
    return NextResponse.json({ error: "Either imageSrc or surroundingText is required" }, { status: 400 });
  }

  if (!isValidUUID(productId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  const db = createServerSupabase();

  // Load product data
  const [productResult, imagesResult, briefResult] = await Promise.all([
    db.from("products").select("name, slug, description").eq("id", productId).single(),
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
  const productDescription = productResult.data.description || "premium ergonomic pillow";
  const productBrief =
    briefResult.data?.content ||
    `${productName} — an ergonomic cervical pillow designed for better sleep.`;
  const referenceImages = ((imagesResult.data ?? []) as ProductImage[]).map(
    (img) => img.url
  );

  try {
    const client = new Anthropic({ apiKey });
    const hasImage = !!imageSrc;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nanaBananaJson: Record<string, any>;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreation = 0;
    let cacheRead = 0;

    if (hasImage) {
      // ── IMAGE MODE: Use Claude Vision structured extraction (same as Assets image swiper) ──

      const userParts: Anthropic.Messages.ContentBlockParam[] = [
        {
          type: "image" as const,
          source: { type: "url" as const, url: imageSrc! },
        },
        {
          type: "text" as const,
          text: buildUserPrompt(surroundingText, hint),
        },
      ];

      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        temperature: 0.7,
        system: [
          { type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: userParts }],
      });

      const rawContent =
        response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

      if (!rawContent) throw new Error("No response from AI");

      // Parse JSON (strip markdown fences if present)
      const cleaned = rawContent
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const extraction = JSON.parse(cleaned);

      if (!extraction.scene && !extraction.composition) {
        throw new Error("AI response missing required extraction fields");
      }

      // Build Nano Banana JSON: swap competitor product with target product (same as image swiper)
      nanaBananaJson = structuredClone(extraction);
      if (nanaBananaJson.subjects && Array.isArray(nanaBananaJson.subjects)) {
        for (const subject of nanaBananaJson.subjects) {
          if (subject.is_competitor_product) {
            subject.description = `${productName} pillow — ${productDescription}`;
            subject.type = "product";
            delete subject.is_competitor_product;
          }
        }
      }

      // Add generation task + instruction (same as image swiper)
      nanaBananaJson.task = "generate_image";
      let instruction = `Recreate this visual style featuring ${productName}. The product must match the reference images provided. CRITICAL: The product must NOT have any tags, labels, logos, branded text, hang tags, or any form of branding visible on it. The product should appear completely clean and unbranded.`;
      if (hint?.trim()) instruction += ` ${hint.trim()}`;
      nanaBananaJson.instruction = instruction;

      // Track usage
      inputTokens = response.usage.input_tokens;
      outputTokens = response.usage.output_tokens;
      const usage = response.usage as unknown as Record<string, number>;
      cacheCreation = usage.cache_creation_input_tokens ?? 0;
      cacheRead = usage.cache_read_input_tokens ?? 0;
    } else {
      // ── TEXT-ONLY MODE: No image to analyze, generate from surrounding text ──

      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        temperature: 0.7,
        system: [
          { type: "text", text: buildTextOnlySystemPrompt(productName, productBrief, true), cache_control: { type: "ephemeral" } },
        ],
        messages: [{
          role: "user",
          content: `Create an image for a landing page section about ${productName}.\n\n**Section text (for thematic context only — do NOT put this text in the image):**\n${surroundingText?.trim() || "General product section"}`,
        }],
      });

      const rawContent =
        response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

      if (!rawContent) throw new Error("No response from AI");

      const cleaned = rawContent
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      nanaBananaJson = JSON.parse(cleaned);

      // Ensure task field exists
      if (!nanaBananaJson.task) {
        nanaBananaJson.task = "generate_image";
        nanaBananaJson.instruction = `Generate an image for ${productName}. Scandinavian aesthetic, clean and authentic.`;
      }

      inputTokens = response.usage.input_tokens;
      outputTokens = response.usage.output_tokens;
      const usage = response.usage as unknown as Record<string, number>;
      cacheCreation = usage.cache_creation_input_tokens ?? 0;
      cacheRead = usage.cache_read_input_tokens ?? 0;
    }

    const nanaBananaPrompt = JSON.stringify(nanaBananaJson);

    // Use detected aspect ratio from extraction, or fall back to provided/default
    const validRatios = ["1:1", "4:5", "5:4", "3:2", "2:3", "3:4", "4:3", "16:9", "9:16"];
    const extractedRatio = (nanaBananaJson.composition?.aspect_ratio ?? "").trim();
    const finalRatio = validRatios.includes(extractedRatio) ? extractedRatio : (aspectRatio || "4:5");

    // Generate image via Nano Banana — pass product hero images as references (same as image swiper)
    const { urls, costTimeMs } = await generateImage(
      nanaBananaPrompt,
      referenceImages,
      finalRatio
    );

    if (!urls?.length) throw new Error("No image generated");

    // Download and upload to Supabase
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
    const claudeCost = calcClaudeCost(inputTokens, outputTokens, cacheCreation, cacheRead);
    await db.from("usage_logs").insert({
      type: "builder_image_generation",
      model: CLAUDE_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: claudeCost,
      metadata: {
        source: "builder",
        original_src: imageSrc || "text-only",
        has_surrounding_text: !!surroundingText?.trim(),
        generation_time_ms: costTimeMs,
        reference_count: referenceImages.length,
        page_id: pageId || null,
        product_id: productId,
        force_product: true,
      },
    });

    return NextResponse.json({
      imageUrl: urlData.publicUrl,
      prompt: nanaBananaPrompt,
      analysis: `${nanaBananaJson.style?.feel || "Image analyzed"}. ${nanaBananaJson.scene?.atmosphere || ""}`,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Image generation failed";
    console.error("[Builder Generate Image Error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Build the user prompt for Claude Vision analysis.
 * Surrounding text is passed as thematic context only — never to be reproduced in the image.
 */
function buildUserPrompt(surroundingText?: string, hint?: string): string {
  let prompt = "Extract every visual detail from this image as structured JSON.";

  if (surroundingText?.trim()) {
    prompt += `\n\n**Thematic context** (this is the page text near this image — use it ONLY to understand the theme, do NOT include any of this text in the image or extraction):\n${surroundingText.trim()}`;
  }

  prompt += `\n\n**Note:** Make sure to identify the competitor product in the extraction with \`"is_competitor_product": true\`.`;

  if (hint?.trim()) {
    prompt += `\n\n**Additional instructions:** ${hint.trim()}`;
  }

  return prompt;
}

/**
 * Extract a short thematic summary from surrounding text.
 * Keeps it brief so it doesn't overwhelm the instruction.
 */
function summarizeTheme(text: string): string {
  // Take first ~100 chars, strip to last complete word
  const trimmed = text.trim().slice(0, 150);
  const lastSpace = trimmed.lastIndexOf(" ");
  return lastSpace > 50 ? trimmed.slice(0, lastSpace) + "..." : trimmed;
}
