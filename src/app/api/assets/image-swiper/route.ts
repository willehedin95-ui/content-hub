import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase";
import { CLAUDE_MODEL } from "@/lib/constants";
import { calcClaudeCost } from "@/lib/pricing";
import { createImageTask, pollTaskResult } from "@/lib/kie";
import type { ProductFull, CopywritingGuideline, ProductSegment } from "@/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

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
  // product is optional — no 400 if missing

  // Fetch product data (only when product is selected)
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

    // Fetch product hero images for Nano Banana reference
    const { data: productImages } = await db
      .from("product_images")
      .select("url")
      .eq("product_id", product.id)
      .eq("category", "hero")
      .order("sort_order", { ascending: true });

    productHeroUrls = (productImages ?? []).map((img: { url: string }) => img.url);
  }

  // Build Claude system prompt (product-agnostic — extraction only)
  const systemPrompt = buildImageSwiperSystemPrompt();

  const userPrompt = buildImageSwiperUserPrompt(image_url, notes);

  // Stream NDJSON
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  async function emit(data: object) {
    await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
  }

  (async () => {
    try {
      // --- Step 1: Claude Vision analysis ---
      await emit({ step: "analyzing", message: "Analyzing competitor image..." });

      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        temperature: 0.7,
        system: [
          { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image" as const,
                source: { type: "url" as const, url: image_url },
              },
              { type: "text" as const, text: userPrompt },
            ],
          },
        ],
      });

      const rawContent =
        response.content[0]?.type === "text"
          ? response.content[0].text.trim()
          : "";

      if (!rawContent) {
        await emit({ step: "error", message: "No response from AI" });
        await writer.close();
        return;
      }

      // Parse JSON (strip markdown fences if present)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let extraction: Record<string, any>;
      try {
        const cleaned = rawContent
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        extraction = JSON.parse(cleaned);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.error("[image-swiper] Parse error:", msg, "\nRaw:", rawContent.slice(0, 500));
        await emit({ step: "error", message: `Failed to parse AI response: ${msg}` });
        await writer.close();
        return;
      }

      if (!extraction.scene && !extraction.composition) {
        await emit({ step: "error", message: "AI response missing required extraction fields" });
        await writer.close();
        return;
      }

      // Derive flat analysis for UI display
      const flatAnalysis = {
        composition: `${extraction.composition?.camera_perspective ?? extraction.composition?.layout ?? "Unknown"}. ${extraction.composition?.framing ?? ""}. Focal point: ${extraction.composition?.focal_point ?? ""}`,
        colors: extraction.colors?.mood ?? "Unknown",
        mood: extraction.scene?.atmosphere ?? "Unknown",
        style: `${extraction.style?.category ?? "Unknown"}. ${extraction.style?.feel ?? ""}${extraction.style?.photo_quality ? `. Quality: ${extraction.style.photo_quality}` : ""}`,
      };

      // Build Nano Banana JSON prompt: swap competitor product with target product
      const nanaBananaJson = structuredClone(extraction);
      if (nanaBananaJson.subjects && Array.isArray(nanaBananaJson.subjects)) {
        for (const subject of nanaBananaJson.subjects) {
          if (subject.is_competitor_product && product) {
            subject.description = `${product.name} pillow — ${product.description || "premium ergonomic pillow"}`;
            subject.type = "product";
            delete subject.is_competitor_product;
          } else if (subject.is_competitor_product) {
            // No product selected — make it generic
            subject.description = "Generic ergonomic wellness product, neutral/white color";
            delete subject.is_competitor_product;
          }
        }
      }
      // Add generation task instruction at the top level
      nanaBananaJson.task = "generate_image";
      const qualityNote = extraction.style?.photo_quality
        ? ` CRITICAL: Match the original photo quality exactly — ${extraction.style.photo_quality}. If the original is grainy, low-res, or looks like a phone photo, the result MUST have the same imperfections. Do NOT upgrade to studio quality.`
        : "";
      const textureNote = extraction.style?.texture && extraction.style.texture !== "sharp" && extraction.style.texture !== "clean"
        ? ` Texture must be: ${extraction.style.texture}.`
        : "";
      let instruction = product
        ? `Recreate this visual style featuring ${product.name}. The product must match the reference images provided.${qualityNote}${textureNote}`
        : `Recreate this visual style with the described subjects and environment.${qualityNote}${textureNote}`;
      if (notes) {
        instruction += ` Additional instructions: ${notes}`;
      }
      nanaBananaJson.instruction = instruction;

      const nanaBananaPrompt = JSON.stringify(nanaBananaJson);

      // Log Claude usage
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cacheCreation =
        (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;
      const cacheRead =
        (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
      const claudeCost = calcClaudeCost(inputTokens, outputTokens, cacheCreation, cacheRead);

      await db.from("usage_logs").insert({
        type: "image_swiper",
        model: CLAUDE_MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: claudeCost,
        metadata: {
          product: productSlug || null,
        },
      });

      await emit({
        step: "analyzed",
        message: "Analysis complete",
        analysis: flatAnalysis,
        extraction,
        nano_banana_prompt: nanaBananaPrompt,
      });

      // --- Step 2: Generate image with Nano Banana ---
      await emit({
        step: "generating",
        message: "Generating adapted image...",
      });

      // Aspect ratio from extraction, fallback to 4:5
      const validRatios = ["1:1", "4:5", "5:4", "3:2", "2:3", "16:9", "9:16"];
      const rawRatio = (extraction.composition?.aspect_ratio ?? "").trim();
      const detectedRatio = validRatios.includes(rawRatio) ? rawRatio : "4:5";

      const imageTaskId = await createImageTask(
        nanaBananaPrompt,
        productHeroUrls,
        detectedRatio,
        "1K"
      );

      const result = await pollTaskResult(imageTaskId);

      if (result.urls.length === 0) {
        await emit({ step: "error", message: "No image generated" });
        await writer.close();
        return;
      }

      // Log Nano Banana usage
      await db.from("usage_logs").insert({
        type: "image_swiper",
        model: "nano-banana-2",
        cost_usd: 0,
        metadata: {
          product: productSlug,
          task_id: imageTaskId,
          aspect_ratio: detectedRatio,
          has_product_ref: productHeroUrls.length > 0,
        },
      });

      await emit({
        step: "completed",
        message: "Image generated",
        image_url: result.urls[0],
        prompt_used: nanaBananaPrompt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[image-swiper] Error:", msg);
      await emit({ step: "error", message: `Analysis failed: ${msg}` });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

// --- Prompt builders ---

function buildImageSwiperSystemPrompt(): string {
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
- If the user provides additional notes/instructions, APPLY them to the extraction. For example: "change 60 days to 100 days" → modify the text subject's description to say "100 days". "Remove the badge" → omit that subject entirely. "Make the background blue" → update the background and color palette accordingly.

Return ONLY the JSON object. No markdown fences, no extra text.`;
}

function buildImageSwiperUserPrompt(imageUrl: string, notes?: string): string {
  let prompt = "Extract every visual detail from this image as structured JSON.";

  if (notes) {
    prompt += `\n\n**Additional Notes:** ${notes}`;
  }

  return prompt;
}
