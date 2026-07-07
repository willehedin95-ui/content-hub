import { NextRequest, NextResponse, after } from "next/server";
import * as cheerio from "cheerio";
import { createServerSupabase } from "@/lib/supabase-admin";
import { createImageTask, pollTaskResult } from "@/lib/kie";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { KIE_MODEL, STORAGE_BUCKET } from "@/lib/constants";
import { getWorkspaceId } from "@/lib/workspace";
import { Language, LANGUAGES } from "@/types";
import { getShortLocalizationNote, NEVER_TRANSLATE } from "@/lib/localization";
import sharp from "sharp";

// Vercel PRO cap is 800s. Kie polling alone can take up to ~280s per image,
// so 180 killed paid renders mid-flight (audit 2026-07-07, L2).
export const maxDuration = 800;

// Keep each server-side batch safely inside the 800s cap: worst-case Kie
// polling is ~280s/image, so a large batch could blow past maxDuration and
// strand image_status='translating' (function killed = catch never runs).
// Clients chunk their selection and send the next batch when the previous
// finishes - each chunk is server-driven and survives a closed tab.
const MAX_BATCH_IMAGES = 10;

type Db = ReturnType<typeof createServerSupabase>;

interface BatchImage {
  src: string;
  index?: number;
  aspectRatio?: string;
}

/**
 * Translate page images via Kie AI and update the translation HTML.
 *
 * Two modes:
 *
 * 1. Batch (audit 2026-07-07, L1): body = { translationId, language, images: [{src, index?, aspectRatio?}] }
 *    Starts a SERVER-side sequential drain via after() - progress is tracked
 *    in translations.image_status/images_done/images_total and polled by the
 *    client via /api/translations/[id]/image-status. Closing the tab no
 *    longer strands the batch (the old client-driven queue did).
 *
 * 2. Single image (editor flows): body = { translationId, imageUrl, imageIndex?, language, aspectRatio? }
 *    Translates one image synchronously and returns { newImageUrl }.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    translationId: string;
    imageUrl?: string;
    imageIndex?: number;
    language: string;
    aspectRatio?: string;
    images?: BatchImage[];
  };

  const { translationId, imageUrl, imageIndex, language, aspectRatio, images } = body;

  if (!translationId || !language || (!imageUrl && !images?.length)) {
    return NextResponse.json(
      { error: "translationId, language, and imageUrl or images[] are required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Verify translation exists + belongs to the active workspace (audit P3)
  const { data: translation, error: tError } = await db
    .from("translations")
    .select("id, page_id, translated_html, images_done, images_total, pages!inner(workspace_id)")
    .eq("id", translationId)
    .single();

  if (tError || !translation) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }
  const tPages = translation.pages as unknown as { workspace_id?: string } | null;
  if (tPages?.workspace_id && tPages.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  // -------------------------------------------------------------------------
  // Batch mode - server-driven drain
  // -------------------------------------------------------------------------
  if (images?.length) {
    const validImages = images.filter(
      (img) => img && typeof img.src === "string" && img.src.length > 0
    );
    const batch = validImages.slice(0, MAX_BATCH_IMAGES);
    const truncated = validImages.length - batch.length;

    if (batch.length === 0) {
      return NextResponse.json({ error: "No valid images in batch" }, { status: 400 });
    }

    // Claim the batch (audit follow-up F5): two concurrent starts for the
    // same translation would double-drain and double-bill. Only claim when
    // no batch is running; a batch stranded >15 min (killed function) may
    // be force-claimed.
    const claimUpdate = {
      image_status: "translating",
      images_done: 0,
      images_total: batch.length,
      error_message: null,
      updated_at: new Date().toISOString(),
    };
    const { data: claimRows, error: initError } = await db
      .from("translations")
      .update(claimUpdate)
      .eq("id", translationId)
      .or("image_status.is.null,image_status.neq.translating")
      .select("id");

    if (initError) {
      return NextResponse.json(
        { error: `Failed to start batch: ${initError.message}` },
        { status: 500 }
      );
    }

    if (!claimRows || claimRows.length === 0) {
      // A batch appears to be running - allow takeover only if it's stale
      const STALE_BATCH_MS = 15 * 60 * 1000;
      const { data: current } = await db
        .from("translations")
        .select("updated_at")
        .eq("id", translationId)
        .maybeSingle();
      const isStale =
        current?.updated_at &&
        Date.now() - new Date(current.updated_at).getTime() > STALE_BATCH_MS;
      if (!isStale) {
        return NextResponse.json(
          { error: "An image translation batch is already running for this translation" },
          { status: 409 }
        );
      }
      const { error: forceError } = await db
        .from("translations")
        .update(claimUpdate)
        .eq("id", translationId);
      if (forceError) {
        return NextResponse.json(
          { error: `Failed to start batch: ${forceError.message}` },
          { status: 500 }
        );
      }
    }

    after(async () => {
      try {
        await drainBatch(db, translationId, translation.page_id, batch, language);
      } catch (err) {
        console.error("[translate-page-images] batch drain crashed:", err);
        await db
          .from("translations")
          .update({
            image_status: "error",
            error_message: `Image batch crashed: ${err instanceof Error ? err.message : "unknown"}`,
          })
          .eq("id", translationId)
          .then(({ error }) => {
            if (error) console.error("[translate-page-images] failed to record crash:", error.message);
          });
      }
    });

    // `truncated`/`remaining` tell the client to send another chunk once
    // this batch reaches image_status done/error.
    return NextResponse.json({
      ok: true,
      total: batch.length,
      truncated,
      remaining: truncated,
    });
  }

  // -------------------------------------------------------------------------
  // Single-image mode
  // -------------------------------------------------------------------------
  try {
    const newImageUrl = await translateOneImage(
      db,
      translationId,
      translation.page_id,
      imageUrl!,
      language,
      imageIndex,
      aspectRatio
    );
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
 * Sequentially translate all images in a batch server-side, updating
 * images_done after each attempt. Failure counting (audit L4): ANY failed
 * image marks the batch image_status='error' with a count in error_message -
 * previously only a failure on the LAST image was ever surfaced.
 */
