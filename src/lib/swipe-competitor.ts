/**
 * Shared competitor ad swipe logic.
 *
 * Extracted from autopilot-concepts cron so both the cron and the
 * Ad Spy UI can call the same pipeline:
 *   1. Claude Vision analysis of competitor image(s)
 *   2. Create image_job with concept data
 *   3. Generate images via Kie AI
 *   4. Upload to Supabase Storage
 *   5. (Optional) send Telegram notification
 */

import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getLanguagesByWorkspaceId, getAdCopyLanguageByWorkspaceId } from "@/lib/workspace";
import { findBestLandingPage } from "@/lib/landing-page-recommender";
import { sendPhoto, sendMessageWithInlineKeyboard, sendMediaGroup } from "@/lib/telegram";
import {
  buildBrainstormSystemPrompt,
  buildBrainstormUserPrompt,
  buildHookInspiration,
  buildLearningsContext,
  sanitizePrices,
  containsPrice,
} from "@/lib/brainstorm";
import { generateImage } from "@/lib/kie";
import { CLAUDE_MODEL, STORAGE_BUCKET, KIE_MODEL } from "@/lib/constants";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { getProductAppearance } from "@/lib/product-appearance";
import type {
  BrainstormRequest,
  ProductFull,
  CopywritingGuideline,
  ProductSegment,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwipeInput {
  workspaceId: string;
  productSlug: string;
  competitorImageUrls: string[];
  competitorAdCopy?: string;
  brandName: string;
  gethookdAdId?: number;
  notifyTelegram?: boolean;
  /** If provided, use this existing job instead of creating a new one */
  existingJobId?: string;
  /** Pain point to focus the concept on (e.g., "neck-pain", "snoring"). Omit for auto-detect. */
  painPoint?: string;
  /** When true, force include_product_reference=false and strip product from prompts.
   *  Set automatically when the source board name contains "native". */
  forceNoProduct?: boolean;
  /** Swipe mode: "faithful" recreates the image closely (same subject matter),
   *  "adapt" remaps the problem domain to our product. Defaults to "adapt". */
  swipeMode?: "faithful" | "adapt";
  /** Free-form user instructions that override details from the competitor ad
   *  (e.g. "Change offer badge to 'Prova 30 dagar - 249 kr'"). */
  customInstructions?: string;
}

export interface SwipeResult {
  jobId: string;
  conceptName: string;
  conceptNumber: number;
  imagesGenerated: number;
  landingPageAssigned: boolean;
}

// ---------------------------------------------------------------------------
// Main swipe function
// ---------------------------------------------------------------------------

export async function swipeCompetitorAd(input: SwipeInput): Promise<SwipeResult> {
  const fnStartMs = Date.now();
  const db = createServerSupabase();
  const {
    workspaceId,
    productSlug,
    competitorImageUrls,
    competitorAdCopy,
    brandName,
    notifyTelegram,
    existingJobId,
  } = input;

  // Helper to update swipe_progress on existing job (for live UI updates)
  async function updateProgress(jobId: string, step: string, message: string) {
    await db.from("image_jobs").update({
      swipe_progress: { step, message },
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  }

  if (existingJobId) {
    await updateProgress(existingJobId, "analyzing", "Analyzing competitor ad with AI...");
  }

  // --- Fetch product context ---
  const { data: product } = await db.from("products").select("*").eq("slug", productSlug).single();
  if (!product) throw new Error("Product not found");

  const { data: guidelines } = await db.from("copywriting_guidelines").select("*").eq("product_id", product.id);
  const { data: segments } = await db.from("product_segments").select("*").eq("product_id", product.id);
  const hookInspiration = await buildHookInspiration(productSlug, workspaceId);
  const learningsContext = await buildLearningsContext(productSlug, workspaceId);
  const { buildResearchContext } = await import("@/lib/research-context");
  const researchContext = await buildResearchContext(productSlug, workspaceId);

  // --- Fetch product hero images EARLY so we can pass them to Claude as a
  // visual anchor. Without this, Claude hallucinates product colors/materials
  // ("amber glass bottle" for a white plastic bottle, etc.) because it's only
  // seen the competitor image and has no reference for our actual product.
  const { data: productImages } = await db
    .from("product_images")
    .select("url, category")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  const productHeroUrls = (productImages ?? [])
    .filter((i) => i.category === "product" || i.category === "hero")
    .slice(0, 3)
    .map((i) => i.url);

  // --- Determine generation language (e.g. "sv" for Hydro13) ---
  const generationLanguage = await getAdCopyLanguageByWorkspaceId(workspaceId);

  // --- Build prompts ---
  const swipeMode = input.swipeMode ?? "adapt";
  const systemPrompt = buildBrainstormSystemPrompt(
    product as ProductFull,
    undefined,
    (guidelines ?? []) as CopywritingGuideline[],
    (segments ?? []) as ProductSegment[],
    "from_competitor_ad",
    hookInspiration,
    learningsContext,
    competitorImageUrls.length,
    3,
    input.painPoint,
    researchContext,
    generationLanguage,
    swipeMode,
    input.customInstructions
  );

  const userPrompt = buildBrainstormUserPrompt(
    {
      mode: "from_competitor_ad",
      product: productSlug,
      count: 3,
      competitor_image_urls: competitorImageUrls,
      competitor_ad_copy: competitorAdCopy?.slice(0, 2000),
      competitor_pain_point: input.painPoint,
    } as BrainstormRequest,
    (segments ?? []) as ProductSegment[],
  );

  // --- Call Claude Vision ---
  // Message structure:
  //   1. Competitor ad images (labeled as "COMPETITOR ADS")
  //   2. Product hero image(s) (labeled as "OUR PRODUCT")
  //   3. User prompt text
  // This prevents Claude from confusing the two sets of images and gives it
  // a concrete visual anchor for what our product actually looks like when
  // writing image prompts.
  const messageContent: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "url"; url: string } }
  > = [];

  messageContent.push({
    type: "text",
    text: `The following ${competitorImageUrls.length > 1 ? `${competitorImageUrls.length} images are` : "image is"} COMPETITOR ADS — reverse-engineer the visual format and persuasion structure:`,
  });
  for (const url of competitorImageUrls) {
    messageContent.push({ type: "image", source: { type: "url", url } });
  }

  if (productHeroUrls.length > 0) {
    messageContent.push({
      type: "text",
      text: `\n---\n\nThe following ${productHeroUrls.length > 1 ? `${productHeroUrls.length} images show` : "image shows"} OUR PRODUCT (${product.name}). **This is what our product actually looks like.** When you describe our product in any image prompt (Subject, MadeOutOf, RoomObjects, Accessories, Arrangement fields), you MUST describe what you see in THIS image — not what the competitor's product looks like. Never invent colors, materials, or shapes for our product:`,
    });
    for (const url of productHeroUrls) {
      messageContent.push({ type: "image", source: { type: "url", url } });
    }
  }

  messageContent.push({ type: "text", text: `\n---\n\n${userPrompt}` });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    // 16000 — each JSON image_prompt is ~500-800 tokens, and with 3 competitor
    // images × 3 variations = 9 prompts, plus analysis + concept metadata, we
    // need comfortable headroom. 8000 was silently truncating the response,
    // causing the JSON repair path to salvage only 1-2 prompts out of 9.
    max_tokens: 16000,
    temperature: 0.7,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: messageContent }],
  });

  const rawContent = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  if (!rawContent) throw new Error("Claude returned empty response");

  // --- Parse response ---
  let parsed: {
    analysis: Record<string, unknown>;
    concept: {
      concept_name: string;
      concept_description?: string;
      cash_dna: Record<string, unknown>;
      ad_copy_primary: string[];
      ad_copy_headline: string[];
      visual_direction: string;
      differentiation_note?: string;
      suggested_tags?: string[];
    };
    image_prompts: Array<{
      source_index?: number;
      prompt: string;
      hook_text: string;
      headline_text: string;
      has_text?: boolean;
      include_product_reference?: boolean;
    }>;
  };

  try {
    // Strip markdown fences (various formats Claude might use)
    let cleaned = rawContent;
    // Remove leading ```json or ``` with optional whitespace
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
    // Remove trailing ```
    cleaned = cleaned.replace(/\n?\s*```\s*$/i, "");
    // If response starts with non-JSON text before the first {, extract the JSON
    const firstBrace = cleaned.indexOf("{");
    if (firstBrace > 0) {
      cleaned = cleaned.slice(firstBrace);
    }
    // Remove trailing text after the last } (Claude sometimes adds commentary)
    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace >= 0 && lastBrace < cleaned.length - 1) {
      cleaned = cleaned.slice(0, lastBrace + 1);
    }
    cleaned = cleaned.trim();
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error("[swipe-competitor] JSON parse failed, attempting repair. First 500 chars:", rawContent.slice(0, 500));
    // Retry: ask Claude to fix the JSON
    try {
      const repairResponse = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        temperature: 0,
        messages: [{
          role: "user",
          content: `The following text was supposed to be valid JSON but failed to parse. Extract and return ONLY the valid JSON object, fixing any syntax errors. Return nothing but the JSON — no markdown fences, no explanation.\n\n${rawContent}`,
        }],
      });
      const repairContent = repairResponse.content[0]?.type === "text" ? repairResponse.content[0].text.trim() : "";
      let repairCleaned = repairContent;
      repairCleaned = repairCleaned.replace(/^```(?:json)?\s*\n?/i, "");
      repairCleaned = repairCleaned.replace(/\n?\s*```\s*$/i, "");
      const firstBraceRepair = repairCleaned.indexOf("{");
      if (firstBraceRepair > 0) repairCleaned = repairCleaned.slice(firstBraceRepair);
      const lastBraceRepair = repairCleaned.lastIndexOf("}");
      if (lastBraceRepair >= 0 && lastBraceRepair < repairCleaned.length - 1) repairCleaned = repairCleaned.slice(0, lastBraceRepair + 1);
      parsed = JSON.parse(repairCleaned.trim());
      console.log("[swipe-competitor] JSON repair succeeded");
    } catch (repairErr) {
      console.error("[swipe-competitor] JSON repair also failed. First 500 chars:", rawContent.slice(0, 500));
      throw new Error("Failed to parse Claude response");
    }
  }

  if (!parsed.concept || !parsed.image_prompts?.length) {
    throw new Error("Missing required fields in Claude response");
  }

  // Trim to expected count — Claude sometimes returns more prompts than requested
  const expectedCount = competitorImageUrls.length * 3; // 3 variations per competitor image
  if (parsed.image_prompts.length > expectedCount) {
    parsed.image_prompts = parsed.image_prompts.slice(0, expectedCount);
  }

  // --- NO PRICES safety net ---
  // Strip any currency amounts Claude slipped into cash_dna.hooks, visual_direction,
  // concept_description, or image_prompts. The prompt already tells it not to, but
  // on 2026-04-07 the "€80 serum" bug baked a price into concept #018's overlay text.
  // Belt-and-suspenders: scrub now so nothing downstream (image briefs, Nano Banana,
  // ad copy) can render the bad data.
  const priceFieldsBefore = JSON.stringify({
    hooks: parsed.concept.cash_dna?.hooks,
    visual_direction: parsed.concept.visual_direction,
    image_prompts: parsed.image_prompts,
  });
  sanitizePrices(parsed.concept);
  parsed.image_prompts = sanitizePrices({ image_prompts: parsed.image_prompts }).image_prompts;
  const priceFieldsAfter = JSON.stringify({
    hooks: parsed.concept.cash_dna?.hooks,
    visual_direction: parsed.concept.visual_direction,
    image_prompts: parsed.image_prompts,
  });
  if (priceFieldsBefore !== priceFieldsAfter) {
    console.warn(
      "[swipe-competitor] sanitizePrices stripped currency amounts from Claude output. " +
        "Review brainstorm prompt if this keeps triggering."
    );
  }
  // Final tripwire: if anything still contains a price marker, bail out loudly
  // rather than push bad data downstream.
  const dnaHooksRaw = parsed.concept.cash_dna?.hooks;
  const dnaHooks: unknown[] = Array.isArray(dnaHooksRaw) ? dnaHooksRaw : [];
  const stillDirty =
    dnaHooks.some((h) => typeof h === "string" && containsPrice(h)) ||
    (typeof parsed.concept.visual_direction === "string" && containsPrice(parsed.concept.visual_direction)) ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parsed.image_prompts.some((ip: any) => {
      if (!ip || typeof ip !== "object") return false;
      return (
        (typeof ip.prompt === "string" && containsPrice(ip.prompt)) ||
        (typeof ip.overlay_text === "string" && containsPrice(ip.overlay_text)) ||
        (typeof ip.hook_text === "string" && containsPrice(ip.hook_text))
      );
    });
  if (stillDirty) {
    throw new Error(
      "Claude output still contained currency amounts after sanitizePrices — sanitizer regex is too narrow"
    );
  }

  // --- PRODUCT REFERENCE safety net ---
  // When forceNoProduct is set (e.g. source board name contains "native"),
  // override Claude's include_product_reference to false and strip product
  // name mentions from prompt text. This prevents product hero reference
  // images from being passed to Nano Banana, which would render an accurate
  // product bottle in native/UGC scenes where no product should appear.
  //
  // When forceNoProduct is NOT set, trust Claude's decision — the competitor
  // ad likely shows a product and we want our product in the same style.
  const productName = product.name; // e.g. "Hydro13", "HappySleep"
  if (input.forceNoProduct) {
    for (const ip of parsed.image_prompts) {
      if (ip.include_product_reference === true) {
        ip.include_product_reference = false;
        console.warn(
          `[swipe-competitor] Overrode include_product_reference to false for "${productName}" (forceNoProduct from native board).`
        );
      }
      if (typeof ip.prompt !== "object" || ip.prompt === null) continue;
      const jsonPrompt = ip.prompt as Record<string, unknown>;
      const productPattern = new RegExp(
        `[^.]*\\b${productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^.]*\\.?\\s*`,
        "gi"
      );
      let stripped = false;
      for (const key of Object.keys(jsonPrompt)) {
        const val = jsonPrompt[key];
        if (typeof val !== "string") continue;
        const cleaned = val.replace(productPattern, "").replace(/,\s*,/g, ",").replace(/^[,\s]+|[,\s]+$/g, "").trim();
        if (cleaned !== val) {
          jsonPrompt[key] = cleaned;
          stripped = true;
        }
      }
      if (stripped) {
        console.warn(
          `[swipe-competitor] Stripped "${productName}" references from image_prompt (native board).`
        );
      }
    }
  }

  // --- Create or update image_job ---
  const { data: lastJob } = await db
    .from("image_jobs")
    .select("concept_number")
    .eq("workspace_id", workspaceId)
    .not("concept_number", "is", null)
    .order("concept_number", { ascending: false })
    .limit(1)
    .single();

  const nextConceptNumber = ((lastJob?.concept_number as number) ?? 0) + 1;

  const tags = [...(parsed.concept.suggested_tags ?? []), "competitor-swipe"];
  if (input.gethookdAdId) tags.push("ad-spy");

  const cashDna = {
    ...(parsed.concept.cash_dna ?? {}),
    ad_source: "competitor_swipe",
    swiped_from: brandName,
    swiped_ad_id: input.gethookdAdId,
    pain_point: input.painPoint || "auto-detect",
  };

  // productHeroUrls already fetched earlier (before the Claude call)
  // so we could pass them as a visual anchor to Claude.

  // Build a textual product appearance description for Kie AI prompts
  const productAppearance = getProductAppearance(product);

  let job: { id: string };

  if (existingJobId) {
    // Update the placeholder job created by the swipe endpoint
    await db.from("image_jobs").update({
      name: parsed.concept.concept_name,
      concept_number: nextConceptNumber,
      cash_dna: cashDna,
      ad_copy_primary: parsed.concept.ad_copy_primary,
      ad_copy_headline: parsed.concept.ad_copy_headline,
      visual_direction: parsed.concept.visual_direction,
      tags,
      source_language: generationLanguage,
      swipe_progress: { step: "generating", message: `Generating image 1 of ${parsed.image_prompts.length}...` },
      custom_instructions: input.customInstructions || null,
    }).eq("id", existingJobId);
    job = { id: existingJobId };
  } else {
    // Create a new job (used by cron/process-next)
    const { data: newJob, error: jobErr } = await db
      .from("image_jobs")
      .insert({
        workspace_id: workspaceId,
        name: parsed.concept.concept_name,
        product: productSlug,
        status: "draft",
        source: "autopilot",
        concept_number: nextConceptNumber,
        target_languages: await getLanguagesByWorkspaceId(workspaceId),
        target_ratios: ["4:5", "9:16"],
        cash_dna: cashDna,
        ad_copy_primary: parsed.concept.ad_copy_primary,
        ad_copy_headline: parsed.concept.ad_copy_headline,
        visual_direction: parsed.concept.visual_direction,
        tags,
        source_language: generationLanguage,
        pending_competitor_gen: {
          image_prompts: parsed.image_prompts,
          competitor_image_urls: competitorImageUrls,
          product_hero_urls: productHeroUrls,
        },
        custom_instructions: input.customInstructions || null,
      })
      .select()
      .single();

    if (jobErr || !newJob) throw new Error(`Failed to create image_job: ${jobErr?.message}`);
    job = newJob;
  }

  // --- Auto-assign landing page ---
  const landingPageId = await findBestLandingPage(db, workspaceId, productSlug, {
    adCopyPrimary: parsed.concept.ad_copy_primary,
    adCopyHeadline: parsed.concept.ad_copy_headline,
    conceptName: parsed.concept.concept_name,
  });
  if (landingPageId) {
    await db.from("image_jobs").update({ landing_page_id: landingPageId }).eq("id", job.id);
  }

  // --- Generate images ---
  // PARALLEL generation via Promise.allSettled — sequential was the root cause of
  // autopilot-concepts cron timeouts. With sequential at 30-90s/image × 3 images
  // = 90-270s, the 300s maxDuration killed the cron mid-loop, leaving partial
  // source_images and jobs stuck in "draft". Parallel cuts this to ~30-90s total.

  // Clear pending and store reference data
  await db.from("image_jobs").update({
    pending_competitor_gen: null,
    competitor_reference_data: {
      competitor_image_urls: competitorImageUrls,
      product_hero_urls: productHeroUrls,
    },
  }).eq("id", job.id);

  if (existingJobId) {
    await updateProgress(existingJobId, "generating", `Generating ${parsed.image_prompts.length} images in parallel...`);
  }

  const MAX_IMAGE_RETRIES = 2;

  // Build the full "rich" prompt for an image (includes JSON wrapping, text overlays,
  // product appearance, product hero references). This is what we try first.
  function buildFullPrompt(imgPrompt: typeof parsed.image_prompts[number]): {
    fullPrompt: string;
    referenceUrls: string[];
    isJsonPrompt: boolean;
    rawPromptForLog: string;
  } {
    const includeProduct = imgPrompt.include_product_reference === true;
    const referenceUrls = [
      competitorImageUrls[0],
      ...(includeProduct ? productHeroUrls : []),
    ];

    const promptRaw = imgPrompt.prompt;
    const isJsonPrompt = typeof promptRaw === "object" && promptRaw !== null;

    let fullPrompt: string;
    if (isJsonPrompt) {
      const jsonObj = { ...(promptRaw as Record<string, unknown>) };
      if (includeProduct && productAppearance) jsonObj.ProductDescription = productAppearance;
      const hasTextOverlay = !!(imgPrompt.hook_text?.trim() || imgPrompt.headline_text?.trim());
      if (hasTextOverlay) {
        const overlayParts: string[] = [];
        if (imgPrompt.hook_text?.trim()) overlayParts.push(`Bold headline: "${imgPrompt.hook_text}"`);
        if (imgPrompt.headline_text?.trim()) overlayParts.push(`Secondary line: "${imgPrompt.headline_text}"`);
        jsonObj.TextOverlay = overlayParts.join(". ");
      }
      fullPrompt = JSON.stringify(jsonObj);
    } else {
      fullPrompt = String(promptRaw);
      if (includeProduct && productAppearance) fullPrompt += " " + productAppearance;
      const hasTextOverlay = !!(imgPrompt.hook_text?.trim() || imgPrompt.headline_text?.trim());
      if (hasTextOverlay) {
        const textParts: string[] = [];
        if (imgPrompt.hook_text?.trim()) {
          textParts.push(`Bold, attention-grabbing headline text reading "${imgPrompt.hook_text}" prominently placed in the image with high contrast against the background.`);
        }
        if (imgPrompt.headline_text?.trim()) {
          textParts.push(`Secondary text line reading "${imgPrompt.headline_text}" placed below the main headline in a smaller but still legible font.`);
        }
        fullPrompt += " " + textParts.join(" ");
      }
    }

    return {
      fullPrompt,
      referenceUrls,
      isJsonPrompt,
      rawPromptForLog: isJsonPrompt ? JSON.stringify(promptRaw) : String(promptRaw),
    };
  }

  // Build a "softened" prompt — strips everything that commonly trips Kie AI's
  // content safety filter or makes Nano Banana refuse: text overlays, JSON
  // structure, product hero references, and the product appearance description
  // (which sometimes contains brand-y / claim-heavy language). Only the
  // descriptive scene parts and the style reference image survive.
  function buildSoftPrompt(imgPrompt: typeof parsed.image_prompts[number]): {
    fullPrompt: string;
    referenceUrls: string[];
  } {
    const promptRaw = imgPrompt.prompt;
    let softPrompt: string;
    if (typeof promptRaw === "object" && promptRaw !== null) {
      const j = promptRaw as Record<string, unknown>;
      // Pull only the most neutral, descriptive fields. Drop ColorRestriction,
      // RoomObjects, Accessories, Imperfections — those tend to encode the
      // "edgy" stuff that gets filtered.
      const parts = [j.Style, j.Subject, j.Background, j.Lighting, j.Camera, j.Mood, j.OutputStyle]
        .filter((v) => typeof v === "string" && (v as string).length > 0)
        .map((v) => String(v));
      softPrompt = parts.join(". ");
    } else {
      softPrompt = String(promptRaw);
    }
    // Generic, neutral framing — no claims, no overlays, no product details.
    softPrompt = `Natural, candid lifestyle photograph. ${softPrompt}`;
    return {
      fullPrompt: softPrompt,
      referenceUrls: [competitorImageUrls[0]],
    };
  }

  // Run a single image generation + storage upload + DB insert. Used by both
  // the main pass and the soft-retry pass. Throws on failure (caller catches
  // via Promise.allSettled).
  async function runSingleImage(
    imgPrompt: typeof parsed.image_prompts[number],
    index: number,
    builder: typeof buildFullPrompt | typeof buildSoftPrompt,
    retries: number,
    softMode: boolean,
  ): Promise<{ url: string; sourceImageId: string }> {
    const built = builder(imgPrompt);
    const { fullPrompt, referenceUrls } = built;

    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Calculate remaining time: 300s Vercel budget minus elapsed, minus 15s safety
        // buffer so Promise.allSettled has time to resolve and cleanup code can run.
        const elapsedMs = Date.now() - fnStartMs;
        const remainingMs = 800_000 - elapsedMs - 15_000;
        if (remainingMs <= 0) {
          throw new Error(`Image ${index + 1}: No time left (${Math.round(elapsedMs / 1000)}s elapsed)`);
        }
        const { urls: resultUrls, costTimeMs } = await generateImage(fullPrompt, referenceUrls, "4:5", "2K", remainingMs);
        if (!resultUrls?.length) throw new Error(`Image ${index + 1}: No image generated`);

        const resultRes = await fetch(resultUrls[0]);
        if (!resultRes.ok) throw new Error(`Image ${index + 1}: Failed to download`);
        const buffer = Buffer.from(await resultRes.arrayBuffer());

        const fileId = crypto.randomUUID();
        const filePath = `image-jobs/${job.id}/${fileId}.png`;
        const { error: uploadError } = await db.storage
          .from(STORAGE_BUCKET)
          .upload(filePath, buffer, { contentType: "image/png", upsert: false });
        if (uploadError) throw new Error(`Image ${index + 1}: Upload failed — ${uploadError.message}`);

        const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

        const promptForLog = "rawPromptForLog" in built
          ? (built as { rawPromptForLog: string }).rawPromptForLog
          : fullPrompt;

        const { data: sourceImage } = await db
          .from("source_images")
          .insert({
            job_id: job.id,
            original_url: urlData.publicUrl,
            filename: `competitor-swipe-${fileId.slice(0, 8)}.png`,
            processing_order: index,
            skip_translation: softMode || !(imgPrompt.has_text ?? !!(imgPrompt.hook_text?.trim() || imgPrompt.headline_text?.trim())),
            generation_prompt: promptForLog,
            generation_style: softMode ? "competitor-swipe-softretry" : "competitor-swipe",
            batch: 1,
          })
          .select()
          .single();

        await db.from("usage_logs").insert({
          type: "image_generation",
          page_id: null,
          translation_id: null,
          model: KIE_MODEL,
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: KIE_IMAGE_COST,
          metadata: {
            purpose: softMode ? "competitor_swipe_softretry" : "competitor_swipe",
            image_job_id: job.id,
            source_image_id: sourceImage?.id,
            kie_cost_time_ms: costTimeMs,
            reference_image_count: referenceUrls.length,
          },
        });

        return { url: urlData.publicUrl, sourceImageId: sourceImage?.id ?? "" };
      } catch (err) {
        lastErr = err;
        // Don't retry if we're running low on time - let Promise.allSettled resolve
        // so the cleanup code can mark the job as ready with partial images.
        const timeLeftMs = 800_000 - (Date.now() - fnStartMs) - 15_000;
        if (timeLeftMs <= 30_000 || attempt >= retries) {
          console.error(`[swipe-competitor] Image ${index + 1} failed (attempt ${attempt + 1}/${retries + 1}, ${Math.round(timeLeftMs / 1000)}s left)${softMode ? " (soft)" : ""}:`, err);
          break; // bail out so Promise.allSettled can resolve
        }
        console.warn(`[swipe-competitor] Image ${index + 1} attempt ${attempt + 1} failed${softMode ? " (soft)" : ""}, retrying (${Math.round(timeLeftMs / 1000)}s left)...`, err);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw lastErr ?? new Error(`Image ${index + 1}: All retries exhausted`);
  }

  // ----- First pass: full prompts -----
  const settled = await Promise.allSettled(
    parsed.image_prompts.map((imgPrompt, index) =>
      runSingleImage(imgPrompt, index, buildFullPrompt, MAX_IMAGE_RETRIES, false),
    ),
  );

  const imageResults: Array<{ url: string; sourceImageId: string }> = settled
    .filter((s): s is PromiseFulfilledResult<{ url: string; sourceImageId: string }> => s.status === "fulfilled")
    .map((s) => s.value);

  const firstPassFailures = settled
    .filter((s): s is PromiseRejectedResult => s.status === "rejected")
    .map((s) => (s.reason instanceof Error ? s.reason.message : String(s.reason)));

  if (firstPassFailures.length > 0) {
    console.warn(`[swipe-competitor] ${firstPassFailures.length}/${settled.length} images failed for job ${job.id}`);
  }

  // ----- Soft retry: only triggers when ALL images failed AND we have time -----
  // Almost always means Kie AI's content safety filter rejected the prompt.
  // Retry with stripped-down prompts: no overlays, no JSON, no product hero,
  // no product appearance description. Only the scene + style reference.
  let softRetryAttempted = false;
  const softRetryTimeLeft = 800_000 - (Date.now() - fnStartMs) - 15_000;
  if (imageResults.length === 0 && parsed.image_prompts.length > 0 && softRetryTimeLeft > 30_000) {
    softRetryAttempted = true;
    console.warn(`[swipe-competitor] All ${parsed.image_prompts.length} images failed for job ${job.id} — attempting soft retry with simplified prompts`);

    if (existingJobId) {
      await updateProgress(existingJobId, "retrying", "All images failed, retrying with simpler prompts...");
    }

    const softSettled = await Promise.allSettled(
      parsed.image_prompts.map((imgPrompt, index) =>
        runSingleImage(imgPrompt, index, buildSoftPrompt, 1, true),
      ),
    );

    for (const s of softSettled) {
      if (s.status === "fulfilled") imageResults.push(s.value);
    }

    if (imageResults.length > 0) {
      console.log(`[swipe-competitor] Soft retry recovered ${imageResults.length}/${parsed.image_prompts.length} images for job ${job.id}`);
    } else {
      console.error(`[swipe-competitor] Soft retry also failed for job ${job.id} — giving up`);
    }
  }

  // Update job status — mark as failed if no images were generated
  const finalStatus = imageResults.length > 0 ? "ready" : "failed";
  await db.from("image_jobs").update({
    status: finalStatus,
    swipe_progress: null,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);

  // Explicit alert when ALL images failed even after soft retry. This is the
  // path that used to be silent — Kie AI rejects everything and we'd just
  // mark the job failed without telling anyone.
  if (imageResults.length === 0) {
    const chatIdAlert = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatIdAlert) {
      const alertLines = [
        `🚫 [${product.name}] Swipe #${nextConceptNumber} failed: 0/${parsed.image_prompts.length} images generated`,
        `Concept: "${parsed.concept.concept_name}"`,
        `From: ${brandName}`,
        ``,
        `Soft retry attempted: ${softRetryAttempted ? "yes" : "no"}`,
        `Likely cause: Kie AI content safety filter rejected the prompts.`,
        ``,
      ];
      if (firstPassFailures.length > 0) {
        const sample = firstPassFailures[0];
        alertLines.push(`First error: ${sample.slice(0, 200)}`);
      }
      await sendMessageWithInlineKeyboard(chatIdAlert, alertLines.join("\n"), []).catch(() => {});
    }
  }

  // --- Telegram notification (optional) ---
  if (notifyTelegram) {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      const hubUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";
      const primaryText = parsed.concept.ad_copy_primary?.[0] ?? "";
      const headline = parsed.concept.ad_copy_headline?.[0] ?? "";

      const captionLines = [
        `🔍 [${product.name}] Swipe #${nextConceptNumber}: "${parsed.concept.concept_name}"`,
        `From: ${brandName}`,
        ``,
      ];
      if (primaryText) {
        const truncated = primaryText.length > 300 ? primaryText.slice(0, 300) + "..." : primaryText;
        captionLines.push(truncated);
        captionLines.push(``);
      }
      if (headline) {
        captionLines.push(`Headline: ${headline}`);
        captionLines.push(``);
      }
      captionLines.push(`Images: ${imageResults.length}/${parsed.image_prompts.length} | Page: ${landingPageId ? "Yes" : "No"}`);
      captionLines.push(`${hubUrl}/concepts/${job.id}`);
      captionLines.push(`Review: ${hubUrl}/review?highlight=${job.id}`);

      const caption = captionLines.join("\n");

      const buttons = [[
        { text: "\u2705 Approve", callback_data: `concept_approve:${job.id}` },
        { text: "\u274c Reject", callback_data: `concept_reject:${job.id}` },
      ]];

      if (imageResults.length > 1) {
        const imageUrls = imageResults.map((r) => r.url);
        const mediaResult = await sendMediaGroup(chatId, imageUrls, caption);
        // If media group failed, send caption as plain text so links aren't lost
        const buttonText = mediaResult.message_ids.length > 0
          ? `Approve swipe #${nextConceptNumber}?`
          : `${caption}\n\nApprove swipe #${nextConceptNumber}?`;
        await sendMessageWithInlineKeyboard(chatId, buttonText, buttons);
      } else if (imageResults.length === 1) {
        await sendPhoto(chatId, imageResults[0].url, caption, buttons);
      } else {
        await sendMessageWithInlineKeyboard(chatId, caption, buttons);
      }
    }
  }

  return {
    jobId: job.id,
    conceptName: parsed.concept.concept_name,
    conceptNumber: nextConceptNumber,
    imagesGenerated: imageResults.length,
    landingPageAssigned: !!landingPageId,
  };
}

// Re-export from dedicated module for backward compatibility
export { findBestLandingPage } from "./landing-page-recommender";
