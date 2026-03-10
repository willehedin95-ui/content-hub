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

  // Build Claude system prompt
  const systemPrompt = buildImageSwiperSystemPrompt(
    product,
    productBrief,
    guidelines,
    segments
  );

  const userPrompt = buildImageSwiperUserPrompt(image_url, notes, !!productSlug);

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
        extraction: parsed.extraction,
        nano_banana_prompt: parsed.nano_banana_prompt,
      });

      // --- Step 2: Generate image with Nano Banana ---
      await emit({
        step: "generating",
        message: "Generating adapted image...",
      });

      // Aspect ratio from extraction, fallback to 4:5
      const validRatios = ["1:1", "4:5", "5:4", "3:2", "2:3", "16:9", "9:16"];
      const rawRatio = (parsed.extraction.composition?.aspect_ratio ?? "").trim();
      const detectedRatio = validRatios.includes(rawRatio) ? rawRatio : "4:5";

      const imageTaskId = await createImageTask(
        parsed.nano_banana_prompt,
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
        prompt_used: parsed.nano_banana_prompt,
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

function buildImageSwiperUserPrompt(imageUrl: string, notes?: string, hasProduct?: boolean): string {
  let prompt = hasProduct
    ? "Analyze this competitor image and create a Nano Banana prompt for an adapted version featuring my product."
    : "Analyze this competitor image and create a Nano Banana prompt that recreates this visual style.";

  if (notes) {
    prompt += `\n\n**Additional Notes:** ${notes}`;
  }

  return prompt;
}
