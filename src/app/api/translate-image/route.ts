import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { generateImage } from "@/lib/kie";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const { imageUrl, prompt, translationId, aspectRatio } = (await req.json()) as {
    imageUrl: string;
    prompt: string;
    translationId: string;
    aspectRatio?: string;
  };

  if (!imageUrl || !prompt || !translationId) {
    return NextResponse.json(
      { error: "imageUrl, prompt, and translationId are required" },
      { status: 400 }
    );
  }

  try {
    // 1. Call Kie.ai nano-banana-pro — original image is already on a public URL
    const resultUrls = await generateImage(
      prompt,
      [imageUrl],
      aspectRatio || "1:1"
    );

    if (!resultUrls?.length) {
      return NextResponse.json(
        { error: "No image generated" },
        { status: 500 }
      );
    }

    // 2. Download the generated image from Kie.ai CDN
    const resultRes = await fetch(resultUrls[0]);
    if (!resultRes.ok) {
      throw new Error("Failed to fetch generated image from Kie.ai");
    }
    const buffer = Buffer.from(await resultRes.arrayBuffer());

    // 3. Upload to Supabase Storage
    const db = createServerSupabase();
    const filePath = `${translationId}/${crypto.randomUUID()}.png`;

    const { error: uploadError } = await db.storage
      .from("translated-images")
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // 4. Get public URL
    const { data: urlData } = db.storage
      .from("translated-images")
      .getPublicUrl(filePath);

    return NextResponse.json({ newImageUrl: urlData.publicUrl });
  } catch (error) {
    console.error("Image translation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Image translation failed",
      },
      { status: 500 }
    );
  }
}
