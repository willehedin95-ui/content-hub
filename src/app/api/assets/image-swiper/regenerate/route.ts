import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { createImageTask, pollTaskResult } from "@/lib/kie";
import { KIE_IMAGE_COST } from "@/lib/pricing";

export const maxDuration = 800;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { prompt, product, aspect_ratio, competitor_image_url } = body as {
    prompt?: string;
    product?: string;
    aspect_ratio?: string;
    competitor_image_url?: string;
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
    // Workspace-scoped: product slugs are only unique per workspace.
    const workspaceId = await getWorkspaceId();
    const { data: productData } = await db
      .from("products")
      .select("id")
      .eq("slug", product)
      .eq("workspace_id", workspaceId)
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
    // In replica mode, competitor image is prepended as visual reference
    const referenceImages = competitor_image_url
      ? [competitor_image_url, ...productHeroUrls]
      : productHeroUrls;

    const taskId = await createImageTask(prompt, referenceImages, ratio, "2K");

    // Log the Kie cost IMMEDIATELY after task creation - the image is paid
    // for once the task exists, so a poll timeout must not hide the spend.
    const db = createServerSupabase();
    await db.from("usage_logs").insert({
      type: "image_swiper",
      model: "nano-banana-2",
      cost_usd: KIE_IMAGE_COST,
      metadata: {
        product: product || null,
        task_id: taskId,
        aspect_ratio: ratio,
        has_product_ref: productHeroUrls.length > 0,
        is_retry: true,
      },
    });

    const result = await pollTaskResult(taskId);

    if (result.urls.length === 0) {
      return NextResponse.json({ error: "No image generated" }, { status: 500 });
    }

    return NextResponse.json({ image_url: result.urls[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[image-swiper/regenerate] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
