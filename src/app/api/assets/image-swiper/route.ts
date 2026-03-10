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
  if (!productSlug) {
    return NextResponse.json({ error: "product is required" }, { status: 400 });
  }

  // Fetch product data
  const db = createServerSupabase();

  const { data: product, error: productErr } = await db
    .from("products")
    .select("*")
    .eq("slug", productSlug)
    .single();

  if (productErr || !product) {
    return NextResponse.json({ error: `Product "${productSlug}" not found` }, { status: 404 });
  }

  const { data: guidelinesData } = await db
    .from("copywriting_guidelines")
    .select("*")
    .or(`product_id.eq.${product.id},product_id.is.null`)
    .order("sort_order", { ascending: true });

  const guidelines = (guidelinesData ?? []) as CopywritingGuideline[];
  const productBrief = guidelines.find((g) => g.name === "Product Brief")?.content;

  const { data: segmentsData } = await db
    .from("product_segments")
    .select("*")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  const segments = (segmentsData ?? []) as ProductSegment[];

  // Fetch product hero images for Nano Banana reference
  const { data: productImages } = await db
    .from("product_images")
    .select("url")
    .eq("product_id", product.id)
    .eq("category", "hero")
    .order("sort_order", { ascending: true });

  const productHeroUrls = (productImages ?? []).map((img: { url: string }) => img.url);

  // Build Claude system prompt
  const systemPrompt = buildImageSwiperSystemPrompt(
    product as ProductFull,
    productBrief,
    guidelines,
    segments
  );

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
      let parsed: {
        analysis: {
          composition: string;
          colors: string;
          mood: string;
          style: string;
          aspect_ratio: string;
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

      if (!parsed.analysis || !parsed.nano_banana_prompt) {
        await emit({ step: "error", message: "AI response missing required fields" });
        await writer.close();
        return;
      }

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
          product: productSlug,
        },
      });

      await emit({
        step: "analyzed",
        message: "Analysis complete",
        analysis: parsed.analysis,
        nano_banana_prompt: parsed.nano_banana_prompt,
      });

      // --- Step 2: Generate image with Nano Banana ---
      await emit({
        step: "generating",
        message: "Generating adapted image...",
      });

      // Use the aspect ratio detected from the source image
      const detectedRatio = parsed.analysis.aspect_ratio || "4:5";

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
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[]
): string {
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

  return `You are an expert ad creative strategist specializing in visual adaptation. Your task is to analyze a competitor's product image and create a new image for a different product that captures the same visual approach.

# Product Context

**Product:** ${product.name}
${product.tagline ? `**Tagline:** ${product.tagline}` : ""}
${product.description ? `**Description:** ${product.description}` : ""}

${productBrief ? `## Product Brief\n${productBrief}\n` : ""}

${product.benefits.length > 0 ? `**Benefits:**\n${product.benefits.map((b) => `- ${b}`).join("\n")}\n` : ""}

${product.usps.length > 0 ? `**USPs:**\n${product.usps.map((u) => `- ${u}`).join("\n")}\n` : ""}

${product.claims.length > 0 ? `**Claims:**\n${product.claims.map((c) => `- ${c}`).join("\n")}\n` : ""}

${product.target_audience ? `**Target Audience:** ${product.target_audience}\n` : ""}

${segmentsText ? `## Customer Segments\n${segmentsText}\n` : ""}

${guidelinesText ? `## Copywriting Guidelines\n${guidelinesText}\n` : ""}

# Your Task

1. **Analyze the competitor image:**
   - Composition and layout (how elements are arranged)
   - Color palette (dominant colors, mood, contrast)
   - Mood and emotional tone (calm, energetic, intimate, clinical, etc.)
   - Visual style (lifestyle, studio, clinical, native ad, etc.)
   - Aspect ratio — determine the closest standard ratio from: 1:1, 4:5, 5:4, 3:2, 2:3, 16:9, 9:16. The generated image MUST match the source image's aspect ratio.

2. **Create a Nano Banana prompt** for a new image that:
   - Uses the same visual structure and approach
   - Adapts the concept to ${product.name}
   - Maintains the same mood and emotional impact
   - Does NOT copy the competitor's image — creates a new image inspired by the approach

# Important Guidelines

- Do NOT describe the competitor's product — focus on visual structure
- Do NOT copy specific people, settings, or compositions — inspire a new creation
- DO capture the same compositional principles, color mood, and visual style
- DO adapt the scene to fit ${product.name}'s context and audience
- The Nano Banana prompt should be 2-4 sentences describing the desired image

# Output Format

Return ONLY valid JSON with this structure:

\`\`\`json
{
  "analysis": {
    "composition": "Brief description of how elements are arranged",
    "colors": "Description of color palette and mood",
    "mood": "Emotional tone and atmosphere",
    "style": "Visual style category (e.g., lifestyle, studio, native ad)",
    "aspect_ratio": "Closest standard ratio, e.g. 16:9, 4:5, 1:1"
  },
  "nano_banana_prompt": "2-4 sentence image generation prompt"
}
\`\`\`

Do not include any markdown fences or extra text. Return only the JSON object.`;
}

function buildImageSwiperUserPrompt(imageUrl: string, notes?: string): string {
  let prompt = "Analyze this competitor image and create a Nano Banana prompt for an adapted version with my product.";

  if (notes) {
    prompt += `\n\n**Additional Notes:** ${notes}`;
  }

  return prompt;
}
