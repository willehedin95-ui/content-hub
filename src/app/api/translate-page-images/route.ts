import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createImageTask, pollTaskResult } from "@/lib/kie";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { KIE_MODEL, STORAGE_BUCKET } from "@/lib/constants";
import { Language, LANGUAGES } from "@/types";
import { getShortLocalizationNote, NEVER_TRANSLATE } from "@/lib/localization";
import sharp from "sharp";

export const maxDuration = 180;

/**
 * Translate a single image from a page translation and update the HTML.
 * Called once per selected image from the ImageSelectionModal.
 */
export async function POST(req: NextRequest) {
  const { translationId, imageUrl, imageIndex, language, aspectRatio } = (await req.json()) as {
    translationId: string;
    imageUrl: string;
    imageIndex?: number;
    language: string;
    aspectRatio?: string;
  };

  if (!translationId || !imageUrl || !language) {
    return NextResponse.json(
      { error: "translationId, imageUrl, and language are required" },
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
    // Detect original image dimensions to compute aspect ratio + resolution
    let detectedAspectRatio = aspectRatio || "1:1";
    let resolution = "2K";

    try {
      const probeRes = await fetch(imageUrl);
      if (probeRes.ok) {
        const probeBuffer = Buffer.from(await probeRes.arrayBuffer());
        const metadata = await sharp(probeBuffer).metadata();
        if (metadata.width && metadata.height) {
          const w = metadata.width;
          const h = metadata.height;
          const ratio = w / h;

          // Compute Kie-compatible aspect ratio from actual dimensions
          if (!aspectRatio) {
            if (ratio > 1.6) detectedAspectRatio = "16:9";
            else if (ratio > 1.2) detectedAspectRatio = "4:3";
            else if (ratio > 0.9) detectedAspectRatio = "1:1";
            else if (ratio > 0.7) detectedAspectRatio = "3:4";
            else detectedAspectRatio = "9:16";
          }

          // Use 4K for images larger than 2048px on any side
          if (w > 2048 || h > 2048) {
            resolution = "4K";
          }
        }
      }
    } catch {
      // Dimension detection failed — use defaults
    }

    // Build prompt
    const langLabel = LANGUAGES.find((l) => l.value === language)?.label ?? language;
    const langCode = language as Language;
    const neverTranslateList = NEVER_TRANSLATE.join(", ");
    const prompt = `Recreate this exact image but translate all text to ${langLabel}. The source text may be in any language (English, Swedish, or other). Keep the same visual style, layout, colors, and design. Only translate the text.\n\nNEVER TRANSLATE these brand names and certificates — keep them EXACTLY as-is: ${neverTranslateList}.${getShortLocalizationNote(langCode)}`;

    // Call Kie AI with detected aspect ratio and resolution
    const taskId = await createImageTask(
      prompt,
      [imageUrl],
      detectedAspectRatio,
      resolution
    );
    const { urls: resultUrls, costTimeMs } = await pollTaskResult(taskId);

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
      const updatedHtml = replaceImageSrc(html, imageUrl, newImageUrl, imageIndex);
      if (updatedHtml === html) {
        console.warn(`[translate-page-images] replaceImageSrc failed — could not find image in HTML`, {
          translationId,
          imageUrl: imageUrl.slice(0, 120),
          imageIndex,
        });
      }
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
        ...(imageIndex !== undefined && { image_index: imageIndex }),
        aspect_ratio: detectedAspectRatio,
        resolution,
        purpose: "page_batch_image_translation",
        kie_cost_time_ms: costTimeMs,
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
 * Uses multiple fallback strategies to handle URL encoding mismatches.
 */
function replaceImageSrc(html: string, oldSrc: string, newSrc: string, imageIndex?: number): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Strategy 1: Direct match
  const result1 = html.replace(
    new RegExp(`(src=["'])${esc(oldSrc)}(["'])`, "g"),
    `$1${newSrc}$2`
  );
  if (result1 !== html) return result1;

  // Strategy 2: HTML entity encoding (& → &amp;)
  const encodedSrc = oldSrc.replace(/&/g, "&amp;");
  if (encodedSrc !== oldSrc) {
    const result2 = html.replace(
      new RegExp(`(src=["'])${esc(encodedSrc)}(["'])`, "g"),
      `$1${newSrc}$2`
    );
    if (result2 !== html) return result2;
  }

  // Strategy 3: URL-decoded match (%20 → space, %3D → =, etc.)
  try {
    const decodedSrc = decodeURIComponent(oldSrc);
    if (decodedSrc !== oldSrc) {
      const result3 = html.replace(
        new RegExp(`(src=["'])${esc(decodedSrc)}(["'])`, "g"),
        `$1${newSrc}$2`
      );
      if (result3 !== html) return result3;
    }
  } catch { /* invalid URI */ }

  // Strategy 4: Path-only match (strip query params from both sides)
  const oldPath = oldSrc.split("?")[0];
  if (oldPath !== oldSrc && oldPath.length > 20) {
    const result4 = html.replace(
      new RegExp(`(src=["'])${esc(oldPath)}[^"']*?(["'])`, "g"),
      `$1${newSrc}$2`
    );
    if (result4 !== html) return result4;
  }

  // Strategy 5: Filename match (last path segment) — most aggressive
  const filename = oldSrc.split("/").pop()?.split("?")[0];
  if (filename && filename.length > 5) {
    // Count matches to ensure we only replace if exactly one img has this filename
    const matchPattern = new RegExp(`src=["'][^"']*/${esc(filename)}[^"']*?["']`, "g");
    const matches = html.match(matchPattern);
    if (matches && matches.length === 1) {
      return html.replace(
        new RegExp(`(src=["'])[^"']*/${esc(filename)}[^"']*?(["'])`, ""),
        `$1${newSrc}$2`
      );
    }
  }

  // Strategy 6: Index-based fallback — find the Nth <img> and replace its src
  if (imageIndex !== undefined) {
    let count = 0;
    const imgPattern = /(<img\s[^>]*?src=["'])([^"']+)(["'][^>]*?>)/gi;
    const result6 = html.replace(imgPattern, (match, prefix, src, suffix) => {
      if (count++ === imageIndex) {
        return `${prefix}${newSrc}${suffix}`;
      }
      return match;
    });
    if (result6 !== html) return result6;
  }

  // Strategy 7: srcset fallback
  return html.replace(new RegExp(esc(oldSrc), "g"), newSrc);
}