async function drainBatch(
  db: Db,
  translationId: string,
  pageId: string,
  batch: BatchImage[],
  language: string
): Promise<void> {
  let failed = 0;
  const failMessages: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const img = batch[i];
    try {
      await translateOneImage(
        db,
        translationId,
        pageId,
        img.src,
        language,
        img.index,
        img.aspectRatio
      );
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : "unknown error";
      failMessages.push(`image ${i + 1}: ${msg}`);
      console.error(`[translate-page-images] batch image ${i + 1}/${batch.length} failed:`, msg);
    }

    // updated_at bump doubles as batch heartbeat for the stale-takeover check
    const { error: progressError } = await db
      .from("translations")
      .update({ images_done: i + 1, updated_at: new Date().toISOString() })
      .eq("id", translationId);
    if (progressError) {
      console.error("[translate-page-images] progress update failed:", progressError.message);
    }
  }

  const summary =
    failed > 0
      ? `${failed} of ${batch.length} image(s) failed to translate: ${failMessages.slice(0, 3).join("; ")}${failMessages.length > 3 ? "; …" : ""}`
      : null;

  const { error: finalError } = await db
    .from("translations")
    .update({
      image_status: failed > 0 ? "error" : "done",
      images_done: batch.length,
      error_message: summary,
    })
    .eq("id", translationId);
  if (finalError) {
    console.error("[translate-page-images] final status update failed:", finalError.message);
  }
}

/**
 * Translate ONE image via Kie AI, upload the result to storage, and swap the
 * src in translated_html. Returns the new public URL. Throws on failure.
 */
