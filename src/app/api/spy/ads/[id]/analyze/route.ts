import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { OPENAI_MODEL } from "@/lib/constants";
import { calcOpenAICost } from "@/lib/pricing";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import OpenAI from "openai";

export const maxDuration = 60;

// POST /api/spy/ads/[id]/analyze — AI CASH analysis of a spy ad
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }

  const db = createServerSupabase();

  const { data: ad, error } = await db
    .from("spy_ads")
    .select("*, brand:spy_brands(name, category)")
    .eq("id", id)
    .single();

  if (error || !ad) {
    return safeError(error ?? new Error("Not found"), "Ad not found", 404);
  }

  const systemPrompt = `You are a creative strategist analyzing competitor ads using the C.A.S.H. framework (Concepts, Angles, Styles, Hooks).

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
- "ad_source": null (unknown for competitor ads)
- "copy_blocks": array of copy block values used
- "concept_description": 1-2 sentence description of the ad's core concept/strategy
- "offer_type": offer type if any, or null
- "asset_type": image, video, or carousel
- "estimated_production": production style, or null

Be specific and decisive — pick the BEST matching value.`;

  // Build user message
  const parts: string[] = [];
  parts.push(`Competitor brand: ${ad.brand?.name ?? "Unknown"}`);
  if (ad.brand?.category) parts.push(`Category: ${ad.brand.category}`);
  if (ad.headline) parts.push(`Headline: ${ad.headline}`);
  if (ad.body) parts.push(`Ad copy: ${ad.body}`);
  if (ad.description) parts.push(`Description: ${ad.description}`);
  if (ad.cta_type) parts.push(`CTA: ${ad.cta_type}`);
  if (ad.media_type) parts.push(`Media type: ${ad.media_type}`);
  if (ad.link_url) parts.push(`Destination: ${ad.link_url}`);

  // Build messages — include image if available
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  // For image ads, include the image via vision
  if (ad.media_type === "image" && (ad.media_url || ad.thumbnail_url)) {
    const imageUrl = ad.media_url || ad.thumbnail_url;
    messages.push({
      role: "user",
      content: [
        { type: "text", text: parts.join("\n") },
        {
          type: "image_url",
          image_url: { url: imageUrl, detail: "low" },
        },
      ],
    });
  } else {
    messages.push({ role: "user", content: parts.join("\n") });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 1000,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json({ error: "No analysis returned" }, { status: 500 });
    }

    const analysis = JSON.parse(content);

    // Save to DB
    await db
      .from("spy_ads")
      .update({
        cash_analysis: analysis,
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

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
      metadata: { purpose: "spy_ad_analysis", spy_ad_id: id },
    });

    return NextResponse.json({
      cash_analysis: analysis,
      cost: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd },
    });
  } catch (err) {
    return safeError(err, "Analysis failed");
  }
}
