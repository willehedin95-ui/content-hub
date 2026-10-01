import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { createImageTask, pollTaskResult } from "@/lib/kie";
import { persistSwipeImage } from "@/lib/swipe-image-store";
import { kieImageCost } from "@/lib/pricing";
import { IMAGE_MODEL_IDS } from "@/lib/constants";
import { resolveSwipeReferences, resolveShotGlassReference, modelNeedsImage } from "@/lib/swipe-references";

export const maxDuration = 800;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { prompt, product, aspect_ratio, competitor_image_url, model: requestedModel, reference_ids, forms } = body as {
    prompt?: string;
    product?: string;
    aspect_ratio?: string;
    competitor_image_url?: string;
    model?: string;
    reference_ids?: string[];
    forms?: string[];
  };
  const imageModel = requestedModel && IMAGE_MODEL_IDS.includes(requestedModel) ? requestedModel : "gpt-image-2-image-to-image";

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
      // Same rule as the first generation: no bottle picked = no reference.
      const showsBottle = !Array.isArray(forms) || forms.length === 0 || forms.includes("bottle");
      productHeroUrls = showsBottle || competitor_image_url || modelNeedsImage(imageModel)
        ? await resolveSwipeReferences(db, productData.id, reference_ids)
        : [];
      if (Array.isArray(forms) && forms.includes("shot") && !competitor_image_url) {
        const shotRef = await resolveShotGlassReference(db, productData.id);
        if (shotRef) productHeroUrls = showsBottle ? [...productHeroUrls, shotRef] : [shotRef];
      }
    }
  }

  try {
    // In replica mode, competitor image is prepended as visual reference
    const referenceImages = competitor_image_url
      ? [competitor_image_url, ...productHeroUrls]
      : productHeroUrls;

    const taskId = await createImageTask(prompt, referenceImages, ratio, "1K", imageModel, "jpg");

    // Log the Kie cost IMMEDIATELY after task creation - the image is paid
    // for once the task exists, so a poll timeout must not hide the spend.
    const db = createServerSupabase();
    await db.from("usage_logs").insert({
      type: "image_swiper",
      model: imageModel,
      cost_usd: kieImageCost(imageModel),
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

    return NextResponse.json({ image_url: await persistSwipeImage(result.urls[0]) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[image-swiper/regenerate] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
