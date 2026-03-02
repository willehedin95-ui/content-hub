import { describe, test, expect } from "vitest";
import { parseConceptProposals } from "../concept-generator";
import type { ConceptProposal } from "@/types";

describe("parseConceptProposals", () => {
  test("extracts hypothesis field from JSON", () => {
    const jsonResponse = JSON.stringify({
      proposals: [
        {
          concept_name: "Sleep Quality Decline",
          concept_description: "Testing age-related sleep issues",
          hypothesis: "Testing Problem Aware with age-related sleep decline angle. Targets core wound (feeling older) through cinematic pain depiction.",
          cash_dna: {
            concept_type: "avatar_facts",
            angle: "Root Cause",
            style: "Infographic",
            hooks: ["After 40, Your Sleep Changes"],
            awareness_level: "Problem Aware",
            ad_source: "Swipe (competitor)",
            copy_blocks: ["Pain", "Promise", "Curiosity"],
            concept_description: "Testing age-related sleep issues"
          },
          ad_copy_primary: ["If you're over 40 and struggling with sleep..."],
          ad_copy_headline: ["Sleep Better After 40"],
          visual_direction: "Diagram showing sleep cycle decline",
          differentiation_note: "Focus on age-specific angle",
          suggested_tags: ["sleep", "aging"]
        }
      ]
    });

    const proposals = parseConceptProposals(jsonResponse);

    expect(proposals).toHaveLength(1);
    expect(proposals[0].hypothesis).toContain("Testing Problem Aware");
    expect(proposals[0].hypothesis).toContain("age-related sleep decline");
  });

  test("handles missing hypothesis gracefully", () => {
    const jsonResponse = JSON.stringify({
      proposals: [
        {
          concept_name: "Better Sleep Now",
          concept_description: "Simple sleep improvement concept",
          cash_dna: {
            angle: "Quick Win",
            awareness_level: "Solution Aware",
            hooks: ["Sleep better tonight"]
          },
          ad_copy_primary: ["Try this simple trick..."],
          ad_copy_headline: ["Sleep Better"],
          visual_direction: "Clean product shot",
          differentiation_note: "Simple and direct",
          suggested_tags: ["sleep"]
        }
      ]
    });

    const proposals = parseConceptProposals(jsonResponse);

    expect(proposals).toHaveLength(1);
    expect(proposals[0].hypothesis).toBeUndefined();
  });

  test("strips markdown fences from JSON", () => {
    const jsonResponse = `\`\`\`json
{
  "proposals": [{
    "concept_name": "Test",
    "concept_description": "Test concept",
    "hypothesis": "Test hypothesis",
    "cash_dna": { "angle": "Story", "awareness_level": "Unaware", "hooks": ["Test"] },
    "ad_copy_primary": ["Test copy"],
    "ad_copy_headline": ["Test"],
    "visual_direction": "Test",
    "differentiation_note": "Test",
    "suggested_tags": ["test"]
  }]
}
\`\`\``;

    const proposals = parseConceptProposals(jsonResponse);

    expect(proposals).toHaveLength(1);
    expect(proposals[0].hypothesis).toBe("Test hypothesis");
  });
});
