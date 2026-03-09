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
  buildLearningsContext,
  parseConceptProposals,
} from "@/lib/brainstorm";
import { buildPixarAnimationSystemPrompt, buildPixarAnimationUserPrompt } from "@/lib/pixar-brainstorm";
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
  "video_ugc",
  "pixar_animation",
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
  const competitorVariations = Math.min(Math.max(body.count ?? 1, 1), 10);

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

  // Fetch learnings from past ad tests
  const learningsContext = await buildLearningsContext(productSlug);

  // -----------------------------------------------------------------------
  // FROM COMPETITOR AD — separate code path (vision + image generation)
  // -----------------------------------------------------------------------
  if (mode === "from_competitor_ad") {
    const competitorImageUrls: string[] = body.competitor_image_urls
      ?? (body.competitor_image_url ? [body.competitor_image_url] : []);
    const competitorAdCopy: string | undefined = body.competitor_ad_copy;

    if (competitorImageUrls.length === 0) {
      return NextResponse.json(
        { error: "competitor_image_urls is required for from_competitor_ad mode" },
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
      hookInspiration,
      learningsContext,
      competitorImageUrls.length,
      competitorVariations
    );

    const userPrompt = buildBrainstormUserPrompt(
      { ...body, count: competitorVariations, competitor_image_urls: competitorImageUrls },
      segments,
      undefined, // no existing concepts needed
      rejectedConcepts
    );

    // Stream NDJSON progress events so the client can show real-time checklist
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    async function emit(data: object) {
      await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
    }

    // Run the async work in the background, writing to the stream
    (async () => {
      try {
        await emit({ step: "analyzing", message: "Analyzing competitor ad with AI..." });

        const client = new Anthropic({ apiKey });

        // Call Claude Vision — image(s) + text content blocks
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

        const rawContent =
          response.content[0]?.type === "text"
            ? response.content[0].text.trim()
            : "";

        if (!rawContent) {
          await emit({ step: "error", message: "No response from AI" });
          await writer.close();
          return;
        }

        await emit({ step: "analyzed", message: "Competitor ad analyzed" });

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
            source_index: number;
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
          await emit({ step: "error", message: `Failed to parse AI response: ${msg}` });
          await writer.close();
          return;
        }

        if (!parsed.analysis || !parsed.concept || !parsed.image_prompts?.length) {
          await emit({ step: "error", message: "AI response missing required fields" });
          await writer.close();
          return;
        }

        await emit({ step: "creating_concept", message: "Creating concept..." });

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
            competitor_image_urls: competitorImageUrls,
            competitor_image_count: competitorImageUrls.length,
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

        // Build tags (deduplicate — AI may suggest tags we already add)
        const tags = [...new Set([
          "competitor-swipe",
          "brainstorm-generated",
          ...(parsed.concept.suggested_tags ?? []),
        ])];

        // Fetch product hero images for reference (needed for pending_competitor_gen)
        const { data: productImages } = await db
          .from("product_images")
          .select("url, category")
          .eq("product_id", product.id)
          .eq("category", "hero")
          .order("sort_order", { ascending: true });

        const productHeroUrls = (productImages ?? []).map((img: { url: string }) => img.url);

        // Create image_job with "draft" status — image generation happens on the detail page
        const { data: job, error: jobErr } = await db
          .from("image_jobs")
          .insert({
            name: parsed.concept.concept_name,
            product: productSlug,
            status: "draft",
            target_languages: ["sv", "da", "no"],
            target_ratios: ["4:5", "9:16"],
            concept_number: nextNumber,
            tags,
            cash_dna: parsed.concept.cash_dna,
            ad_copy_primary: parsed.concept.ad_copy_primary,
            ad_copy_headline: parsed.concept.ad_copy_headline,
            visual_direction: parsed.concept.visual_direction ?? null,
            pending_competitor_gen: {
              image_prompts: parsed.image_prompts,
              competitor_image_urls: competitorImageUrls,
              product_hero_urls: productHeroUrls,
            },
          })
          .select()
          .single();

        if (jobErr || !job) {
          await emit({ step: "error", message: "Failed to create concept" });
          await writer.close();
          return;
        }

        await emit({
          step: "concept_created",
          message: `Concept created: ${parsed.concept.concept_name}`,
          job_id: job.id,
          concept_name: parsed.concept.concept_name,
          images_count: parsed.image_prompts.length,
        });

        await writer.close();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error("[brainstorm/competitor] Error:", detail);
        await emit({ step: "error", message: `Competitor ad brainstorm failed: ${detail}` });
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  // -----------------------------------------------------------------------
  // VIDEO UGC — separate code path (video concept generation)
  // -----------------------------------------------------------------------
  if (mode === "video_ugc") {
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    async function emit(data: object) {
      await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
    }

    (async () => {
      try {
        const { buildVideoUgcSystemPrompt, buildVideoUgcUserPrompt, loadVideoUgcContext, translateVideoProposals } =
          await import("@/lib/video-brainstorm");

        await emit({ step: "generating", message: "Generating video concepts..." });

        const context = await loadVideoUgcContext(productSlug);

        const systemPrompt = buildVideoUgcSystemPrompt(
          productSlug,
          context.productBrief,
          context.guidelines,
          context.hookInspiration,
          context.learningsContext,
          context.existingCharacters,
          body.pipeline_mode || "single_clip",
          {
            enabled: !!body.product_placement,
            style: body.product_placement_style,
            visual_description: body.product_visual_description,
          }
        );

        const userPrompt = buildVideoUgcUserPrompt(
          body.creative_direction ?? body.request ?? "",
          count,
          context.existingConcepts,
          rejectedConcepts.map((r) => `${r.angle ?? "?"} / ${r.awareness_level ?? "?"}: ${r.concept_description ?? ""}`),
          {
            language: body.language,
            format_type: body.format_type,
            hook_type: body.hook_type,
            character_description: body.character_description,
            pipeline_mode: body.pipeline_mode,
            product_placement: !!body.product_placement,
          }
        );

        const client = new Anthropic({ apiKey, timeout: 5 * 60 * 1000 }); // 5 min timeout

        // Retry on transient connection errors (video UGC prompts are large)
        let response: Anthropic.Message | null = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            response = await client.messages.create({
              model: CLAUDE_MODEL,
              max_tokens: 16000,
              temperature: 0.8,
              system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
              messages: [{ role: "user", content: userPrompt }],
            });
            break; // success
          } catch (retryErr) {
            const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            if (attempt < 2 && msg.toLowerCase().includes("connection")) {
              console.warn(`[brainstorm/video_ugc] Connection error on attempt ${attempt}, retrying...`);
              await emit({ step: "retrying", message: "Connection issue, retrying..." });
              await new Promise((r) => setTimeout(r, 3000));
              continue;
            }
            throw retryErr;
          }
        }

        const rawContent =
          response?.content[0]?.type === "text"
            ? response.content[0].text.trim()
            : "";

        if (!rawContent) {
          await emit({ step: "error", message: "No response from AI" });
          await writer.close();
          return;
        }

        // Parse JSON (strip markdown fences — Haiku quirk)
        let parsed: { proposals: unknown[] };
        try {
          const cleaned = rawContent
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          parsed = JSON.parse(cleaned);
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          console.error("[brainstorm/video_ugc] Parse error:", msg, "\nRaw:", rawContent.slice(0, 500));
          await emit({ step: "error", message: `Failed to parse AI response: ${msg}` });
          await writer.close();
          return;
        }

        if (!parsed.proposals?.length) {
          await emit({ step: "error", message: "AI returned no video proposals" });
          await writer.close();
          return;
        }

        // Log usage
        const inputTokens = response!.usage.input_tokens;
        const outputTokens = response!.usage.output_tokens;
        const cacheCreation = (response!.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;
        const cacheRead = (response!.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
        const costUsd = calcClaudeCost(inputTokens, outputTokens, cacheCreation, cacheRead);

        await db.from("usage_logs").insert({
          type: "video_brainstorm",
          page_id: null,
          translation_id: null,
          model: CLAUDE_MODEL,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: costUsd,
          metadata: {
            purpose: "video_ugc_brainstorm",
            mode,
            product: productSlug,
            proposals_count: parsed.proposals.length,
          },
        });

        // Two-pass translation: English proposals → native language scripts
        const targetLanguage = body.language || "sv";
        let finalProposals = parsed.proposals;
        let translationCostUsd = 0;

        if (targetLanguage !== "en") {
          await emit({ step: "translating", message: `Translating scripts to native ${targetLanguage.toUpperCase()}...` });

          try {
            const translationResult = await translateVideoProposals(
              parsed.proposals as Parameters<typeof translateVideoProposals>[0],
              targetLanguage,
            );
            finalProposals = translationResult.proposals;

            // Log translation usage
            translationCostUsd = (translationResult.inputTokens * 0.0025 + translationResult.outputTokens * 0.01) / 1000;
            await db.from("usage_logs").insert({
              type: "video_script_translation",
              page_id: null,
              translation_id: null,
              model: "gpt-5.2",
              input_tokens: translationResult.inputTokens,
              output_tokens: translationResult.outputTokens,
              cost_usd: translationCostUsd,
              metadata: {
                purpose: "video_script_translation",
                target_language: targetLanguage,
                product: productSlug,
              },
            });
          } catch (translationErr) {
            const msg = translationErr instanceof Error ? translationErr.message : String(translationErr);
            console.error("[brainstorm/video_ugc] Translation failed:", msg);
            // Fall back to English proposals — still usable, just not translated
            await emit({ step: "translation_warning", message: `Translation failed (${msg}), showing English scripts` });
          }
        }

        await emit({
          step: "done",
          proposals: finalProposals,
          type: "video_ugc",
          cost: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_usd: costUsd + translationCostUsd,
          },
        });

        await writer.close();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error("[brainstorm/video_ugc] Error:", detail);
        await emit({ step: "error", message: `Video UGC brainstorm failed: ${detail}` });
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  // -----------------------------------------------------------------------
  // PIXAR ANIMATION — separate code path (talking object video concepts)
  // -----------------------------------------------------------------------
  if (mode === "pixar_animation") {
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    async function emit(data: object) {
      await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
    }

    (async () => {
      try {
        await emit({ step: "generating", message: "Generating Pixar talking object concepts..." });

        // Build guidelines string for the pixar prompt builder
        const guidelinesText = guidelines
          .filter((g) => g.name !== "Product Brief")
          .map((g) => `### ${g.name}\n${g.content}`)
          .join("\n\n");

        const language = body.language || "sv";
        const systemPrompt = buildPixarAnimationSystemPrompt(
          productSlug,
          productBrief ?? "",
          guidelinesText,
          learningsContext,
          language
        );

        const rejectedStrings = rejectedConcepts.map(
          (r) => `${r.angle ?? "?"} / ${r.awareness_level ?? "?"}: ${r.concept_description ?? ""}`
        );

        const userPrompt = buildPixarAnimationUserPrompt(
          count,
          undefined, // existingConcepts — not needed for pixar mode
          rejectedStrings.length > 0 ? rejectedStrings : undefined,
          body.direction
        );

        const client = new Anthropic({ apiKey });

        const response = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 16000,
          temperature: 0.8,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userPrompt }],
        });

        const rawContent =
          response.content[0]?.type === "text"
            ? response.content[0].text.trim()
            : "";

        if (!rawContent) {
          await emit({ step: "error", message: "No response from AI" });
          await writer.close();
          return;
        }

        // Parse JSON (strip markdown fences — Haiku quirk)
        let parsed: { proposals: unknown[] };
        try {
          const cleaned = rawContent
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          parsed = JSON.parse(cleaned);
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          console.error("[brainstorm/pixar_animation] Parse error:", msg, "\nRaw:", rawContent.slice(0, 500));
          await emit({ step: "error", message: `Failed to parse AI response: ${msg}` });
          await writer.close();
          return;
        }

        if (!parsed.proposals?.length) {
          await emit({ step: "error", message: "AI returned no Pixar animation proposals" });
          await writer.close();
          return;
        }

        // Log usage
        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;
        const cacheCreation = (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;
        const cacheRead = (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
        const costUsd = calcClaudeCost(inputTokens, outputTokens, cacheCreation, cacheRead);

        await db.from("usage_logs").insert({
          type: "pixar_brainstorm",
          page_id: null,
          translation_id: null,
          model: CLAUDE_MODEL,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: costUsd,
          metadata: {
            purpose: "pixar_animation_brainstorm",
            mode,
            product: productSlug,
            proposals_count: parsed.proposals.length,
          },
        });

        await emit({
          step: "done",
          proposals: parsed.proposals,
          type: "pixar_animation",
          cost: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_usd: costUsd,
          },
        });

        await writer.close();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error("[brainstorm/pixar_animation] Error:", detail);
        await emit({ step: "error", message: `Pixar animation brainstorm failed: ${detail}` });
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
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

  // Stream NDJSON progress events for all brainstorm modes
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  async function emit(data: object) {
    await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
  }

  (async () => {
    try {
      await emit({ step: "generating", message: "Generating concepts with AI..." });

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
        await emit({ step: "error", message: "No response from AI" });
        await writer.close();
        return;
      }

      await emit({ step: "generated", message: "AI response received" });
      await emit({ step: "parsing", message: "Parsing proposals..." });

      let proposals;
      try {
        proposals = parseConceptProposals(content);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.error("[brainstorm] Parse error:", msg, "\nRaw:", content.slice(0, 500));
        await emit({ step: "error", message: `Failed to parse AI response: ${msg}` });
        await writer.close();
        return;
      }

      if (proposals.length === 0) {
        await emit({ step: "error", message: "AI returned no valid proposals" });
        await writer.close();
        return;
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

      await emit({
        step: "done",
        message: `${proposals.length} concept${proposals.length === 1 ? "" : "s"} generated`,
        proposals,
        existing_concepts_count: existingConcepts?.length ?? 0,
        cost: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: costUsd,
        },
      });

      await writer.close();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[brainstorm] Generation error:", detail);
      await emit({ step: "error", message: `Brainstorm generation failed: ${detail}` });
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
