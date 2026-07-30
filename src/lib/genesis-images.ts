/**
 * Genesis image-bot static ads.
 *
 * Instead of the hub's own Claude image briefs, this drives static-ad generation with one of the
 * ~45 trained Genesis "Image Prompt" bots (each a proven ad format: receipt, UGC, reptile-triggers,
 * testimonial, native-news, ...). The chosen bot writes N image-generation prompts from the
 * concept's ad copy; those are injected into the existing render pipeline (KIE + product-appearance
 * lint), so the renderer, product reference images, and Swedish-text guard all still apply.
 */

import { createServerSupabase } from "@/lib/supabase-admin";
import { callGenesisBot } from "@/lib/genesis";
import { getProductAppearance } from "@/lib/product-appearance";
import { getAdCopyLanguageByWorkspaceId } from "@/lib/workspace";
import { generateStaticImages, type GenerateStaticResult } from "@/lib/generate-static-images";
import type { ImageBrief } from "@/lib/static-ad-prompt";
import type { StaticStyleId } from "@/lib/constants";

const LANG_NAMES: Record<string, string> = { sv: "Swedish", da: "Danish", no: "Norwegian", de: "German", en: "English" };

/**
 * Split a bot's output into up to n renderable image prompts. The "PROMPT n:" anchors we
 * instruct the bot to use are REQUIRED - the old paragraph-split fallback rendered bot
 * preamble/commentary chunks as paid images (audit img17). Everything before the first
 * anchor is preamble and is dropped.
 */
