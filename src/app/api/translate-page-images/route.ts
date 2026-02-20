import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { generateImage } from "@/lib/kie";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { KIE_MODEL, STORAGE_BUCKET } from "@/lib/constants";
import { Language, LANGUAGES } from "@/types";
import { getShortLocalizationNote, NEVER_TRANSLATE } from "@/lib/localization";

export const maxDuration = 180;

/**
 * Translate a single image from a page translation and update the HTML.
 * Called once per selected image from the ImageSelectionModal.
 */
export async function POST(req: NextRequest) {
  const { translationId, imageUrl, imageIndex, language, aspectRatio } = (await req.json()) as {
    translationId: string;
    imageUrl: string;
    imageIndex: number;
    language: string;
    aspectRatio?: string;
  };

  if (!translationId || !imageUrl || imageIndex === undefined || !language) {
    return NextResponse.json(
      { error: "translationId, imageUrl, imageIndex, and language are required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // Verify translation exists
  const { data: translation, error: tError } = await db
    .from("translations")
    .select("id, page_id, translated_html")
    .eq("id", translationId)
    .single();

  if (tError || !translation) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  try {
    // Build prompt
    const langLabel = LANGUAGES.find((l) => l.value === language)?.label ?? language;
    const langCode = language as Language;
    const neverTranslateList = NEVER_TRANSLATE.join(", ");
    const prompt = `Recreate this exact image but translate all text to ${langLabel}. The source text may be in any language (English, Swedish, or other). Keep the same visual style, layout, colors, and design. Only translate the text.\n\nNEVER TRANSLATE these brand names and certificates — keep them EXACTLY as-is: ${neverTranslateList}.${getShortLocalizationNote(langCode)}`;

    // Call Kie AI
    const resultUrls = await generateImage(
      prompt,
      [imageUrl],
      aspectRatio || "1:1"
    );

    if (!resultUrls?.length) {
      throw new Error("No image generated");
    }

    // Download from Kie CDN
    const resultRes = await fetch(resultUrls[0]);
    if (!resultRes.ok) {
      throw new Error("Failed to fetch generated image from Kie.ai");
    }
    const buffer = Buffer.from(await resultRes.arrayBuffer());

    // Upload to Supabase Storage
    const filePath = `page-images/${translationId}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, { contentType: "image/png", upsert: false });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const newImageUrl = urlData.publicUrl;

    // Update the translated HTML — replace the image src at the given index
    const html = translation.translated_html;
    if (html) {
      const updatedHtml = replaceImageSrc(html, imageUrl, newImageUrl);
      await db
        .from("translations")
        .update({
          translated_html: updatedHtml,
          updated_at: new Date().toISOString(),
        })
        .eq("id", translationId);
    }

    // Log usage
    await db.from("usage_logs").insert({
      type: "image_generation",
      page_id: translation.page_id,
      translation_id: translationId,
      model: KIE_MODEL,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: KIE_IMAGE_COST,
      metadata: {
        image_url: imageUrl,
        new_image_url: newImageUrl,
        image_index: imageIndex,
        aspect_ratio: aspectRatio || "1:1",
        purpose: "page_batch_image_translation",
      },
    });

    return NextResponse.json({ newImageUrl });
  } catch (error) {
    console.error("Page image translation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image translation failed" },
      { status: 500 }
    );
  }
}

/**
 * Replace the src attribute of an image in HTML by matching the original URL.
 * Uses string replacement to avoid full DOM parsing overhead.
 */
function replaceImageSrc(html: string, oldSrc: string, newSrc: string): string {
  // Escape special regex chars in URL
  const escaped = oldSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match src="oldSrc" or src='oldSrc'
  const pattern = new RegExp(`(src=["'])${escaped}(["'])`, "g");
  return html.replace(pattern, `$1${newSrc}$2`);
}
