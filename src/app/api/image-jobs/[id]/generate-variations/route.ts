import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { generateImage } from "@/lib/kie";
import { STORAGE_BUCKET, KIE_MODEL, CLAUDE_MODEL } from "@/lib/constants";
import { KIE_IMAGE_COST, calcClaudeCost } from "@/lib/pricing";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export const maxDuration = 300;

// POST /api/image-jobs/[id]/generate-variations
// Generates more variations of a competitor-swipe concept.
// Keeps the same visual style but varies hook text and scene details.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const count = Math.min(Math.max(body.count ?? 3, 1), 6);

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Fetch the job with existing source images
  const { data: job, error: jobErr } = await db
    .from("image_jobs")
    .select("*, source_images(id, generation_prompt, generation_style, processing_order, batch)")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (jobErr || !job) {
    return safeError(jobErr ?? new Error("Not found"), "Job not found", 404);
  }

  const refData = job.competitor_reference_data as {
    competitor_image_urls?: string[];
    product_hero_urls?: string[];
  } | null;

  const competitorImageUrls = refData?.competitor_image_urls ?? [];
  const productHeroUrls = refData?.product_hero_urls ?? [];

  // Build product appearance description for faithful rendering
  const { data: productData } = job.product
    ? await db.from("products").select("name, ingredients").eq("slug", job.product).single()
    : { data: null };
  const productAppearance = productData?.ingredients
    ? `The product is: ${productData.name}. Physical appearance from specs: ${productData.ingredients}. IMPORTANT: The pillow must have a white quilted diamond-pattern fabric cover with a distinctive black mesh breathable ventilation strip along the bottom/side edge. It is a contoured cervical pillow with dual height (higher on one side). Do NOT show bare foam — always show the finished pillow with its fabric cover on.`
    : "";

  // Gather existing prompts to avoid repetition
  const existingPrompts = ((job.source_images ?? []) as Array<{ generation_prompt?: string }>)
    .map((si) => si.generation_prompt)
    .filter(Boolean) as string[];

  // Compute next batch number
  const maxBatch = Math.max(1, ...((job.source_images ?? []) as Array<{ batch?: number }>).map((si) => si.batch ?? 1));
  const batch = maxBatch + 1;

  // Build Claude prompt for variations
  const conceptName = job.name ?? "Unknown concept";
  const visualDirection = job.visual_direction ?? "";
  const cashDna = job.cash_dna as Record<string, unknown> | null;

  const systemPrompt = `You are an expert ad creative strategist generating VARIATIONS of an existing competitor-swipe concept.

## Original Concept
- Name: ${conceptName}
- Visual Direction: ${visualDirection}
${cashDna?.concept_description ? `- Description: ${cashDna.concept_description}` : ""}
${cashDna?.angle ? `- Angle: ${cashDna.angle}` : ""}
${cashDna?.style ? `- Style: ${cashDna.style}` : ""}

## Existing Image Prompts (DO NOT REPEAT THESE)
${existingPrompts.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## Your Task
Generate exactly ${count} NEW variations that:
1. Keep the SAME visual style/format as the original (if it was illustrated before/after, all variations should be illustrated before/after, etc.)
2. Each variation MUST have a DIFFERENT hook_text — this is the most important axis of variation. Test completely different angles, emotions, or framings.
3. Each variation should have a slightly different scene — vary the person, setting, angle, lighting, or moment. Enough to feel like a distinct ad, but clearly from the same creative family.
4. Variations must NOT repeat or closely paraphrase any of the existing prompts above.

## Output Format
Return a JSON object with:
\`\`\`json
{
  "variations": [
    {
      "prompt": "Detailed Nano Banana image generation prompt. Must be self-contained — describe the COMPLETE scene, composition, style, colors, and text placement. Do NOT reference other images.",
      "hook_text": "Bold attention-grabbing headline for the image (short, punchy, 5-12 words)",
      "headline_text": "Supporting subheadline text (optional, can be empty string)",
      "include_product_reference": false
    }
  ]
}
\`\`\`

IMPORTANT RULES:
- include_product_reference: set to true ONLY if the original concept shows a physical product prominently. For native/UGC/editorial style ads, ALWAYS false.
- hook_text is rendered ON the image — keep it short and impactful.
- The prompt must describe text placement and styling (font weight, contrast, position).
- Return ONLY the JSON, no markdown fences, no explanation.`;

  const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  // Include competitor images for visual reference
  for (const url of competitorImageUrls.slice(0, 3)) {
    userContent.push({ type: "image" as const, source: { type: "url" as const, url } });
  }

  userContent.push({
    type: "text" as const,
    text: `Generate ${count} new variations of this competitor-swipe concept. Keep the same visual style but vary the hook text and scene details. Each variation should feel like a different ad from the same creative family.`,
  });

  // Call Claude
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  let parsed: {
    variations: Array<{
      prompt: string;
      hook_text: string;
      headline_text: string;
      include_product_reference?: boolean;
    }>;
  };

  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      temperature: 0.8,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    inputTokens = response.usage.input_tokens;
    outputTokens = response.usage.output_tokens;

    const rawText = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return safeError(err, "Failed to generate variations via Claude");
  }

  if (!parsed.variations?.length) {
    return NextResponse.json({ error: "Claude returned no variations" }, { status: 500 });
  }

  // Log Claude usage
  const claudeCost = calcClaudeCost(inputTokens, outputTokens);
  await db.from("usage_logs").insert({
    type: "claude_rewrite",
    page_id: null,
    translation_id: null,
    model: CLAUDE_MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: claudeCost,
    metadata: {
      purpose: "swipe_variation_prompts",
      image_job_id: id,
      variation_count: parsed.variations.length,
    },
  });

  // Generate images sequentially (so they appear one-by-one during polling)
  let generated = 0;
  let failed = 0;
  const errors: string[] = [];
  const sourceImages: Array<{ id: string; original_url: string; prompt: string }> = [];

  for (let index = 0; index < parsed.variations.length; index++) {
    const variation = parsed.variations[index];
    try {
      // Pass competitor image as style reference so variations match the original's visual style.
      const includeProduct = variation.include_product_reference === true;
      const competitorStyleRef = competitorImageUrls[0];
      const referenceUrls = [
        ...(competitorStyleRef ? [competitorStyleRef] : []),
        ...(includeProduct ? productHeroUrls : []),
      ];

      // Build full prompt with product appearance + text overlay
      let fullPrompt = variation.prompt;

      // Append product appearance description when product is included
      if (includeProduct && productAppearance) {
        fullPrompt += " " + productAppearance;
      }

      if (variation.hook_text || variation.headline_text) {
        const textParts: string[] = [];
        if (variation.hook_text) {
          textParts.push(`Bold, attention-grabbing headline text reading "${variation.hook_text}" prominently placed in the image with high contrast against the background.`);
        }
        if (variation.headline_text) {
          textParts.push(`Secondary text line reading "${variation.headline_text}" placed below the main headline in a smaller but still legible font.`);
        }
        fullPrompt += " " + textParts.join(" ");
      }

      const { urls: resultUrls, costTimeMs } = await generateImage(
        fullPrompt,
        referenceUrls,
        "4:5"
      );

      if (!resultUrls?.length) {
        throw new Error(`Variation ${index + 1}: No image generated`);
      }

      const resultRes = await fetch(resultUrls[0]);
      if (!resultRes.ok) {
        throw new Error(`Variation ${index + 1}: Failed to download`);
      }
      const buffer = Buffer.from(await resultRes.arrayBuffer());

      const fileId = crypto.randomUUID();
      const filePath = `image-jobs/${id}/${fileId}.png`;
      const { error: uploadError } = await db.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, buffer, { contentType: "image/png", upsert: false });

      if (uploadError) {
        throw new Error(`Variation ${index + 1}: Upload failed — ${uploadError.message}`);
      }

      const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

      const { data: sourceImage, error: siErr } = await db
        .from("source_images")
        .insert({
          job_id: id,
          original_url: urlData.publicUrl,
          filename: `swipe-variation-${fileId.slice(0, 8)}.png`,
          processing_order: (existingPrompts.length + index),
          skip_translation: false,
          generation_prompt: variation.prompt,
          generation_style: "competitor-swipe",
          batch,
          batch_label: "Variations",
        })
        .select()
        .single();

      if (siErr || !sourceImage) {
        throw new Error(`Variation ${index + 1}: DB insert failed`);
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
          purpose: "swipe_variation",
          image_job_id: id,
          source_image_id: sourceImage.id,
          kie_cost_time_ms: costTimeMs,
          reference_image_count: referenceUrls.length,
        },
      });

      sourceImages.push({ id: sourceImage.id, original_url: urlData.publicUrl, prompt: variation.prompt });
      generated++;
    } catch (err) {
      failed++;
      errors.push(err instanceof Error ? err.message : String(err));
      console.error(`[generate-variations] Variation ${index + 1} failed:`, err);
    }
  }

  // Update job timestamp
  await db
    .from("image_jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({
    generated,
    failed,
    batch,
    source_images: sourceImages,
    errors: errors.length > 0 ? errors : undefined,
  });
}
