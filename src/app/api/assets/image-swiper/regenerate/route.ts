import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createImageTask, pollTaskResult } from "@/lib/kie";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { prompt, product, aspect_ratio } = body as {
    prompt?: string;
    product?: string;
    aspect_ratio?: string;
  };

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const validRatios = ["1:1", "4:5", "5:4", "3:2", "2:3", "16:9", "9:16"];
  const ratio = validRatios.includes(aspect_ratio ?? "") ? aspect_ratio! : "4:5";

  // Fetch product hero images if product specified
  let productHeroUrls: string[] = [];
  if (product) {
    const db = createServerSupabase();
    const { data: productData } = await db
      .from("products")
      .select("id")
      .eq("slug", product)
      .single();

    if (productData) {
      const { data: productImages } = await db
        .from("product_images")
        .select("url")
        .eq("product_id", productData.id)
        .eq("category", "hero")
        .order("sort_order", { ascending: true });

      productHeroUrls = (productImages ?? []).map((img: { url: string }) => img.url);
    }
  }

  try {
    const taskId = await createImageTask(prompt, productHeroUrls, ratio, "1K");
    const result = await pollTaskResult(taskId);

    if (result.urls.length === 0) {
      return NextResponse.json({ error: "No image generated" }, { status: 500 });
    }

    // Log usage
    const db = createServerSupabase();
    await db.from("usage_logs").insert({
      type: "image_swiper",
      model: "nano-banana-2",
      cost_usd: 0,
      metadata: {
        product: product || null,
        task_id: taskId,
        aspect_ratio: ratio,
        has_product_ref: productHeroUrls.length > 0,
        is_retry: true,
      },
    });

    return NextResponse.json({ image_url: result.urls[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[image-swiper/regenerate] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
