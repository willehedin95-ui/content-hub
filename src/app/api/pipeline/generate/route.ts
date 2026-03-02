import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildBrainstormSystemPrompt,
  parseConceptProposals,
} from "@/lib/brainstorm";
import type {
  AutoPipelineGenerateRequest,
  AutoPipelineGenerateResponse,
  ProductFull,
  CopywritingGuideline,
  ProductSegment,
  AutoPipelineGenerationMode,
  BrainstormMode,
} from "@/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const maxDuration = 180;

// Map AutoPipelineGenerationMode to BrainstormMode
function mapModeToBrainstormMode(mode: AutoPipelineGenerationMode): BrainstormMode {
  if (mode === "matrix") {
    return "from_internal";
  }
  return mode as BrainstormMode;
}

// POST /api/pipeline/generate
export async function POST(request: Request) {
  try {
    const body: AutoPipelineGenerateRequest = await request.json();
    const { count, mode, product, target_markets, target_languages } = body;

    if (!count || !mode || !product || !target_languages?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // Fetch product data
    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("*, copywriting_guidelines(*), segments:product_segments(*)")
      .eq("slug", product)
      .single();

    if (productError || !productData) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // For Matrix mode: fetch coverage gaps
    let coverageGaps: string[] = [];
    if (mode === "matrix") {
      try {
        const coverageRes = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL}/api/pipeline/coverage?product=${product}`
        );
        if (coverageRes.ok) {
          const coverageData = await coverageRes.json();
          coverageGaps = (coverageData.gaps || [])
            .slice(0, 3)
            .map((g: { message: string }) => g.message);
        }
      } catch (error) {
        console.error("[generate] Coverage fetch error:", error);
        // Continue without coverage gaps
      }
    }

    // Extract product brief from guidelines
    const guidelines = (productData.copywriting_guidelines || []) as CopywritingGuideline[];
    const productBrief = guidelines.find((g) => g.name === "Product Brief")?.content;

    // Build prompts
    const brainstormMode = mapModeToBrainstormMode(mode);
    const systemPrompt = buildBrainstormSystemPrompt(
      productData as ProductFull,
      productBrief,
      guidelines,
      (productData.segments || []) as ProductSegment[],
      brainstormMode
    );

    // Enhanced user prompt with coverage gaps + hypothesis requirement
    const userPrompt = `
Generate ${count} ad concepts for ${productData.name} targeting ${target_markets.join(" and ")} markets.

${mode === "matrix" && coverageGaps.length > 0 ? `
PRIORITY GAPS (fill these first):
${coverageGaps.map((g) => `- ${g}`).join("\n")}
` : ""}

For each concept, provide:
1. Name (short title)
2. Headline (hook)
3. Primary copy (3 variations)
4. Ad copy headlines (3 variations)
5. CASH DNA (concept type, angle, awareness level, segment)
6. HYPOTHESIS (2-3 sentences explaining):
   - Why this concept might work
   - What awareness stage/psychology it targets
   - What you're testing with this concept

Example hypothesis:
"Testing Problem Aware stage with 'sleep quality decline after 40' angle. Targets the core wound (feeling older, less capable) through cinematic pain depiction. If successful, proves age-related sleep pain resonates stronger than generic insomnia messaging."

Make each concept DIFFERENT from the others. Vary angles, awareness levels, and hooks.
`;

    // Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = response.content[0]?.type === "text" ? response.content[0].text : "";

    // Parse concepts
    const proposals = parseConceptProposals(content);

    if (proposals.length === 0) {
      return NextResponse.json({ error: "No concepts generated" }, { status: 500 });
    }

    // Save to database
    const batchId = crypto.randomUUID();
    const concepts = [];

    for (const proposal of proposals) {
      const { data: concept, error } = await supabase
        .from("pipeline_concepts")
        .insert({
          name: proposal.concept_name,
          product,
          headline: proposal.cash_dna?.hooks?.[0] || proposal.ad_copy_headline[0] || "Concept",
          primary_copy: proposal.ad_copy_primary,
          ad_copy_headline: proposal.ad_copy_headline,
          hypothesis: proposal.hypothesis || "No hypothesis provided.",
          cash_dna: proposal.cash_dna || null,
          generation_mode: mode,
          generation_batch_id: batchId,
          status: "pending_review",
          target_languages,
          target_markets,
        })
        .select()
        .single();

      if (error) {
        console.error("[generate] Insert error:", error);
        continue;
      }

      concepts.push(concept);
    }

    // TODO: Send notifications (Task 13)

    const result: AutoPipelineGenerateResponse = {
      success: true,
      batch_id: batchId,
      concepts_generated: concepts.length,
      concepts,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[generate] Error:", error);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
