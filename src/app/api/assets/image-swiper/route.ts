import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { CLAUDE_MODEL, IMAGE_MODEL_IDS } from "@/lib/constants";
import { calcClaudeCost, kieImageCost } from "@/lib/pricing";
import { createImageTask, pollTaskResult } from "@/lib/kie";
import { persistSwipeImage } from "@/lib/swipe-image-store";
import type { SwipeForm } from "@/lib/product-appearance";
import { describePersonOverride, type PersonOverride } from "@/lib/person-options";
import { resolveSwipeReferences } from "@/lib/swipe-references";
import { buildImageSwiperSystemPrompt, buildImageSwiperUserPrompt, buildSwipePrompt } from "@/lib/swipe-image-prompt";
import type { ProductFull } from "@/types";

export const maxDuration = 800;

// Default model. Benchmark 2026-09-30 (10 models, 1K): GPT Image 2 matched
// nano-banana-pro on label accuracy and bottle size at a third of the price.
const SWIPER_IMAGE_MODEL = "gpt-image-2-image-to-image";

const VALID_RATIOS = ["1:1", "4:5", "5:4", "3:2", "2:3", "16:9", "9:16"] as const;

/** Measure source image and return the closest Kie.ai-supported aspect ratio */
async function detectAspectRatio(imageUrl: string): Promise<string> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return "4:5";
    const buffer = Buffer.from(await res.arrayBuffer());
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) return "4:5";

    const actual = width / height;
    let best = "4:5";
    let bestDiff = Infinity;
    for (const ratio of VALID_RATIOS) {
      const [w, h] = ratio.split(":").map(Number);
      const diff = Math.abs(actual - w / h);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = ratio;
      }
    }
    return best;
  } catch {
    return "4:5";
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    image_url,
    product: productSlug,
    notes,
    mode = "standard",
    model: requestedModel,
    forms: requestedForms,
    person,
    reference_ids: referenceIds,
  } = body as {
    image_url?: string;
    product?: string;
    notes?: string;
    mode?: "standard" | "ugc" | "replica";
    model?: string;
    forms?: string[];
    person?: PersonOverride;
    reference_ids?: string[];
  };
  const personDescription = describePersonOverride(person);
  const forms = (Array.isArray(requestedForms) ? requestedForms : []).filter(
    (f): f is SwipeForm => f === "bottle" || f === "shot" || f === "glass"
  );
  const imageModel = requestedModel && IMAGE_MODEL_IDS.includes(requestedModel) ? requestedModel : SWIPER_IMAGE_MODEL;

  if (!image_url) {
    return NextResponse.json({ error: "image_url is required" }, { status: 400 });
  }
  // product is optional — no 400 if missing

  // Fetch product data (only when product is selected)
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  let product: ProductFull | null = null;
  let productHeroUrls: string[] = [];

  if (productSlug) {
    // Workspace-scoped lookup (same pattern as video-swiper) - product slugs
    // are only unique per workspace, so an unscoped lookup could resolve a
    // slug from another brand's workspace.
    const { data: productData, error: productErr } = await db
      .from("products")
      .select("*")
      .eq("slug", productSlug)
      .eq("workspace_id", workspaceId)
      .single();

    if (productErr || !productData) {
      return NextResponse.json({ error: `Product "${productSlug}" not found` }, { status: 404 });
    }
    product = productData as ProductFull;

    // Product reference photos: the user's pick, or the hero images.
    productHeroUrls = await resolveSwipeReferences(db, product.id, referenceIds);
  }

  // Detect actual source image dimensions (runs in parallel with Claude call)
  const aspectRatioPromise = detectAspectRatio(image_url);

  // Build Claude system prompt (product-agnostic — extraction only)
  const systemPrompt = buildImageSwiperSystemPrompt();

  const userPrompt = buildImageSwiperUserPrompt(image_url, notes, personDescription || undefined);

  // Stream NDJSON
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  async function emit(data: object) {
    await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
  }

  (async () => {
    let currentTask: { id: string; model: string; ratio: string; prompt: string } | null = null;
    try {
      // --- Step 1: Claude Vision analysis ---
      await emit({ step: "analyzing", message: "Analyzing competitor image..." });

      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        temperature: 0.7,
        system: [
          { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image" as const,
                source: { type: "url" as const, url: image_url },
              },
              { type: "text" as const, text: userPrompt },
            ],
          },
        ],
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

      // Parse JSON (strip markdown fences if present)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let extraction: Record<string, any>;
      try {
        const cleaned = rawContent
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        extraction = JSON.parse(cleaned);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.error("[image-swiper] Parse error:", msg, "\nRaw:", rawContent.slice(0, 500));
        await emit({ step: "error", message: `Failed to parse AI response: ${msg}` });
        await writer.close();
        return;
      }

      if (!extraction.scene && !extraction.composition) {
        await emit({ step: "error", message: "AI response missing required extraction fields" });
        await writer.close();
        return;
      }

      // Derive flat analysis for UI display
      const flatAnalysis = {
        composition: `${extraction.composition?.camera_perspective ?? extraction.composition?.layout ?? "Unknown"}. ${extraction.composition?.framing ?? ""}. Focal point: ${extraction.composition?.focal_point ?? ""}`,
        colors: extraction.colors?.mood ?? "Unknown",
        mood: extraction.scene?.atmosphere ?? "Unknown",
        style: `${extraction.style?.category ?? "Unknown"}. ${extraction.style?.feel ?? ""}${extraction.style?.photo_quality ? `. Quality: ${extraction.style.photo_quality}` : ""}`,
      };

      const hasProductRef = !!product && productHeroUrls.length > 0;
      const isReplica = mode === "replica";
      const nanaBananaPrompt = buildSwipePrompt({ extraction, product, hasProductRef, forms, mode, notes });

      // Log Claude usage
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cacheCreation =
        (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;
      const cacheRead =
        (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
      const claudeCost = calcClaudeCost(inputTokens, outputTokens, cacheCreation, cacheRead);

      await db.from("usage_logs").insert({
        type: "image_swiper",
        model: CLAUDE_MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: claudeCost,
        metadata: {
          product: productSlug || null,
        },
      });

      await emit({
        step: "analyzed",
        message: "Analysis complete",
        analysis: flatAnalysis,
        extraction,
        nano_banana_prompt: nanaBananaPrompt,
      });

      // --- Step 2: Generate image with Nano Banana ---
      await emit({
        step: "generating",
        message: "Generating adapted image...",
      });

      // Use programmatically measured aspect ratio (not Claude's guess)
      const detectedRatio = await aspectRatioPromise;

      // Only Replica sends the original photo (it is a copy-with-changes mode).
      // Standard/UGC get the JSON description + our product photo, so the
      // result is a new image in that style, not a copy.
      const referenceImages = isReplica ? [image_url, ...productHeroUrls] : productHeroUrls;

      const imageTaskId = await createImageTask(
        nanaBananaPrompt,
        referenceImages,
        detectedRatio,
        // 1K: Instagram shows at most 1080 px wide, 2K only costs more.
        "1K",
        imageModel,
        // JPEG: a 2K PNG from Kie is ~6.6 MB and draws row by row for seconds.
        "jpg"
      );
      currentTask = { id: imageTaskId, model: imageModel, ratio: detectedRatio, prompt: nanaBananaPrompt };

      // Log the Kie task IMMEDIATELY (same as the Retry route): the image is
      // paid for once the task exists, and a task that never finishes must
      // still leave its id behind so it can be looked up at Kie. Before this,
      // a stuck generation left no trace at all (2026-09-30).
      await db.from("usage_logs").insert({
        type: "image_swiper",
        model: imageModel,
        cost_usd: kieImageCost(imageModel),
        metadata: {
          product: productSlug,
          task_id: imageTaskId,
          aspect_ratio: detectedRatio,
          has_product_ref: productHeroUrls.length > 0,
        },
      });
      await emit({ step: "generating", message: "Generating adapted image...", model: imageModel, task_id: imageTaskId, started_at: Date.now() });

      const result = await pollTaskResult(imageTaskId);

      if (result.urls.length === 0) {
        await emit({ step: "error", message: "No image generated" });
        await writer.close();
        return;
      }

      await emit({ step: "generating", message: "Saving image..." });
      const storedUrl = await persistSwipeImage(result.urls[0]);

      await emit({
        step: "completed",
        message: "Image generated",
        image_url: storedUrl,
        prompt_used: nanaBananaPrompt,
        aspect_ratio: detectedRatio,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[image-swiper] Error:", msg, currentTask?.id ?? "");
      if (currentTask && /timed out/i.test(msg)) {
        // Kie never finished. Hand the prompt back so the page can retry the
        // image alone (with a faster model) without redoing the analysis.
        await emit({
          step: "error",
          message: `Kie blev inte klart med bilden på 280 s (${currentTask.model}, uppdrag ${currentTask.id}).`,
          timeout: true,
          prompt_used: currentTask.prompt,
          aspect_ratio: currentTask.ratio,
        });
      } else {
        await emit({ step: "error", message: `Analysis failed: ${msg}` });
      }
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
