import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase";
import { CLAUDE_MODEL, STORAGE_BUCKET, KIE_MODEL } from "@/lib/constants";
import { calcClaudeCost, KIE_IMAGE_COST } from "@/lib/pricing";
import { generateImage } from "@/lib/kie";
import { safeError } from "@/lib/api-error";
import {
  buildBrainstormSystemPrompt,
  buildBrainstormUserPrompt,
  buildHookInspiration,
  parseConceptProposals,
} from "@/lib/brainstorm";
import type { ProductFull, CopywritingGuideline, ProductSegment, BrainstormMode } from "@/types";

export const maxDuration = 300;

const VALID_MODES: BrainstormMode[] = [
  "from_scratch",
  "from_organic",
  "from_research",
  "from_internal",
  "unaware",
  "from_template",
  "from_competitor_ad",
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

  // Fetch approved hooks for inspiration
  const hookInspiration = await buildHookInspiration(productSlug);

  // -----------------------------------------------------------------------
  // FROM COMPETITOR AD — separate code path (vision + image generation)
  // -----------------------------------------------------------------------
  if (mode === "from_competitor_ad") {
    const competitorImageUrl: string | undefined = body.competitor_image_url;
    const competitorAdCopy: string | undefined = body.competitor_ad_copy;

    if (!competitorImageUrl) {
      return NextResponse.json(
        { error: "competitor_image_url is required for from_competitor_ad mode" },
        { status: 400 }
      );
    }

    // Build prompts (reuse existing builders — they handle this mode)
    const systemPrompt = buildBrainstormSystemPrompt(
      product as ProductFull,
      productBrief,
      guidelines,
      segments,
      mode,
      hookInspiration
    );

    const userPrompt = buildBrainstormUserPrompt(
      { ...body, count },
      segments,
      undefined, // no existing concepts needed
      rejectedConcepts
    );

    try {
      const client = new Anthropic({ apiKey });

      // Call Claude Vision — image + text content blocks
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        temperature: 0.7,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: competitorImageUrl } },
            { type: "text", text: userPrompt },
          ],
        }],
      });

      const rawContent =
        response.content[0]?.type === "text"
          ? response.content[0].text.trim()
          : "";

      if (!rawContent) {
        return NextResponse.json(
          { error: "No response from AI" },
          { status: 500 }
        );
      }

      // Parse { analysis, concept, image_prompts }
      let parsed: {
        analysis: Record<string, unknown>;
        concept: {
          concept_name: string;
          concept_description: string;
          cash_dna: Record<string, unknown>;
          ad_copy_primary: string[];
          ad_copy_headline: string[];
          visual_direction: string;
          differentiation_note: string;
          suggested_tags: string[];
        };
        image_prompts: Array<{
          prompt: string;
          hook_text: string;
          headline_text: string;
        }>;
      };

      try {
        const cleaned = rawContent
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.error("[brainstorm/competitor] Parse error:", msg, "\nRaw:", rawContent.slice(0, 500));
        return NextResponse.json(
          { error: `Failed to parse AI response: ${msg}` },
          { status: 500 }
        );
      }

      if (!parsed.analysis || !parsed.concept || !parsed.image_prompts?.length) {
        return NextResponse.json(
          { error: "AI response missing required fields (analysis, concept, image_prompts)" },
          { status: 500 }
        );
      }

      // Log Claude usage (vision call)
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cacheCreation = (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;
      const cacheRead = (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
      const claudeCost = calcClaudeCost(inputTokens, outputTokens, cacheCreation, cacheRead);

      await db.from("usage_logs").insert({
        type: "claude_rewrite",
        page_id: null,
        translation_id: null,
        model: CLAUDE_MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: claudeCost,
        metadata: {
          purpose: "brainstorm_competitor_ad",
          mode,
          product: productSlug,
          competitor_image_url: competitorImageUrl,
          image_prompts_count: parsed.image_prompts.length,
        },
      });

      // Get next concept number
      const { data: lastJob } = await db
        .from("image_jobs")
        .select("concept_number")
        .not("concept_number", "is", null)
        .order("concept_number", { ascending: false })
        .limit(1)
        .single();

      const nextNumber = (lastJob?.concept_number ?? 0) + 1;

      // Build tags
      const tags = [
        "competitor-swipe",
        "brainstorm-generated",
        ...(parsed.concept.suggested_tags ?? []),
      ];

      // Create image_job
      const { data: job, error: jobErr } = await db
        .from("image_jobs")
        .insert({
          name: parsed.concept.concept_name,
          product: productSlug,
          status: "ready",
          target_languages: ["sv", "da", "no"],
          target_ratios: ["4:5", "9:16"],
          concept_number: nextNumber,
          tags,
          cash_dna: parsed.concept.cash_dna,
          ad_copy_primary: parsed.concept.ad_copy_primary,
          ad_copy_headline: parsed.concept.ad_copy_headline,
          visual_direction: parsed.concept.visual_direction ?? null,
        })
        .select()
        .single();

      if (jobErr || !job) {
        return safeError(
          jobErr ?? new Error("Failed to create image job"),
          "Failed to create concept"
        );
      }

      const jobId: string = job.id;

      // Fetch product hero images for reference
      const { data: productImages } = await db
        .from("product_images")
        .select("url, category")
        .eq("product_id", product.id)
        .eq("category", "hero")
        .order("sort_order", { ascending: true });

      const productHeroUrls = (productImages ?? []).map((img: { url: string }) => img.url);

      // Generate images in parallel (same pattern as generate-static)
      type CompetitorImageResult = {
        source_image_id: string;
        original_url: string;
        filename: string;
        prompt: string;
      };

      const settled = await Promise.allSettled(
        parsed.image_prompts.map(async (imgPrompt, index): Promise<CompetitorImageResult> => {
          // Combine competitor image + product hero images as references
          const referenceUrls = [competitorImageUrl, ...productHeroUrls];

          // Generate via Kie AI (4:5 for Meta feed)
          const { urls: resultUrls, costTimeMs } = await generateImage(
            imgPrompt.prompt,
            referenceUrls,
            "4:5"
          );

          if (!resultUrls?.length) {
            throw new Error(`Image ${index + 1}: No image generated`);
          }

          // Download from Kie CDN
          const resultRes = await fetch(resultUrls[0]);
          if (!resultRes.ok) {
            throw new Error(`Image ${index + 1}: Failed to download generated image`);
          }
          const buffer = Buffer.from(await resultRes.arrayBuffer());

          // Upload to Supabase Storage
          const fileId = crypto.randomUUID();
          const filePath = `image-jobs/${jobId}/${fileId}.png`;
          const { error: uploadError } = await db.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, buffer, { contentType: "image/png", upsert: false });

          if (uploadError) {
            throw new Error(`Image ${index + 1}: Upload failed — ${uploadError.message}`);
          }

          const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

          // Insert source_images row
          const { data: sourceImage, error: siErr } = await db
            .from("source_images")
            .insert({
              job_id: jobId,
              original_url: urlData.publicUrl,
              filename: `competitor-swipe-${fileId.slice(0, 8)}.png`,
              processing_order: index,
              skip_translation: false,
              generation_prompt: imgPrompt.prompt,
              generation_style: "competitor-swipe",
              batch: 1,
            })
            .select()
            .single();

          if (siErr || !sourceImage) {
            throw new Error(`Image ${index + 1}: DB insert failed`);
          }

          // Log Kie usage
          await db.from("usage_logs").insert({
            type: "image_generation",
            page_id: null,
            translation_id: null,
            model: KIE_MODEL,
            input_tokens: 0,
            output_tokens: 0,
            cost_usd: KIE_IMAGE_COST,
            metadata: {
              purpose: "competitor_swipe_generation",
              image_job_id: jobId,
              source_image_id: sourceImage.id,
              kie_cost_time_ms: costTimeMs,
              reference_image_count: referenceUrls.length,
            },
          });

          return {
            source_image_id: sourceImage.id,
            original_url: urlData.publicUrl,
            filename: sourceImage.filename,
            prompt: imgPrompt.prompt,
          };
        })
      );

      const imageResults: CompetitorImageResult[] = [];
      const imageErrors: string[] = [];
      let totalCost = claudeCost;

      for (const outcome of settled) {
        if (outcome.status === "fulfilled") {
          imageResults.push(outcome.value);
          totalCost += KIE_IMAGE_COST;
        } else {
          imageErrors.push(
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason)
          );
        }
      }

      // Update job timestamp
      await db
        .from("image_jobs")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", jobId);

      return NextResponse.json({
        job_id: jobId,
        concept_number: nextNumber,
        concept: parsed.concept,
        analysis: parsed.analysis,
        images_generated: imageResults.length,
        images_failed: imageErrors.length,
        image_errors: imageErrors.length > 0 ? imageErrors : undefined,
        cost_usd: totalCost,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[brainstorm/competitor] Error:", detail);
      return NextResponse.json(
        { error: `Competitor ad brainstorm failed: ${detail}` },
        { status: 500 }
      );
    }
  }

  // Build prompts
  const systemPrompt = buildBrainstormSystemPrompt(
    product as ProductFull,
    productBrief,
    guidelines,
    segments,
    mode,
    hookInspiration
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
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
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
    const cacheCreation = (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;
    const cacheRead = (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
    const costUsd = calcClaudeCost(inputTokens, outputTokens, cacheCreation, cacheRead);

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
