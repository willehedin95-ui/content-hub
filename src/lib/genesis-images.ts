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

/** Split a bot's output into up to n renderable image prompts. */
function parsePrompts(raw: string, n: number): string[] {
  let parts = raw
    .split(/\n?\s*(?:PROMPT|IMAGE|CONCEPT|VARIATION|AD)\s*#?\s*\d+\s*[:.)\-]/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
  if (parts.length < 2) {
    parts = raw.split(/\n\s*\n/).map((s) => s.trim()).filter((s) => s.length > 40);
  }
  // Strip markdown code fences / headers / bold markers that sometimes wrap a chunk.
  return parts
    .map((p) => p.replace(/```[a-z]*/gi, "").replace(/^#+\s*/, "").replace(/\*+/g, "").trim())
    .filter((p) => p.length > 40)
    .slice(0, n);
}

export async function generateGenesisStaticImages(opts: {
  jobId: string;
  workspaceId: string;
  botSlug: string;
  count?: number;
}): Promise<GenerateStaticResult> {
  const { jobId, workspaceId, botSlug } = opts;
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

  const raw = await callGenesisBot(botSlug, input, { maxTokens: 2800 });
  const prompts = parsePrompts(raw, count);
  if (!prompts.length) throw new Error("Genesis bot returned no usable prompts");

  const briefs: ImageBrief[] = prompts.map((prompt) => ({
    // The bot slug isn't a StaticStyleId, but style is only used as a label / generation_style
    // string and for reference-image category preference (falls back to the product hero).
    style: botSlug as StaticStyleId,
    prompt,
    hookText: hook,
    headlineText: headline,
    referenceStrategy: "product",
  }));

  return generateStaticImages({ jobId, workspaceId, injectedBriefs: briefs });
}
