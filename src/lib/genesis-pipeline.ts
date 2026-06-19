/**
 * Genesis pipeline orchestrator - composes all phases into one usable call.
 *
 *   standing rules (Phase 4) -> generate via trained bots (Phase 1)
 *     -> judge each concept (Phase 3) -> regenerate REJECTs once -> return vetted concepts.
 *
 * The image-prompt lint (Phase 2) runs later at image-gen time; the coverage map (Phase 4)
 * feeds suggestGaps() into the input. This is the function the /api/genesis/generate route calls.
 */

import type { ConceptProposal } from "@/types";
import { generateConceptsWithGenesis, type GenesisGenerateInput } from "./genesis-concepts";
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
}

/**
 * Generate concepts via Genesis, vet each with the judge, regenerate REJECTs once.
 * Returns vetted (PASS/WARN) and rejected (still REJECT after a retry) concepts, each with its
 * judge verdict attached so the UI can badge quality.
 */
export async function generateVettedConcepts(
  input: GenesisGenerateInput,
  opts: VettedOptions = {},
): Promise<{ vetted: VettedConcept[]; rejected: VettedConcept[]; errors: string[] }> {
  const runJudge = opts.judge ?? true;
  const regen = opts.regenerateRejects ?? true;
  const errors: string[] = [];

  // Phase 4: fold standing rules into the brief.
  const ruleBlock = rulesToPromptBlock(opts.rules || []);
  const enrichedInput: GenesisGenerateInput = {
    ...input,
    brandBrief: [input.brandBrief, ruleBlock].filter(Boolean).join("\n\n") || undefined,
  };

  const gen = await generateConceptsWithGenesis(enrichedInput);
  errors.push(...gen.errors);

  const vetted: VettedConcept[] = [];
  const rejected: VettedConcept[] = [];

  for (const proposal of gen.proposals) {
    let current = proposal;
    let judge: JudgeResult = { verdict: "PASS", score: 7, issues: [], blocked: false };
    let regenerated = false;

    if (runJudge) {
      judge = await judgeCopy(current.ad_copy_primary[0] || "", { language: input.language, productName: input.productName });

      if (judge.verdict === "REJECT" && regen) {
        // Bank this concept's issues as one-off rules and regenerate just this slot.
        const fixes = judge.issues.map((i) => i.fix).filter(Boolean);
        const retry = await generateConceptsWithGenesis({
          ...enrichedInput,
          angle: current.cash_dna.angle,
          awarenessLevel: current.cash_dna.awareness_level,
          count: 1,
          buildBuyer: false,
          brandBrief: [enrichedInput.brandBrief, fixes.length ? `Avoid these problems: ${fixes.join("; ")}` : ""]
            .filter(Boolean)
            .join("\n\n"),
        });
        if (retry.proposals[0]) {
          current = retry.proposals[0];
          judge = await judgeCopy(current.ad_copy_primary[0] || "", { language: input.language, productName: input.productName });
          regenerated = true;
        }
        errors.push(...retry.errors);
      }
    }

    const entry: VettedConcept = { proposal: current, judge, regenerated };
    if (judge.verdict === "REJECT") rejected.push(entry);
    else vetted.push(entry);
  }

  return { vetted, rejected, errors };
}
