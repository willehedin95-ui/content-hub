import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase";
import { CLAUDE_MODEL } from "@/lib/constants";
import { calcClaudeCost } from "@/lib/pricing";
import { safeError } from "@/lib/api-error";
import {
  buildBrainstormSystemPrompt,
  buildBrainstormUserPrompt,
  parseConceptProposals,
} from "@/lib/brainstorm";
import type { ProductFull, CopywritingGuideline, ProductSegment, BrainstormMode } from "@/types";

export const maxDuration = 60;

const VALID_MODES: BrainstormMode[] = [
  "from_scratch",
  "from_organic",
  "from_research",
  "from_internal",
  "unaware",
];

// POST /api/brainstorm — generate concept proposals from brainstorm modes
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { mode, product: productSlug } = body;
  const count = Math.min(Math.max(body.count ?? 3, 1), 5);

  if (!productSlug) {
    return NextResponse.json({ error: "product is required" }, { status: 400 });
  }

  if (!mode || !VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}` },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // Fetch product
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

  // Fetch guidelines
  const { data: guidelinesData } = await db
    .from("copywriting_guidelines")
    .select("*")
    .or(`product_id.eq.${product.id},product_id.is.null`)
    .order("sort_order", { ascending: true });

  const guidelines = (guidelinesData ?? []) as CopywritingGuideline[];
  const productBrief = guidelines.find(
    (g) => g.name === "Product Brief"
  )?.content;

  // Fetch segments
  const { data: segmentsData } = await db
    .from("product_segments")
    .select("*")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  const segments = (segmentsData ?? []) as ProductSegment[];

  // For from_internal mode, fetch existing concepts
  let existingConcepts: Array<{ name: string; angle: string; awareness: string }> | undefined;
  if (mode === "from_internal") {
    const { data: jobs } = await db
      .from("image_jobs")
      .select("name, cash_dna")
      .eq("product", productSlug)
      .not("cash_dna", "is", null);

    if (jobs && jobs.length > 0) {
      existingConcepts = jobs
        .filter((j) => j.cash_dna?.angle)
        .map((j) => ({
          name: j.name,
          angle: j.cash_dna.angle ?? "Unknown",
          awareness: j.cash_dna.awareness_level ?? "Unknown",
        }));
    }
  }

  // Fetch rejected concepts for diversity
  const { data: rejectedData } = await db
    .from("rejected_concepts")
    .select("angle, awareness_level, concept_description")
    .eq("product", productSlug);

  const rejectedConcepts = (rejectedData ?? []) as Array<{
    angle: string | null;
    awareness_level: string | null;
    concept_description: string | null;
  }>;

  // Build prompts
  const systemPrompt = buildBrainstormSystemPrompt(
    product as ProductFull,
    productBrief,
    guidelines,
    segments,
    mode
  );

  const userPrompt = buildBrainstormUserPrompt(
    { ...body, count },
    segments,
    existingConcepts,
    rejectedConcepts
  );

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

    let proposals;
    try {
      proposals = parseConceptProposals(content);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error("[brainstorm] Parse error:", msg, "\nRaw:", content.slice(0, 500));
      return NextResponse.json(
        { error: `Failed to parse AI response: ${msg}` },
        { status: 500 }
      );
    }

    if (proposals.length === 0) {
      return NextResponse.json(
        { error: "AI returned no valid proposals. Raw response: " + content.slice(0, 200) },
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
        purpose: "brainstorm",
        mode,
        product: productSlug,
        proposals_count: proposals.length,
      },
    });

    return NextResponse.json({
      proposals,
      existing_concepts_count: existingConcepts?.length ?? 0,
      cost: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[brainstorm] Generation error:", detail);
    return NextResponse.json(
      { error: `Brainstorm generation failed: ${detail}` },
      { status: 500 }
    );
  }
}
