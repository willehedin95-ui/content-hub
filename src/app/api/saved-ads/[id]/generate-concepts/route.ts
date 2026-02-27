import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase";
import { CLAUDE_MODEL } from "@/lib/constants";
import { calcClaudeCost } from "@/lib/pricing";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import {
  buildConceptSystemPrompt,
  buildConceptUserPrompt,
  parseConceptProposals,
} from "@/lib/concept-generator";
import type { ProductFull, CopywritingGuideline, SpyAd } from "@/types";

export const maxDuration = 60;

// POST /api/saved-ads/[id]/generate-concepts — AI concept generation from saved ad
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const productSlug = body.product;
  const count = Math.min(Math.max(body.count ?? 4, 2), 6);

  if (!productSlug) {
    return NextResponse.json(
      { error: "product is required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // Fetch saved ad
  const { data: ad, error: adErr } = await db
    .from("saved_ads")
    .select("*")
    .eq("id", id)
    .single();

  if (adErr || !ad) {
    return safeError(adErr ?? new Error("Not found"), "Saved ad not found", 404);
  }

  if (!ad.cash_analysis) {
    return NextResponse.json(
      { error: "Ad must be analyzed first (run CASH analysis)" },
      { status: 400 }
    );
  }

  // Fetch product + guidelines
  const { data: product, error: productErr } = await db
    .from("products")
    .select("*")
    .eq("slug", productSlug)
    .single();

  if (productErr || !product) {
    return NextResponse.json(
      { error: `Product "${productSlug}" not found` },
      { status: 404 }
    );
  }

  const { data: guidelinesData } = await db
    .from("copywriting_guidelines")
    .select("*")
    .or(`product_id.eq.${product.id},product_id.is.null`)
    .order("sort_order", { ascending: true });

  const guidelines = (guidelinesData ?? []) as CopywritingGuideline[];
  const productBrief = guidelines.find(
    (g) => g.name === "Product Brief"
  )?.content;

  // Shape saved ad like a SpyAd for buildConceptUserPrompt
  const adForPrompt = {
    headline: ad.headline,
    body: ad.body,
    description: null,
    cash_analysis: ad.cash_analysis,
    brand: { name: ad.brand_name, category: null },
    media_type: ad.media_type,
    link_url: ad.destination_url,
    cta_type: null,
  } as unknown as SpyAd;

  // Build prompts
  const systemPrompt = buildConceptSystemPrompt(
    product as ProductFull,
    productBrief,
    guidelines
  );
  const userPrompt = buildConceptUserPrompt(adForPrompt, count);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      temperature: 0.8,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : "";

    if (!content) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    const proposals = parseConceptProposals(content);

    if (proposals.length === 0) {
      return NextResponse.json(
        { error: "AI returned no valid proposals" },
        { status: 500 }
      );
    }

    // Log usage
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = calcClaudeCost(inputTokens, outputTokens);

    await db.from("usage_logs").insert({
      type: "claude_rewrite",
      page_id: null,
      translation_id: null,
      model: CLAUDE_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      metadata: {
        purpose: "concept_generation",
        saved_ad_id: id,
        product: productSlug,
        proposals_count: proposals.length,
      },
    });

    return NextResponse.json({
      proposals,
      cost: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
      },
    });
  } catch (err) {
    return safeError(err, "Concept generation failed");
  }
}
