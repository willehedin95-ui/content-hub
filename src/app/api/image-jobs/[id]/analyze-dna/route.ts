import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { OPENAI_MODEL } from "@/lib/constants";
import { calcOpenAICost } from "@/lib/pricing";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import OpenAI from "openai";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }

  const db = createServerSupabase();

  const { data: job, error } = await db
    .from("image_jobs")
    .select("id, name, product, ad_copy_primary, ad_copy_headline, tags")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return safeError(error ?? new Error("Not found"), "Concept not found", 404);
  }

  // Fetch product context if available
  let productContext = "";
  if (job.product) {
    const { data: product } = await db
      .from("products")
      .select("name, tagline, benefits, usps, claims, target_audience")
      .eq("slug", job.product)
      .single();
    if (product) {
      productContext = `\n\nProduct: ${product.name}
Tagline: ${product.tagline ?? ""}
Benefits: ${(product.benefits ?? []).join(", ")}
USPs: ${(product.usps ?? []).join(", ")}
Target audience: ${product.target_audience ?? ""}`;
    }
  }

  const primaryTexts = (job.ad_copy_primary ?? []).filter((t: string) => t.trim());
  const headlines = (job.ad_copy_headline ?? []).filter((t: string) => t.trim());

  const systemPrompt = `You are a creative strategist analyzing ad concepts using the C.A.S.H. framework (Concepts, Angles, Styles, Hooks).

Given an ad concept's name, copy, and product context, determine the creative DNA.

CONCEPT TYPES (the "C" in CASH — what bucket the core insight falls in):
- avatar_facts: Raw truths about the audience (pain expressions, core wounds, buying triggers)
- market_facts: Competitive landscape intelligence (solutions tried, cultural influences)
- product_facts: Truth about the solution (discovery story, mechanism, proof)
- psychology_toolkit: Techniques to reshape understanding (metaphors, paradoxes)

ANGLES (the "A" in CASH — the psychological entry point, HOW you say it):
Story, Contrarian, Expert Crossover, Root Cause, Accidental Discovery, Tribal, Conspiracy, Geographic, New Science, Symptom Reframe, Worldview, Case Study, Before/After, Comparison, Social Proof, Educational, Fear-Based, Aspirational, Curiosity, Problem-Agitate

STYLES (the "S" in CASH — creative execution format for static image ads):
Product Shot, Lifestyle, UGC-style, Infographic, Before/After, Testimonial, Meme, Screenshot, Text Overlay, Collage, Comparison

AWARENESS LEVELS (where in the buyer journey this ad targets):
Unaware, Problem Aware, Solution Aware, Product Aware, Most Aware

AD SOURCES (S.T.O.R.M.I.N.G. — where the idea came from):
Swipe (competitor), Swipe (adjacent), Template, Organic, Research, Matrix/Coverage, Internal Vector, Wildcard

COPY BLOCKS (which persuasion blocks are used in the ad copy):
Pain, Promise, Proof, Curiosity, Constraints, Conditions

Return a JSON object with exactly these keys:
- "concept_type": one of the concept type values (avatar_facts/market_facts/product_facts/psychology_toolkit), or null if unclear
- "angle": one of the angle values listed above, or null
- "style": one of the style values listed above, or null
- "hooks": array of 1-3 hook suggestions (the first 1-2 sentences that would stop the scroll)
- "awareness_level": one of the awareness level values, or null
- "ad_source": one of the ad source values if inferable, or null
- "copy_blocks": array of copy block values used in the ad copy (can be empty)
- "concept_description": 1-2 sentence description of the core concept/insight being leveraged

Be specific and decisive — pick the BEST matching value rather than returning null. If the concept name or copy gives enough signal, make a determination.`;

  const userMessage = `Concept name: ${job.name}
Tags: ${(job.tags ?? []).join(", ") || "none"}
${primaryTexts.length > 0 ? `\nAd copy (primary texts):\n${primaryTexts.join("\n---\n")}` : "No ad copy yet."}
${headlines.length > 0 ? `\nHeadlines: ${headlines.join(" | ")}` : ""}${productContext}`;

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 1000,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json({ error: "No analysis returned" }, { status: 500 });
    }

    const dna = JSON.parse(content);

    // Save to DB
    await db.from("image_jobs").update({ cash_dna: dna }).eq("id", jobId);

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
      metadata: { purpose: "cash_dna_analysis", concept_id: jobId },
    });

    return NextResponse.json({
      cash_dna: dna,
      cost: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
