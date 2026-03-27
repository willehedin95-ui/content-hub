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
import { findBestLandingPage } from "@/lib/landing-page-recommender";
import { sendPhoto, sendMessageWithInlineKeyboard, sendMediaGroup } from "@/lib/telegram";
import {
  buildBrainstormSystemPrompt,
  buildBrainstormUserPrompt,
  buildHookInspiration,
  buildLearningsContext,
} from "@/lib/brainstorm";
import { generateImage } from "@/lib/kie";
import { CLAUDE_MODEL, STORAGE_BUCKET, KIE_MODEL } from "@/lib/constants";
import { KIE_IMAGE_COST } from "@/lib/pricing";
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

  // --- Build prompts ---
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
    researchContext
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
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    temperature: 0.7,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [
        ...competitorImageUrls.map((url) => ({
          type: "image" as const,
          source: { type: "url" as const, url },
        })),
        { type: "text" as const, text: userPrompt },
      ],
    }],
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

  const { data: productImages } = await db
    .from("product_images")
    .select("url, category")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  const productHeroUrls = (productImages ?? [])
    .filter((i) => i.category === "product" || i.category === "hero")
    .slice(0, 3)
    .map((i) => i.url);

  // Build a textual product appearance description for Kie AI prompts
  // This ensures generated product images match the real product's distinctive features
  let productAppearance = "";
  if (product.slug === "happysleep") {
    productAppearance = `The product is: ${product.name}. Physical appearance: ${product.ingredients}. IMPORTANT: The pillow must have a white quilted diamond-pattern fabric cover with a distinctive black mesh breathable ventilation strip along the bottom/side edge. It is a contoured cervical pillow with dual height (higher on one side). Do NOT show bare foam — always show the finished pillow with its fabric cover on.`;
  } else if (product.description || product.ingredients) {
    productAppearance = `The product is: ${product.name}. ${product.description || ""} Key specs: ${product.ingredients || ""}. Show the actual product accurately — refer to the product reference image for the exact appearance.`;
  }

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
      swipe_progress: { step: "generating", message: `Generating image 1 of ${parsed.image_prompts.length}...` },
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
        target_languages: ["sv", "da", "no"],
        target_ratios: ["4:5", "9:16"],
        cash_dna: cashDna,
        ad_copy_primary: parsed.concept.ad_copy_primary,
        ad_copy_headline: parsed.concept.ad_copy_headline,
        visual_direction: parsed.concept.visual_direction,
        tags,
        pending_competitor_gen: {
          image_prompts: parsed.image_prompts,
          competitor_image_urls: competitorImageUrls,
          product_hero_urls: productHeroUrls,
        },
      })
      .select()
      .single();

    if (jobErr || !newJob) throw new Error(`Failed to create image_job: ${jobErr?.message}`);
    job = newJob;
  }

  // --- Auto-assign landing page ---
  const landingPageId = await findBestLandingPage(db, workspaceId, productSlug, input.painPoint);
  if (landingPageId) {
    await db.from("image_jobs").update({ landing_page_id: landingPageId }).eq("id", job.id);
  }

  // --- Generate images ---
  const imageResults: Array<{ url: string; sourceImageId: string }> = [];

  // Clear pending and store reference data
  await db.from("image_jobs").update({
    pending_competitor_gen: null,
    competitor_reference_data: {
      competitor_image_urls: competitorImageUrls,
      product_hero_urls: productHeroUrls,
    },
  }).eq("id", job.id);

  for (let index = 0; index < parsed.image_prompts.length; index++) {
    const imgPrompt = parsed.image_prompts[index];
    if (existingJobId) {
      await updateProgress(existingJobId, "generating", `Generating image ${index + 1} of ${parsed.image_prompts.length}...`);
    }
    try {
      // Pass competitor image as style reference so generated images match the original's visual style.
      // Product hero images are added when include_product_reference is true.
      const includeProduct = imgPrompt.include_product_reference === true;
      const referenceUrls = [
        competitorImageUrls[0],  // Style reference (first competitor image)
        ...(includeProduct ? productHeroUrls : []),
      ];

      // Build the full prompt: scene description + product appearance + optional text overlay instructions.
      // Only add text overlays if Claude detected text in the competitor ad (non-empty hook_text/headline_text).
      let fullPrompt = imgPrompt.prompt;

      // Append product appearance description when product is included
      if (includeProduct && productAppearance) {
        fullPrompt += " " + productAppearance;
      }
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

      const { urls: resultUrls, costTimeMs } = await generateImage(
        fullPrompt,
        referenceUrls,
        "4:5"
      );

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

      const { data: sourceImage } = await db
        .from("source_images")
        .insert({
          job_id: job.id,
          original_url: urlData.publicUrl,
          filename: `competitor-swipe-${fileId.slice(0, 8)}.png`,
          processing_order: index,
          skip_translation: !hasTextOverlay,
          generation_prompt: imgPrompt.prompt,
          generation_style: "competitor-swipe",
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
          purpose: "competitor_swipe",
          image_job_id: job.id,
          source_image_id: sourceImage?.id,
          kie_cost_time_ms: costTimeMs,
          reference_image_count: referenceUrls.length,
        },
      });

      imageResults.push({ url: urlData.publicUrl, sourceImageId: sourceImage?.id ?? "" });
    } catch (err) {
      console.error(`[swipe-competitor] Image ${index + 1} failed:`, err);
    }
  }

  // Update job status
  await db.from("image_jobs").update({
    status: "ready",
    swipe_progress: null,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);

  // --- Telegram notification (optional) ---
  if (notifyTelegram) {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      const hubUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";
      const primaryText = parsed.concept.ad_copy_primary?.[0] ?? "";
      const headline = parsed.concept.ad_copy_headline?.[0] ?? "";

      const captionLines = [
        `🔍 Swipe #${nextConceptNumber}: "${parsed.concept.concept_name}"`,
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

      const caption = captionLines.join("\n");

      const buttons = [[
        { text: "\u2705 Approve", callback_data: `concept_approve:${job.id}` },
        { text: "\u274c Reject", callback_data: `concept_reject:${job.id}` },
      ]];

      if (imageResults.length > 1) {
        const imageUrls = imageResults.map((r) => r.url);
        await sendMediaGroup(chatId, imageUrls, caption);
        await sendMessageWithInlineKeyboard(
          chatId,
          `Approve swipe #${nextConceptNumber}?`,
          buttons
        );
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
