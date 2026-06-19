/**
 * Genesis concept generation (Phase 1 of the Genesis integration).
 *
 * Generates fresh ConceptProposals via the trained bots (product + segment) and swipes competitor
 * ads, structured with valid cash_dna so they enter the native flow (images, Meta push) unchanged.
 * Runs on the OpenRouter provider key. Shared helpers: constraints, normalizeDashes, parseHookList.
 */

import type { ConceptProposal, Angle, AwarenessLevel, CopyBlock } from "@/types";
import { ANGLES } from "@/types";
import { callGenesisBot } from "./genesis";

const DEFAULT_BODY_BOT = "mariobot";
const DEFAULT_HOOK_BOT = "ad-hook-bot-1";

/** Shared copy constraints that mirror our hard brand rules (no prices, target language only). */
function constraints(language: string): string {
  return [
    `Write ALL copy in ${language}.`,
    language.toLowerCase().startsWith("sw")
      ? "Use natural Swedish - NEVER English loanwords (no 'manic', 'energy', 'boost' etc.)."
      : "",
    "NEVER include any price, discount amount, or currency figure.",
    "Use regular hyphens only, never en-dashes or em-dashes.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Deterministic enforcement of the hard hyphen rule: no en/em dashes in any output copy. */
function normalizeDashes(s: string): string {
  return s.replace(/[—–]/g, "-");
}

/**
 * Parse a numbered/bulleted list of hooks into clean strings. The Opus ad-hook bot runs a
 * 2-step process and labels sections (e.g. "STEP 1 - EMOTIONAL EXCAVATION", "STEP 2 - HOOKS"),
 * so we slice to the HOOKS section if present and reject scaffolding/label lines.
 */
function parseHookList(raw: string): string[] {
  let text = raw;
  const marker = text.match(/(?:^|\n)\s*\*{0,2}\s*(?:step\s*\d+\s*[—–:-]\s*)?hooks?\b\s*\*{0,2}\s*:?\s*\n/i);
  if (marker && marker.index != null) text = text.slice(marker.index + marker[0].length);

  return text
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "")
        .replace(/^\*+|\*+$/g, "")
        .replace(/^["']|["']$/g, "")
        .trim(),
    )
    .map(normalizeDashes)
    .filter((l) => {
      if (l.length < 12 || l.length > 240) return false;
      if (!/\s/.test(l)) return false; // single token / label
      if (/\bstep\s*\d/i.test(l)) return false; // process scaffolding
      if (/excavation/i.test(l)) return false;
      if (/^hooks?:?$/i.test(l)) return false;
      if (/:\s*$/.test(l) && l.split(/\s+/).length <= 4) return false; // short header ending in colon
      return true;
    })
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// NEW-CONCEPT GENERATION (product + segment) - Genesis as a generator backend.
// Produces fresh ConceptProposals via the trained bots, structured with valid cash_dna.
// ---------------------------------------------------------------------------

export interface GenesisGenerateInput {
  productName: string;
  language: string;
  /** Tight brand/offer brief (product bank context). */
  brandBrief?: string;
  /** Required - sets cash_dna.awareness_level and shapes the copy. */
  awarenessLevel: AwarenessLevel;
  /** Optional - sets cash_dna.angle. Defaults to "Problem-Agitate" if omitted. */
  angle?: Angle;
  /** The target segment/audience (outcome x demographic x belief). */
  segmentNote?: string;
  /** How many distinct concepts to generate (default 3). Each adds ~2 sequential bot calls. */
  count?: number;
  /** Run build-a-buyer once for shared psychological context (default true). */
  buildBuyer?: boolean;
}

/**
 * Infer cash_dna.copy_blocks from the finished body (metadata only). Cheap regex over the copy -
 * avoids a wasted extra Opus call per concept. Every DR ad has Pain/Promise/Curiosity; Proof and
 * Constraints are added when the body signals them.
 */
function inferCopyBlocks(body: string): CopyBlock[] {
  const b = body.toLowerCase();
  const blocks: CopyBlock[] = ["Pain", "Promise", "Curiosity"];
  if (/\d|%|procent|studie|forskning|visar|bevis|klinisk/.test(b)) blocks.push("Proof");
  if (/även om|utan att|trots|oavsett/.test(b)) blocks.push("Constraints");
  return blocks;
}

function segmentLine(input: GenesisGenerateInput): string {
  return [
    `Product: ${input.productName}.`,
    input.brandBrief ? `Brand context: ${input.brandBrief}` : "",
    input.segmentNote ? `Target segment: ${input.segmentNote}` : "",
    `Awareness level: ${input.awarenessLevel}.`,
    input.angle ? `Angle: ${input.angle}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Short concept label from a hook (first clause, capped). */
function conceptNameFromHook(hook: string): string {
  const clause = hook.split(/[,.!?:]/)[0].trim();
  return clause.length > 60 ? clause.slice(0, 57).trim() + "..." : clause;
}

// Building blocks (exported so the streaming pipeline can interleave generate + judge per concept).

/** Build the shared buyer profile once. Returns undefined if disabled or the bot errors. */
export async function buildBuyerProfile(input: GenesisGenerateInput): Promise<string | undefined> {
  if (input.buildBuyer === false) return undefined;
  try {
    return await callGenesisBot(
      "build-a-buyer-elite-",
      `Build a deep buyer profile for this product and segment:\n\n${segmentLine(input)}`,
      { maxTokens: 2000 },
    );
  } catch {
    return undefined;
  }
}

/** Generate one batch of hooks (>= count, min 6) for the segment. */
export async function generateHooks(input: GenesisGenerateInput, buyerProfile?: string): Promise<string[]> {
  const raw = await callGenesisBot(
    DEFAULT_HOOK_BOT,
    [
      buyerProfile ? `Buyer profile:\n${buyerProfile}\n` : "",
      `Generate ${Math.max(input.count ?? 3, 6)} scroll-stopping ad hooks for:\n${segmentLine(input)}`,
      constraints(input.language),
      "Output ONLY a numbered list of hooks, nothing else.",
    ]
      .filter(Boolean)
      .join("\n"),
    { maxTokens: 1500 },
  );
  return parseHookList(raw);
}

/** Generate one concept body (mariobot) for hook[index] and assemble it into a ConceptProposal. */
export async function buildConcept(
  input: GenesisGenerateInput,
  buyerProfile: string | undefined,
  hooks: string[],
  index: number,
): Promise<ConceptProposal> {
  const angle: Angle = input.angle ?? "Problem-Agitate";
  const seg = segmentLine(input);
  const hook = hooks[index % hooks.length];
  const body = normalizeDashes(
    (
      await callGenesisBot(
        DEFAULT_BODY_BOT,
        [
          buyerProfile ? `Buyer profile:\n${buyerProfile}\n` : "",
          `Lead hook: "${hook}"`,
          `Write the full Facebook primary-text ad body for:\n${seg}`,
          constraints(input.language),
          "Output ONLY the ad copy itself - no preamble, no headline, no labels.",
        ]
          .filter(Boolean)
          .join("\n"),
        { maxTokens: 2500 },
      )
    ).trim(),
  );
  return {
    concept_name: conceptNameFromHook(hook),
    concept_description: input.segmentNote
      ? `${angle} for ${input.segmentNote} (${input.awarenessLevel}).`
      : `${angle} concept (${input.awarenessLevel}).`,
    cash_dna: {
      concept_type: null,
      angle,
      style: null,
      hooks: hooks.slice(index, index + 1).concat(hooks.filter((_, j) => j !== index).slice(0, 3)),
      awareness_level: input.awarenessLevel,
      ad_source: "Research",
      copy_blocks: inferCopyBlocks(body),
      concept_description: input.segmentNote || "",
    },
    ad_copy_primary: [body],
    ad_copy_headline: [conceptNameFromHook(hook)],
    visual_direction: `Native ${input.productName} concept matching the hook "${hook}".`,
    differentiation_note: `Genesis-generated (${angle}, ${input.awarenessLevel}).`,
    suggested_tags: [angle, input.awarenessLevel, "genesis"],
    hypothesis: `If we lead with "${hook}" for ${input.segmentNote || "this segment"}, it stops the scroll and converts on the ${angle} angle.`,
  };
}

/**
 * Generate N fresh concepts for a product + segment (non-streaming):
 * build-a-buyer (once) -> hooks (once) -> per concept: mariobot body. copy_blocks inferred from
 * the body (no extra bot call). Sequential (1 concurrent stream/key). Errors per concept skipped.
 */
export async function generateConceptsWithGenesis(
  input: GenesisGenerateInput,
): Promise<{ proposals: ConceptProposal[]; errors: string[]; buyerProfile?: string }> {
  const count = input.count ?? 3;
  const errors: string[] = [];
  const buyerProfile = await buildBuyerProfile(input);

  let hooks: string[] = [];
  try {
    hooks = await generateHooks(input, buyerProfile);
  } catch (e) {
    errors.push(`hooks: ${(e as Error).message}`);
  }
  if (!hooks.length) return { proposals: [], errors, buyerProfile };

  const proposals: ConceptProposal[] = [];
  for (let i = 0; i < count; i++) {
    try {
      proposals.push(await buildConcept(input, buyerProfile, hooks, i));
    } catch (e) {
      errors.push(`concept ${i + 1}: ${(e as Error).message}`);
    }
  }
  return { proposals, errors, buyerProfile };
}

// ---------------------------------------------------------------------------
// SWIPE-A-COMPETITOR (Genesis) - DNA-tag a competitor ad, then write a new version.
// ---------------------------------------------------------------------------

export interface GenesisSwipeInput {
  /** The competitor ad's text/copy (the swiper already captures this). */
  competitorAdText: string;
  productName: string;
  language: string;
  brandBrief?: string;
  awarenessLevel?: AwarenessLevel;
  /** If omitted, we try to read it from the DNA tags, then default. */
  angle?: Angle;
  /** Things the new ad must NOT mention (competitor name, their ingredients, etc.). */
  guardAgainst?: string;
}

/** Best-effort: find one of our Angle enum values mentioned in free-text tags. */
function angleFromTags(tags: string): Angle | undefined {
  const lower = tags.toLowerCase();
  return (ANGLES as readonly string[]).find((a) => lower.includes(a.toLowerCase())) as Angle | undefined;
}

/**
 * Swipe a competitor ad via Genesis: ad-tagging-bot- DNA-tags it (concept/angle/style/hook),
 * then mariobot writes a faithful new version for our product (mad-lib swap + brand guard),
 * structured into a ConceptProposal with ad_source "Swipe (competitor)".
 */
export async function swipeConceptWithGenesis(
  input: GenesisSwipeInput,
): Promise<{ proposal?: ConceptProposal; tags?: string; error?: string }> {
  try {
    // 1. DNA-tag the source ad.
    const tags = await callGenesisBot(
      "ad-tagging-bot-",
      `Tag this ad's concept, angle, style and hook:\n\n${input.competitorAdText}`,
      { maxTokens: 800 },
    );

    // 2. Write a faithful new version for our product (mad-lib swap).
    const newAd = normalizeDashes(
      (
        await callGenesisBot(
          DEFAULT_BODY_BOT,
          [
            `Here is a winning competitor ad. Rewrite it for MY product, keeping the same structure`,
            `and beats - treat it like Mad Libs: swap the specifics (product, mechanism, proof, names)`,
            `to mine, but keep the bones. Do not make it too derivative.`,
            ``,
            `My product: ${input.productName}.`,
            input.brandBrief ? `Brand context: ${input.brandBrief}` : "",
            input.guardAgainst ? `Do NOT mention: ${input.guardAgainst}.` : "",
            constraints(input.language),
            ``,
            `SOURCE AD:\n${input.competitorAdText}`,
            ``,
            `Output ONLY the rewritten ad copy.`,
          ]
            .filter(Boolean)
            .join("\n"),
          { maxTokens: 2500 },
        )
      ).trim(),
    );

    // 3. Structure.
    const copyBlocks = inferCopyBlocks(newAd);

    const angle: Angle = input.angle || angleFromTags(tags) || "Story";
    const awareness: AwarenessLevel = input.awarenessLevel || "Problem Aware";
    const firstLine = newAd.split("\n").find((l) => l.trim().length > 10)?.trim() || newAd.slice(0, 80);

    const proposal: ConceptProposal = {
      concept_name: conceptNameFromHook(firstLine),
      concept_description: `Swiped from a competitor ad, rewritten for ${input.productName} (${angle}).`,
      cash_dna: {
        concept_type: null,
        angle,
        style: null,
        hooks: [firstLine],
        awareness_level: awareness,
        ad_source: "Swipe (competitor)",
        copy_blocks: copyBlocks,
        concept_description: "Faithful mad-lib swipe.",
      },
      ad_copy_primary: [newAd],
      ad_copy_headline: [conceptNameFromHook(firstLine)],
      visual_direction: `Match the competitor ad's format, adapted to ${input.productName}.`,
      differentiation_note: `Genesis swipe (${angle}). DNA tags: ${tags.slice(0, 200)}`,
      suggested_tags: [angle, awareness, "genesis", "swipe"],
      hypothesis: `This competitor format converts; the same structure with our mechanism should win for ${input.productName}.`,
    };

    return { proposal, tags };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
