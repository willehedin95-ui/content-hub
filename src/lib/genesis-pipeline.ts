/**
 * Genesis pipeline orchestrator - composes all phases into one usable call.
 *
 *   standing rules (Phase 4) -> per concept: generate (Phase 1) -> judge (Phase 3)
 *     -> regenerate REJECTs once -> emit. Interleaved so each concept can stream as it completes.
 *
 * The image-prompt lint (Phase 2) runs later at image-gen time; the coverage map (Phase 4)
 * feeds suggestGaps() into the input. This is the function the /api/genesis/generate route calls.
 */

import type { ConceptProposal } from "@/types";
import { buildBuyerProfile, generateHooks, buildConcept, type GenesisGenerateInput } from "./genesis-concepts";
import { judgeCopy, type JudgeResult } from "./creative-judge";
import { rulesToPromptBlock } from "./standards-ladder";

export interface VettedConcept {
  proposal: ConceptProposal;
  judge: JudgeResult;
  regenerated: boolean;
}

export interface VettedOptions {
  /** Banked standing rules (Phase 4) to prepend to generation. */
  rules?: string[];
  /** Run the judge (Phase 3). Default true. */
  judge?: boolean;
  /** Regenerate a REJECTed concept once. Default true. */
  regenerateRejects?: boolean;
  /** Fired before each phase / concept so callers can stream progress. */
  onProgress?: (e: { phase: "buyer" | "hooks" | "generating"; index?: number; total?: number }) => void | Promise<void>;
  /** Fired after each concept is vetted (and persisted by the caller), for streaming. */
  onConcept?: (v: VettedConcept) => void | Promise<void>;
}

const PASS_JUDGE: JudgeResult = { verdict: "PASS", score: 7, issues: [], blocked: false };

/**
 * Generate concepts via Genesis, vet each with the judge, regenerate REJECTs once. Interleaved:
 * builds the shared buyer + hooks, then loops one concept at a time (generate -> judge -> regen),
 * calling onProgress/onConcept as it goes. Returns vetted (PASS/WARN) and rejected concepts.
 */
export async function generateVettedConcepts(
  input: GenesisGenerateInput,
  opts: VettedOptions = {},
): Promise<{ vetted: VettedConcept[]; rejected: VettedConcept[]; errors: string[] }> {
  const runJudge = opts.judge ?? true;
  const regen = opts.regenerateRejects ?? true;
  const count = input.count ?? 3;
  const errors: string[] = [];

  // Phase 4: fold standing rules into the brief.
  const ruleBlock = rulesToPromptBlock(opts.rules || []);
  const enrichedInput: GenesisGenerateInput = {
    ...input,
    brandBrief: [input.brandBrief, ruleBlock].filter(Boolean).join("\n\n") || undefined,
  };

  const judgeOf = (p: ConceptProposal) =>
    judgeCopy(p.ad_copy_primary[0] || "", { language: input.language, productName: input.productName });

  await opts.onProgress?.({ phase: "buyer" });
  const buyerProfile = await buildBuyerProfile(enrichedInput);

  await opts.onProgress?.({ phase: "hooks" });
  let hooks: string[] = [];
  try {
    hooks = await generateHooks(enrichedInput, buyerProfile);
  } catch (e) {
    errors.push(`hooks: ${(e as Error).message}`);
  }
  if (!hooks.length) return { vetted: [], rejected: [], errors };

  const vetted: VettedConcept[] = [];
  const rejected: VettedConcept[] = [];

  for (let i = 0; i < count; i++) {
    await opts.onProgress?.({ phase: "generating", index: i, total: count });
    try {
      let current = await buildConcept(enrichedInput, buyerProfile, hooks, i);
      let judge = runJudge ? await judgeOf(current) : PASS_JUDGE;
      let regenerated = false;

      if (runJudge && judge.verdict === "REJECT" && regen) {
        const fixes = judge.issues.map((iss) => iss.fix).filter(Boolean);
        const retryInput: GenesisGenerateInput = {
          ...enrichedInput,
          brandBrief: [enrichedInput.brandBrief, fixes.length ? `Avoid these problems: ${fixes.join("; ")}` : ""]
            .filter(Boolean)
            .join("\n\n"),
        };
        const retry = await buildConcept(retryInput, buyerProfile, hooks, i);
        current = retry;
        judge = await judgeOf(current);
        regenerated = true;
      }

      const entry: VettedConcept = { proposal: current, judge, regenerated };
      if (judge.verdict === "REJECT") rejected.push(entry);
      else vetted.push(entry);
      await opts.onConcept?.(entry);
    } catch (e) {
      errors.push(`concept ${i + 1}: ${(e as Error).message}`);
    }
  }

  return { vetted, rejected, errors };
}
