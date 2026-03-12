import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { generateImage, createKlingTask } from "@/lib/kie";
import { OPENAI_MODEL } from "@/lib/constants";
import type { ProductImage } from "@/types";

export const maxDuration = 300;

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function buildPrompt(productName: string, productBrief: string): string {
  return `You are an expert visual designer creating image and video generation prompts for ecommerce landing pages.

You will receive surrounding text from a landing page section (already rewritten for ${productName}).

Your job is to write TWO prompts:
1. A Nano Banana Pro IMAGE prompt for a keyframe (first frame of the video)
2. A Kling 3.0 VIDEO prompt describing the motion/animation

## PRODUCT KNOWLEDGE

${productBrief}

## GUIDELINES

- The keyframe prompt should depict a scene relevant to ${productName} based on the surrounding text
- IMPORTANT: Only include the physical product when the text is specifically about the product itself. For lifestyle, emotional, or benefit-focused sections, show the SCENE or FEELING instead.
- When the product IS shown, use accurate details (white ergonomic cervical pillow with contoured shape, central head depression, and raised cervical support edges)
- The video prompt should describe subtle, natural motion: a person breathing, hair moving, camera slowly panning, etc.
- Matches Scandinavian aesthetic: clean, natural, authentic
- NEVER mentions or visually references any competitor product
- Keep video motion gentle and natural — avoid dramatic transitions

## OUTPUT FORMAT

Return JSON with exactly these fields:
{
  "visual_structure": "One sentence describing the scene",
  "content_match": "One sentence describing what should be shown based on surrounding text",
  "keyframe_prompt": "The Nano Banana Pro image generation prompt for the first frame",
  "video_prompt": "The Kling 3.0 video prompt describing the motion"
}`;
}

/**
 * POST /api/builder/generate-video
 *
 * Generates a replacement video for a swiped page:
 * 1. GPT creates keyframe + video prompts from surrounding text
 * 2. Nano Banana generates the keyframe image
 * 3. Kling 3.0 starts video generation from keyframe
 * 4. Returns task_id for client-side polling via /api/video-swiper/status
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { surroundingText, productId, aspectRatio, pageId } = body as {
    surroundingText: string;
    productId: string;
    aspectRatio?: string;
    pageId?: string;
  };

  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }
  if (!surroundingText?.trim()) {
    return NextResponse.json({ error: "surroundingText is required" }, { status: 400 });
  }
  if (!isValidUUID(productId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const openai = getOpenAI();
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Load product data
  const [productResult, imagesResult, briefResult] = await Promise.all([
    db.from("products").select("name, slug").eq("id", productId).eq("workspace_id", workspaceId).single(),
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
    // Step 1: GPT → keyframe + video prompts
    const visionResponse = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildPrompt(productName, productBrief) },
        {
          role: "user",
          content: `Create keyframe and video prompts for a landing page section about ${productName}.\n\n**Surrounding text on the page:**\n${surroundingText.trim()}`,
        },
      ],
    });

    const content = visionResponse.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    let parsed: {
      visual_structure: string;
      content_match: string;
      keyframe_prompt: string;
      video_prompt: string;
    };
    try {
      const cleaned = content.replace(/^```json\s*\n?|\n?```$/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    if (!parsed.keyframe_prompt || !parsed.video_prompt) {
      throw new Error("AI response missing required prompt fields");
    }

    // Step 2: Nano Banana → keyframe image
    const ar = aspectRatio || "1:1";
    const { urls: keyframeUrls, costTimeMs } = await generateImage(
      parsed.keyframe_prompt,
      referenceImages,
      ar
    );

    if (!keyframeUrls?.length) throw new Error("Keyframe generation failed");
    const keyframeUrl = keyframeUrls[0];

    // Step 3: Kling → start video generation
    const taskId = await createKlingTask({
      prompt: parsed.video_prompt,
      imageUrls: [keyframeUrl],
      sound: false,
      duration: 5,
      aspectRatio: ar,
      mode: "std",
    });

    // Log usage
    await db.from("usage_logs").insert({
      type: "builder_video_generation",
      model: "kling-3.0/video",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0.12,
      metadata: {
        source: "builder",
        keyframe_url: keyframeUrl,
        keyframe_time_ms: costTimeMs,
        kling_task_id: taskId,
        aspect_ratio: ar,
        page_id: pageId || null,
        product_id: productId,
      },
    });

    return NextResponse.json({
      taskId,
      keyframeUrl,
      analysis: `${parsed.visual_structure}. ${parsed.content_match}`,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Video generation failed";
    console.error("[Builder Generate Video Error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
