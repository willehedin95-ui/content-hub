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

function buildSystemPrompt(productName: string, productBrief: string, hasImage: boolean, forceProduct?: boolean): string {
  if (!hasImage) {
    // Text-only mode — no competitor image to analyze (e.g. replacing a video)
    return `You are an expert visual designer who creates image generation prompts for ecommerce landing pages.

You will receive:
1. The surrounding text from a landing page section (already rewritten for ${productName})
2. Product information about ${productName}

Your job is to write a Nano Banana Pro image generation prompt that creates an image for this page section.

## STEP 1: CONTENT FROM SURROUNDING TEXT

Read the surrounding text carefully. This text has been rewritten for ${productName} — it tells you what this section of the page is about.

Use the surrounding text as the PRIMARY guide for what the image should depict.

## STEP 2: PRODUCT KNOWLEDGE

${productBrief}

## STEP 3: WRITE THE PROMPT

Create an image generation prompt that:
- Depicts content relevant to ${productName} based on the surrounding text
- Choose an appropriate visual style: lifestyle photo, product shot, infographic, testimonial card, etc.
${forceProduct
  ? `- MANDATORY: The ${productName} product MUST be clearly visible in the image. Show the physical product (white ergonomic cervical pillow with contoured shape, central head depression, and raised cervical support edges) prominently — on a bed, held by a person, or as the focal point. The product should be unmistakably present.`
  : `- IMPORTANT: Only include the physical product in the image when the surrounding text is specifically about the product itself (features, unboxing, close-up). For lifestyle, emotional, or benefit-focused sections (e.g. "wake up pain-free", "better sleep"), show the SCENE or FEELING — a person sleeping peacefully, a cozy bedroom, someone stretching happily — WITHOUT the pillow being the focal point. Variety is key.
- When the product IS shown, use accurate details (white ergonomic cervical pillow with contoured shape, central head depression, and raised cervical support edges)`}
- Matches Scandinavian aesthetic: clean, natural, authentic — not overly polished or American stock-photo-like
- NEVER mentions or visually references any competitor product

## OUTPUT FORMAT

Return JSON with exactly these fields:
{
  "visual_structure": "One sentence describing the visual style you chose and why",
  "content_match": "One sentence describing what the image should show based on surrounding text",
  "shows_product": true or false,
  "prompt": "The full Nano Banana Pro image generation prompt"
}`;
  }

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
${forceProduct
  ? `- MANDATORY: The ${productName} product MUST be clearly visible in the image. Show the physical product (white ergonomic cervical pillow with contoured shape, central head depression, and raised cervical support edges) prominently — on a bed, held by a person, or as the focal point. The product should be unmistakably present, regardless of what the competitor image shows.`
  : `- IMPORTANT: Match the competitor image's approach to product visibility. If the competitor image shows their product prominently, show ${productName} prominently. If the competitor image shows a lifestyle scene, person, or emotional moment WITHOUT their product visible, do the SAME — show the scene/feeling without making ${productName} the focal point. Don't force the product into every image.
- When the product IS shown, use accurate details (white ergonomic cervical pillow with contoured shape, central head depression, and raised cervical support edges)`}
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
  const { imageSrc, surroundingText, productId, pageId, aspectRatio, forceProduct } = body as {
    imageSrc?: string;
    surroundingText: string;
    productId: string;
    aspectRatio?: string;
    pageId?: string;
    forceProduct?: boolean;
  };

  if (!productId) {
    return NextResponse.json(
      { error: "productId is required" },
      { status: 400 }
    );
  }

  if (!imageSrc && !surroundingText?.trim()) {
    return NextResponse.json(
      { error: "Either imageSrc or surroundingText is required" },
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
  const productBrief =
    briefResult.data?.content ||
    `${productName} — an ergonomic cervical pillow designed for better sleep.`;
  const referenceImages = ((imagesResult.data ?? []) as ProductImage[]).map(
    (img) => img.url
  );

  try {
    // Helper: call GPT to get a Nano Banana prompt
    async function getPromptFromGPT(useImage: boolean): Promise<{
      visual_structure: string;
      content_match: string;
      prompt: string;
    }> {
      const userParts: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail: "high" | "low" } }
      > = [];

      let textContent = useImage
        ? `Analyze this competitor image and create a replacement prompt for ${productName}.`
        : `Create an image prompt for a landing page section about ${productName}.`;
      if (surroundingText?.trim()) {
        textContent += `\n\n**Surrounding text on the page (already rewritten for ${productName}):**\n${surroundingText.trim()}`;
      }
      userParts.push({ type: "text", text: textContent });
      if (useImage && imageSrc) {
        userParts.push({
          type: "image_url",
          image_url: { url: imageSrc, detail: "high" },
        });
      }

      const resp = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_completion_tokens: 1000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(productName, productBrief, useImage, forceProduct),
          },
          { role: "user", content: userParts },
        ],
      });

      const content = resp.choices[0]?.message?.content;
      if (!content) throw new Error("No response from AI");

      const cleaned = content.replace(/^```json\s*\n?|\n?```$/g, "").trim();
      const result = JSON.parse(cleaned);
      if (!result.prompt) throw new Error("AI response missing prompt field");
      return result;
    }

    const hasImage = !!imageSrc;
    let parsed: { visual_structure: string; content_match: string; prompt: string };

    if (hasImage) {
      // Try with image first; if the source image is broken/CORS/404, fall back to text-only
      try {
        parsed = await getPromptFromGPT(true);
      } catch (imgErr) {
        console.warn(
          "[Builder Generate Image] Image analysis failed, falling back to text-only:",
          imgErr instanceof Error ? imgErr.message : imgErr
        );
        if (!surroundingText?.trim()) {
          throw imgErr; // no text to fall back on
        }
        parsed = await getPromptFromGPT(false);
      }
    } else {
      parsed = await getPromptFromGPT(false);
    }

    // Step 2: Generate image via Kie.ai
    const { urls, costTimeMs } = await generateImage(
      parsed.prompt,
      referenceImages,
      aspectRatio || "4:5"
    );

    if (!urls?.length) throw new Error("No image generated");

    // Step 3: Download and upload to Supabase
    const imageRes = await fetch(urls[0]);
    if (!imageRes.ok) {
      throw new Error(
        `Failed to download generated image: ${imageRes.status}`
      );
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
      cost_usd: 0.12,
      metadata: {
        source: "builder",
        original_src: imageSrc || "text-only",
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
    const message =
      err instanceof Error ? err.message : "Image generation failed";
    console.error("[Builder Generate Image Error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