async function translateOneImage(
  db: Db,
  translationId: string,
  pageId: string,
  imageUrl: string,
  language: string,
  imageIndex?: number,
  aspectRatio?: string
): Promise<string> {
  // Detect original image dimensions to compute aspect ratio + resolution
  let detectedAspectRatio = aspectRatio || "4:5";
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
    // Dimension detection failed - use defaults
  }

  // Build prompt
  const langLabel = LANGUAGES.find((l) => l.value === language)?.label ?? language;
  const langCode = language as Language;
  const neverTranslateList = NEVER_TRANSLATE.join(", ");
  const prompt = `Recreate this exact image but translate all text to ${langLabel}. The source text may be in any language (English, Swedish, or other). Keep the same visual style, layout, colors, and design. Only translate the text.\n\nNEVER TRANSLATE these brand names and certificates - keep them EXACTLY as-is: ${neverTranslateList}.${getShortLocalizationNote(langCode)}`;

  // Call Kie AI with detected aspect ratio and resolution
  const taskId = await createImageTask(prompt, [imageUrl], detectedAspectRatio, resolution);
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

  // Swap the src in translated_html on a FRESH row read with optimistic
  // concurrency - the old code read the HTML at request start and wrote it
  // back after a 1-3 min render, silently reverting any autosave edits made
  // in between (audit 2026-07-07, P2 lost-update).
  await applyImageReplacement(db, translationId, imageUrl, newImageUrl, imageIndex);

  // Log usage - errors are logged, not swallowed (audit P3)
  const { error: logError } = await db.from("usage_logs").insert({
    type: "image_generation",
    page_id: pageId,
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
  if (logError) {
    console.error("[translate-page-images] usage_logs insert failed:", logError.message);
  }

  return newImageUrl;
}

/**
 * Replace an image src in the translation's HTML using a retry loop on a
 * fresh row (optimistic concurrency via updated_at). Up to 3 guarded
 * attempts, then one final unguarded write on a fresh read.
 */
async function applyImageReplacement(
  db: Db,
  translationId: string,
  oldSrc: string,
  newSrc: string,
  imageIndex?: number
): Promise<void> {
  const MAX_GUARDED_ATTEMPTS = 3;

  for (let attempt = 0; attempt <= MAX_GUARDED_ATTEMPTS; attempt++) {
    const { data: fresh, error: readError } = await db
      .from("translations")
      .select("translated_html, updated_at")
      .eq("id", translationId)
      .single();

    if (readError || !fresh?.translated_html) {
      if (readError) {
        console.error("[translate-page-images] fresh read failed:", readError.message);
      }
      return;
    }

    const { html: updatedHtml, replaced } = replaceImageSrc(
      fresh.translated_html,
      oldSrc,
      newSrc,
      imageIndex
    );

    if (!replaced) {
      console.warn(`[translate-page-images] replaceImageSrc failed - could not find image in HTML`, {
        translationId,
        imageUrl: oldSrc.slice(0, 120),
        imageIndex,
      });
      return;
    }

    const isFinalAttempt = attempt === MAX_GUARDED_ATTEMPTS;
    let query = db
      .from("translations")
      .update({
        translated_html: updatedHtml,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translationId);
    if (!isFinalAttempt) {
      // Optimistic lock: only write if nobody saved since our read
      query = query.eq("updated_at", fresh.updated_at);
    }
    const { data: updatedRows, error: writeError } = await query.select("id");

    if (writeError) {
      console.error("[translate-page-images] HTML update failed:", writeError.message);
      return;
    }
    if (updatedRows && updatedRows.length > 0) {
      return; // success
    }
    // Row changed under us (autosave) - retry with a fresh read
  }
}

/**
 * Replace the src of the matching <img> in HTML. DOM-based (cheerio) so we
 * can also remove `srcset` and any wrapping <picture><source> variants -
 * otherwise browsers keep showing the original-language image from srcset
 * on the published page (audit 2026-07-07, P2 srcset; mirrors the editor's
 * ImagePanel.swapImageInIframe behavior).
 *
 * Matching strategies, most→least specific: exact src, URL-decoded,
 * path-only (query params stripped), unique filename, index fallback.
 */
function replaceImageSrc(
  html: string,
  oldSrc: string,
  newSrc: string,
  imageIndex?: number
): { html: string; replaced: boolean } {
  // scriptingEnabled: false makes parse5 parse <noscript> CONTENT as elements
  // (same as the client's DOMParser, where scripting is always off). Without
  // it, noscript imgs are raw text here but counted by the client's index,
  // so the index fallback could hit the wrong image on lazyload pages (F6).
  const $ = cheerio.load(html, { scriptingEnabled: false });
  const imgs = $("img").toArray();

  const srcOf = (el: (typeof imgs)[number]) => $(el).attr("src") || "";

  let target: (typeof imgs)[number] | undefined;

  // 1. Exact match (cheerio decodes HTML entities, so &amp; variants match too)
  target = imgs.find((el) => srcOf(el) === oldSrc);

  // 2. URL-decoded match (%20 → space, %3D → =, etc.)
  if (!target) {
    try {
      const decoded = decodeURIComponent(oldSrc);
      if (decoded !== oldSrc) {
        target = imgs.find((el) => srcOf(el) === decoded);
      }
    } catch {
      /* invalid URI */
    }
  }

  // 3. Path-only match (strip query params from both sides)
  if (!target) {
    const oldPath = oldSrc.split("?")[0];
    if (oldPath.length > 20) {
      target = imgs.find((el) => srcOf(el).split("?")[0] === oldPath);
    }
  }

  // 4. Filename match - only if exactly one img carries this filename
  if (!target) {
    const filename = oldSrc.split("/").pop()?.split("?")[0];
    if (filename && filename.length > 5) {
      const matches = imgs.filter((el) => srcOf(el).includes(`/${filename}`));
      if (matches.length === 1) target = matches[0];
    }
  }

  // 5. Index-based fallback - the Nth <img> in the document
  if (!target && imageIndex !== undefined && imgs[imageIndex]) {
    target = imgs[imageIndex];
  }

  if (!target) {
    return { html, replaced: false };
  }

  const $target = $(target);
  $target.attr("src", newSrc);
  $target.removeAttr("srcset");
  $target.removeAttr("data-src");
  const picture = $target.closest("picture");
  if (picture.length > 0) {
    picture.find("source").remove();
  }

  return { html: $.html(), replaced: true };
}
