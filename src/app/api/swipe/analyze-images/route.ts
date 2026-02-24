import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { OPENAI_MODEL } from "@/lib/constants";
import type { ImageAnalysis, ProductImage } from "@/types";

export const maxDuration = 60;

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

const VISION_PROMPT = `Analyze this image from an advertorial landing page. I need to generate a replacement image that conveys the same message but features a different product (an ergonomic cervical pillow called HappySleep).

Describe the following in detail:

1. **Subjects:** Who/what is in the image? People (how many, gender, approximate age, ethnicity, expression), products, objects, hands, etc.
2. **Composition:** Layout, framing, camera angle, focal point, background
3. **Style:** Photography style (studio, lifestyle, editorial, UGC/casual), lighting (natural, studio, warm, cool), color palette, mood
4. **Context:** What story is the image telling? What role does it play in the advertorial? (hero shot, social proof, before/after, product demo, etc.)
5. **Product interaction:** How is the product shown? (held by person, on surface, in use, close-up, in packaging, etc.)
6. **Text overlays:** Any text, badges, stamps, or graphics overlaid on the image?

Format your response as JSON:
{"subjects":"...","composition":"...","style":"...","context":"...","product_interaction":"...","text_overlays":"...","suggested_replacement":"Brief description of what the replacement image should show with HappySleep pillow instead"}`;

function buildNanaBananaPrompt(
  analysis: ImageAnalysis,
  productName: string
): string {
  const parts = [
    `Generate a ${analysis.style} photograph of ${analysis.suggested_replacement}.`,
    ``,
    `Scene: ${analysis.composition}`,
    `Product: ${analysis.product_interaction} — a white ergonomic cervical pillow with contoured shape, central head depression, and raised cervical support edges. The pillow packaging is a white box with the ${productName} logo.`,
    `Mood: ${analysis.style}`,
  ];

  if (analysis.text_overlays && analysis.text_overlays.toLowerCase() !== "none") {
    parts.push(
      `Note: Original had text overlays: ${analysis.text_overlays}. Do NOT include text in the generated image.`
    );
  }

  parts.push(
    ``,
    `Important: The pillow/product must closely match the reference images provided. Scandinavian-looking subjects. Natural, authentic feel — not overly polished or stock-photo-like.`
  );

  return parts.join("\n");
}

async function analyzeImage(
  openai: OpenAI,
  imageUrl: string,
  alt: string
): Promise<ImageAnalysis> {
  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: 800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: VISION_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: alt
              ? `Analyze this advertorial image. Alt text context: "${alt}"`
              : "Analyze this advertorial image.",
          },
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "high" },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from image analysis");

  const parsed = JSON.parse(content) as ImageAnalysis;

  return {
    subjects: parsed.subjects ?? "",
    composition: parsed.composition ?? "",
    style: parsed.style ?? "",
    context: parsed.context ?? "",
    product_interaction: parsed.product_interaction ?? "",
    text_overlays: parsed.text_overlays ?? "None",
    suggested_replacement: parsed.suggested_replacement ?? "",
  };
}

/**
 * POST /api/swipe/analyze-images
 * Analyzes selected images with GPT-4o Vision and generates Nano Banana Pro prompts.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { images, productId } = body as {
    images: { src: string; alt: string }[];
    productId: string;
  };

  if (!images?.length || !productId) {
    return NextResponse.json(
      { error: "images and productId are required" },
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

  // Load product name and images for reference
  const [productResult, imagesResult] = await Promise.all([
    db.from("products").select("name").eq("id", productId).single(),
    db
      .from("product_images")
      .select("*")
      .eq("product_id", productId)
      .in("category", ["hero", "detail"])
      .order("sort_order", { ascending: true }),
  ]);

  if (productResult.error || !productResult.data) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const productName = productResult.data.name;
  const referenceImages = ((imagesResult.data ?? []) as ProductImage[]).map(
    (img) => img.url
  );

  // Analyze images in parallel
  const results = await Promise.allSettled(
    images.map(async (img) => {
      const analysis = await analyzeImage(openai, img.src, img.alt);
      const nanoBananaPrompt = buildNanaBananaPrompt(analysis, productName);
      return {
        src: img.src,
        analysis,
        nanoBananaPrompt,
        referenceImages,
      };
    })
  );

  const analyses = results
    .filter(
      (r): r is PromiseFulfilledResult<{
        src: string;
        analysis: ImageAnalysis;
        nanoBananaPrompt: string;
        referenceImages: string[];
      }> => r.status === "fulfilled"
    )
    .map((r) => r.value);

  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r, i) => ({
      src: images[i]?.src,
      error: r.reason?.message || "Analysis failed",
    }));

  // Log usage
  await db.from("usage_logs").insert({
    type: "image_analysis",
    model: OPENAI_MODEL,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    metadata: {
      source: "swiper",
      images_analyzed: analyses.length,
      images_failed: failures.length,
      product_id: productId,
    },
  });

  return NextResponse.json({ analyses, failures });
}
