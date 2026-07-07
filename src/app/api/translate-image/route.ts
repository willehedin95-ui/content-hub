import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { generateImage } from "@/lib/kie";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { KIE_MODEL, STORAGE_BUCKET } from "@/lib/constants";
import { getWorkspaceId } from "@/lib/workspace";

// Vercel PRO cap is 800s. Kie polling alone can take up to ~280s, so 180
// killed paid renders mid-flight (audit 2026-07-07, L2).
export const maxDuration = 800;

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
    const startTime = Date.now();
    const db = createServerSupabase();

    // Validate translationId exists + belongs to the active workspace
    // before calling expensive Kie AI (audit 2026-07-07, P3 workspace-scoping)
    const workspaceId = await getWorkspaceId();
    const { data: trans, error: transErr } = await db
      .from("translations")
      .select("id, page_id, pages!inner(workspace_id)")
      .eq("id", translationId)
      .single();

    if (transErr || !trans) {
      return NextResponse.json(
        { error: "Translation not found" },
        { status: 404 }
      );
    }
    const transPages = trans.pages as unknown as { workspace_id?: string } | null;
    if (transPages?.workspace_id && transPages.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "Translation not found" },
        { status: 404 }
      );
    }

    // 1. Call Kie.ai nano-banana-pro — original image is already on a public URL
    const { urls: resultUrls, costTimeMs } = await generateImage(
      prompt,
      [imageUrl],
      aspectRatio || "4:5"
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
    const filePath = `${translationId}/${crypto.randomUUID()}.png`;

    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // 4. Get public URL
    const { data: urlData } = db.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    // 5. Log usage (trans already fetched above for validation)
    const durationMs = Date.now() - startTime;

    const { error: logError } = await db.from("usage_logs").insert({
      type: "image_generation",
      page_id: trans.page_id,
      translation_id: translationId,
      model: KIE_MODEL,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: KIE_IMAGE_COST,
      metadata: {
        image_url: imageUrl,
        aspect_ratio: aspectRatio || "4:5",
        duration_ms: durationMs,
        kie_cost_time_ms: costTimeMs,
      },
    });
    if (logError) {
      console.error("[translate-image] usage_logs insert failed:", logError.message);
    }

    return NextResponse.json({ newImageUrl: urlData.publicUrl, duration_ms: durationMs });
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