function parsePrompts(raw: string, n: number): string[] {
  const parts = raw
    .split(/\n?\s*\*{0,2}#{0,4}\s*\*{0,2}PROMPT\s*#?\s*\d+\s*\*{0,2}\s*[:.)\-]/i)
    .slice(1) // [0] = whatever precedes "PROMPT 1:" - never a prompt
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
  // Strip markdown code fences / headers / bold markers that sometimes wrap a chunk.
  return parts
    .map((p) => p.replace(/```[a-z]*/gi, "").replace(/^#+\s*/, "").replace(/\*+/g, "").trim())
    .filter((p) => p.length > 40)
    .slice(0, n);
}

export type GenesisPhase = "bot_call" | "bot_retry" | "rendering";

export async function generateGenesisStaticImages(opts: {
  jobId: string;
  workspaceId: string;
  botSlug: string;
  count?: number;
  /** Progress hook so an async caller can surface where the run stands. */
  onPhase?: (phase: GenesisPhase, extra?: Record<string, unknown>) => Promise<void> | void;
}): Promise<GenerateStaticResult> {
  const { jobId, workspaceId, botSlug, onPhase } = opts;
  const count = Math.min(Math.max(opts.count ?? 3, 1), 5);
  const db = createServerSupabase();

  const { data: job } = await db
    .from("image_jobs")
    .select("name, product, ad_copy_primary, ad_copy_headline, cash_dna")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!job) throw new Error("Job not found");

  const { data: product } = await db
    .from("products")
    .select("slug, name, description, ingredients")
    .eq("slug", job.product)
    .maybeSingle();
  const appearance = product ? getProductAppearance(product) : "";

  const langName = LANG_NAMES[await getAdCopyLanguageByWorkspaceId(workspaceId)] || "Swedish";
  const copy = (job.ad_copy_primary as string[] | null)?.[0] || "";
  const headline = (job.ad_copy_headline as string[] | null)?.[0] || job.name || "";
  const hook = (job.cash_dna as { hooks?: string[] } | null)?.hooks?.[0] || headline;

  const facts = [product?.description, product?.ingredients].filter(Boolean).join(" ").slice(0, 800);

  const input = [
    `Ad copy:\n${copy}`,
    headline ? `Headline: ${headline}` : "",
    appearance ? `Product visual (must match exactly): ${appearance}` : "",
    facts ? `PRODUCT FACTS (use ONLY these - never invent flavors, ingredients, numbers, or claims): ${facts}` : "",
    ``,
    `Generate ${count} DISTINCT static ad image concepts in YOUR format for this ad. For EACH, output a complete, ready-to-render image-generation prompt (a vivid visual description for an AI image generator).`,
    `Number them exactly "PROMPT 1:", "PROMPT 2:", ... Output ONLY the prompts.`,
    `HARD RULES for any text shown in the image: it MUST be exact, natural ${langName} with correct spelling and diacritics (å, ä, ö) - never drop or replace them, never use English words. Use regular hyphens, never en/em dashes. Do NOT invent product claims, flavors, or figures - only use the PRODUCT FACTS above.`,
  ]
    .filter(Boolean)
    .join("\n");

  // Image prompts are ~200-500 tokens each plus bot preamble; a count-scaled cap keeps the
  // Opus-class bots from rambling for minutes (the old fixed 2800 made every 1-image run pay
  // 5-image latency). Floor of 800 covers preamble + a full prompt - a mid-sentence cut can
  // leave a dangling text-overlay instruction that renders as garbage text in the image.
  const maxTokens = Math.min(2800, 800 + 700 * count);
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  const addUsage = (u: { prompt_tokens?: number; completion_tokens?: number }) => {
    usage.prompt_tokens += u.prompt_tokens ?? 0;
    usage.completion_tokens += u.completion_tokens ?? 0;
  };

  await onPhase?.("bot_call");
  const raw = await callGenesisBot(botSlug, input, { maxTokens, onUsage: addUsage });
  let prompts = parsePrompts(raw, count);
  if (prompts.length < count) {
    // One strict retry: some bots wrap output in commentary or skip the numbering.
    console.warn(`[genesis-images] ${botSlug}: parsed ${prompts.length}/${count} anchored prompts - retrying with stricter instruction`);
    await onPhase?.("bot_retry");
    const strictRaw = await callGenesisBot(
      botSlug,
      [
        input,
        ``,
        `IMPORTANT: Your output will be machine-parsed. Output EXACTLY ${count} prompts and NOTHING else - no introduction, no commentary, no closing note. Each prompt MUST start on its own line with "PROMPT 1:", "PROMPT 2:", ... in that exact format.`,
      ].join("\n"),
      { maxTokens, onUsage: addUsage },
    );
    const strictPrompts = parsePrompts(strictRaw, count);
    if (strictPrompts.length > prompts.length) prompts = strictPrompts;
  }
  // Log the bot step as soon as it finishes (cost billed via the provider key, not us) -
  // this row doubling as the "prompts are done, rendering starts now" marker when debugging.
  await db.from("usage_logs").insert({
    type: "genesis_image_prompts",
    page_id: null,
    translation_id: null,
    model: botSlug,
    input_tokens: usage.prompt_tokens,
    output_tokens: usage.completion_tokens,
    cost_usd: 0,
    metadata: {
      image_job_id: jobId,
      requested: count,
      parsed_prompts: prompts.length,
      max_tokens: maxTokens,
      billed_via: "provider_key",
    },
  });
  if (prompts.length < count) {
    // Never render preamble chunks as images - fail the format loudly instead.
    throw new Error(
      `Genesis bot "${botSlug}" returned ${prompts.length}/${count} parseable "PROMPT n:" prompts after a strict retry - refusing to render unparsed output`,
    );
  }

  const briefs: ImageBrief[] = prompts.map((prompt) => ({
    // The bot slug isn't a StaticStyleId, but style is only used as a label / generation_style
    // string and for reference-image category preference (falls back to the product hero).
    style: botSlug as StaticStyleId,
    prompt,
    hookText: hook,
    headlineText: headline,
    referenceStrategy: "product",
  }));

  await onPhase?.("rendering", { prompts: prompts.length });
  // No auto-QA/text-correction: fastest path, user triggers QA per image manually when needed.
  return generateStaticImages({ jobId, workspaceId, injectedBriefs: briefs });
}
