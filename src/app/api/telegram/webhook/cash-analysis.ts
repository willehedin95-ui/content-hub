// CASH analysis for saved ads — mirrors spy ad analysis pattern

import { OPENAI_MODEL } from "@/lib/constants";
import { calcOpenAICost } from "@/lib/pricing";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `You are a creative strategist analyzing competitor ads using the C.A.S.H. framework (Concepts, Angles, Styles, Hooks).

Given a competitor ad's creative content (copy, headline, image), determine its creative DNA.

CONCEPT TYPES (the "C" in CASH — what bucket the core insight falls in):
- avatar_facts: Raw truths about the audience (pain expressions, core wounds, buying triggers)
- market_facts: Competitive landscape intelligence (solutions tried, cultural influences)
- product_facts: Truth about the solution (discovery story, mechanism, proof)
- psychology_toolkit: Techniques to reshape understanding (metaphors, paradoxes)

ANGLES (the "A" in CASH — the psychological entry point):
Story, Contrarian, Expert Crossover, Root Cause, Accidental Discovery, Tribal, Conspiracy, Geographic, New Science, Symptom Reframe, Worldview, Case Study, Before/After, Comparison, Social Proof, Educational, Fear-Based, Aspirational, Curiosity, Problem-Agitate

STYLES (the "S" in CASH — creative execution format):
Product Shot, Lifestyle, UGC-style, Infographic, Before/After, Testimonial, Meme, Screenshot, Text Overlay, Collage, Comparison

AWARENESS LEVELS:
Unaware, Problem Aware, Solution Aware, Product Aware, Most Aware

AD SOURCES (S.T.O.R.M.I.N.G.):
Swipe (competitor), Swipe (adjacent), Template, Organic, Research, Matrix/Coverage, Internal Vector, Wildcard

COPY BLOCKS:
Pain, Promise, Proof, Curiosity, Constraints, Conditions

ADDITIONAL FIELDS:
- "offer_type": what incentive is used (percentage_off, free_shipping, bundle, free_trial, money_back_guarantee, limited_time, or null)
- "asset_type": image, video, or carousel
- "estimated_production": UGC, studio, design-tool, AI-generated, or null

Return a JSON object with exactly these keys:
- "concept_type": one of the concept type values, or null
- "angle": one of the angle values, or null
- "style": one of the style values, or null
- "hooks": array of 1-3 hook lines identified in the ad
- "awareness_level": one of the awareness level values, or null
- "ad_source": null (unknown for captured ads)
- "copy_blocks": array of copy block values used
- "concept_description": 1-2 sentence description of the ad's core concept/strategy
- "offer_type": offer type if any, or null
- "asset_type": image, video, or carousel
- "estimated_production": production style, or null

Be specific and decisive — pick the BEST matching value.`;

/** Run CASH analysis on a saved ad and update the DB. Returns analysis or null. */
export async function runCashAnalysis(
  db: SupabaseClient,
  savedAdId: string,
  mediaUrl: string,
  adCopy: {
    headline: string | null;
    body: string | null;
    brand: string | null;
  } | null,
  userNotes: string | null
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[CASH] OPENAI_API_KEY not set");
    return null;
  }

  try {
    // Build user message parts
    const parts: string[] = [];
    if (adCopy?.brand) parts.push(`Brand: ${adCopy.brand}`);
    if (adCopy?.headline) parts.push(`Headline: ${adCopy.headline}`);
    if (adCopy?.body) parts.push(`Ad copy: ${adCopy.body}`);
    if (userNotes) parts.push(`User notes: ${userNotes}`);
    if (parts.length === 0) parts.push("Analyze this ad image.");

    // Download image and convert to base64
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    let imageDataUrl: string | null = null;
    try {
      const imgRes = await fetch(mediaUrl);
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        imageDataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
      }
    } catch {
      // Fall back to text-only analysis if image download fails
    }

    if (imageDataUrl) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: parts.join("\n") },
          {
            type: "image_url",
            image_url: { url: imageDataUrl, detail: "low" },
          },
        ],
      });
    } else {
      messages.push({ role: "user", content: parts.join("\n") });
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 1000,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const analysis = JSON.parse(content);

    // Save to DB
    await db
      .from("saved_ads")
      .update({
        cash_analysis: analysis,
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", savedAdId);

    // Log usage
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const costUsd = calcOpenAICost(inputTokens, outputTokens);

    await db.from("usage_logs").insert({
      type: "translation",
      page_id: null,
      translation_id: null,
      model: OPENAI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      metadata: { purpose: "saved_ad_analysis", saved_ad_id: savedAdId },
    });

    return analysis;
  } catch (err) {
    console.error("[CASH] Analysis failed:", err);
    return null;
  }
}
