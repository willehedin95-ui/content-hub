import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { generateImage } from "@/lib/kie";
import { STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 300; // Kie.ai can take up to 4.7 minutes

/**
 * POST /api/swipe/generate-image
 * Generates a replacement image using Nano Banana Pro (Kie.ai)
 * with product bank reference images for consistency.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, referenceImages, originalSrc, aspectRatio } = body as {
    prompt: string;
    referenceImages: string[];
    originalSrc: string;
    aspectRatio?: string;
  };

  if (!prompt) {
    return NextResponse.json(
      { error: "prompt is required" },
      { status: 400 }
    );
  }

  try {
    // Generate image via Kie.ai (creates task + polls for result)
    const { urls, costTimeMs } = await generateImage(
      prompt,
      referenceImages || [],
      aspectRatio || "1:1"
    );

    if (!urls?.length) {
      throw new Error("No image generated");
    }

    // Download the generated image
    const imageRes = await fetch(urls[0]);
    if (!imageRes.ok) {
      throw new Error(`Failed to download generated image: ${imageRes.status}`);
    }
    const buffer = Buffer.from(await imageRes.arrayBuffer());

    // Upload to Supabase storage
    const db = createServerSupabase();
    const filePath = `swiper-generated/${Date.now()}-${crypto.randomUUID()}.png`;

    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = db.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    // Log usage
    await db.from("usage_logs").insert({
      type: "image_generation",
      model: "nano-banana-pro",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0.09, // Kie.ai flat rate per generation
      metadata: {
        source: "swiper",
        original_src: originalSrc,
        generation_time_ms: costTimeMs,
        reference_count: referenceImages?.length || 0,
      },
    });

    return NextResponse.json({
      generatedUrl: urlData.publicUrl,
      originalSrc,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Image generation failed";
    console.error("[Generate Image Error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
