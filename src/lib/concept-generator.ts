import type { ProductFull, CopywritingGuideline, SpyAd, ConceptProposal } from "@/types";

// Condensed CASH framework for the system prompt
const CASH_FRAMEWORK = `## C.A.S.H. Framework (Concepts, Angles, Styles, Hooks)

CONCEPT TYPES (the core insight bucket):
- avatar_facts: Raw truths about the audience (pain expressions, core wounds, buying triggers)
- market_facts: Competitive landscape intelligence (solutions tried, cultural influences)
- product_facts: Truth about the solution (discovery story, mechanism, proof)
- psychology_toolkit: Techniques to reshape understanding (metaphors, paradoxes)

ANGLES (psychological entry point — each creates a different "lens" on the same concept):
Story, Contrarian, Expert Crossover, Root Cause, Accidental Discovery, Tribal, Conspiracy, Geographic, New Science, Symptom Reframe, Worldview, Case Study, Before/After, Comparison, Social Proof, Educational, Fear-Based, Aspirational, Curiosity, Problem-Agitate

STYLES (creative execution format):
Product Shot, Lifestyle, UGC-style, Infographic, Before/After, Testimonial, Meme, Screenshot, Text Overlay, Collage, Comparison

AWARENESS LEVELS:
Unaware, Problem Aware, Solution Aware, Product Aware, Most Aware

COPY BLOCKS (building blocks of the ad copy):
Pain, Promise, Proof, Curiosity, Constraints, Conditions

KEY PRINCIPLE: The same product can have hundreds of unique ad concepts by varying Concept × Angle × Style × Hook. Each proposal you generate MUST use a DIFFERENT angle to maximize creative coverage.`;

const ITERATION_GUIDE = `## How to Differentiate from the Competitor Ad

Use these primary moves to create meaningfully different concepts:
1. Segment/Pain Point Swap — same product, different customer pain
2. Angle Swap — same concept, different psychological entry point
3. Hook Swap — same body, different pattern interrupts
4. Style/Format Swap — same message, different visual execution
5. Awareness Level Shift — target a different stage of awareness

Each proposal should feel like a DIFFERENT ad from a DIFFERENT brand, not slight variations of each other.`;

/**
 * Build the system prompt for concept generation.
 */
export function buildConceptSystemPrompt(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[]
): string {
  // Build product context from structured data
  const productContext = [
    `Product: ${product.name}`,
    product.tagline ? `Tagline: ${product.tagline}` : null,
    product.benefits?.length ? `Key Benefits:\n${product.benefits.map((b) => `- ${b}`).join("\n")}` : null,
    product.usps?.length ? `USPs:\n${product.usps.map((u) => `- ${u}`).join("\n")}` : null,
    product.claims?.length ? `Proof/Claims:\n${product.claims.map((c) => `- ${c}`).join("\n")}` : null,
    product.target_audience ? `Target Audience: ${product.target_audience}` : null,
    product.ingredients ? `Key Ingredients: ${product.ingredients}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Get any additional guidelines (besides the Product Brief)
  const extraGuidelines = guidelines
    .filter((g) => g.name !== "Product Brief")
    .slice(0, 3)
    .map((g) => `### ${g.name}\n${g.content.slice(0, 1500)}`)
    .join("\n\n");

  return `You are a senior direct-response creative strategist specializing in health & wellness ecommerce for Scandinavian markets (Sweden, Norway, Denmark). You generate ad concept ideas inspired by competitor ads, adapted for our products.

You understand the psychology of health-conscious Scandinavian consumers — Jantelagen (never brag or overclaim), peer social proof matters more than celebrity endorsement, and understatement beats hype.

${CASH_FRAMEWORK}

---

## PRODUCT KNOWLEDGE

${productContext}

${productBrief ? `### Product Brief\n${productBrief}` : ""}

${extraGuidelines ? `### Additional Guidelines\n${extraGuidelines}` : ""}

---

${ITERATION_GUIDE}

---

## OUTPUT INSTRUCTIONS

Generate concept proposals as a JSON object with a "proposals" array. Each proposal MUST have:

{
  "proposals": [
    {
      "concept_name": "Short memorable name (2-5 words)",
      "concept_description": "2-3 sentences describing the core idea and why it would work",
      "cash_dna": {
        "concept_type": "avatar_facts | market_facts | product_facts | psychology_toolkit",
        "angle": "one of the 20 angles listed above — MUST be DIFFERENT for each proposal",
        "style": "one of the 11 styles listed above",
        "hooks": ["3-5 hook line variations — the opening line the viewer sees first"],
        "awareness_level": "Unaware | Problem Aware | Solution Aware | Product Aware | Most Aware",
        "ad_source": "Swipe (competitor)",
        "copy_blocks": ["array of blocks used: Pain, Promise, Proof, Curiosity, Constraints, Conditions"],
        "concept_description": "same as outer concept_description"
      },
      "ad_copy_primary": ["2-3 primary ad text variations (English, 100-200 words each)"],
      "ad_copy_headline": ["2-3 headline variations (English, max 40 chars each)"],
      "visual_direction": "What the static ad image should look like — layout, imagery, mood, text overlay approach",
      "differentiation_note": "How this differs from the competitor ad's approach",
      "suggested_tags": ["2-4 relevant tags for organization"]
    }
  ]
}

CRITICAL RULES:
- Each proposal MUST use a DIFFERENT angle
- NEVER copy competitor claims — only use claims from the product brief above
- Write ad copy in ENGLISH (it will be translated later)
- Hooks should be scroll-stopping — curiosity, pattern interrupts, or strong emotional triggers
- Primary text should be ready-to-use ad copy, not placeholder text
- Visual direction should be specific enough to brief a designer
- Return ONLY valid JSON, no markdown fences, no explanation text`;
}

/**
 * Build the user prompt with spy ad details.
 */
export function buildConceptUserPrompt(ad: SpyAd, count: number): string {
  const parts: string[] = [];

  parts.push("## COMPETITOR AD");
  if (ad.brand) {
    parts.push(`Brand: ${ad.brand.name}${ad.brand.category ? ` (${ad.brand.category})` : ""}`);
  }
  if (ad.headline) parts.push(`Headline: ${ad.headline}`);
  if (ad.body) parts.push(`Body: ${ad.body}`);
  if (ad.description) parts.push(`Description: ${ad.description}`);
  if (ad.cta_type) parts.push(`CTA: ${ad.cta_type}`);
  if (ad.media_type) parts.push(`Media type: ${ad.media_type}`);
  if (ad.link_url) parts.push(`Destination: ${ad.link_url}`);

  if (ad.cash_analysis) {
    const a = ad.cash_analysis;
    parts.push("");
    parts.push("## CASH ANALYSIS OF COMPETITOR AD");
    if (a.concept_type) parts.push(`Concept Type: ${a.concept_type}`);
    if (a.angle) parts.push(`Angle: ${a.angle}`);
    if (a.style) parts.push(`Style: ${a.style}`);
    if (a.awareness_level) parts.push(`Awareness Level: ${a.awareness_level}`);
    if (a.hooks?.length) parts.push(`Hooks: ${a.hooks.join(" | ")}`);
    if (a.copy_blocks?.length) parts.push(`Copy Blocks: ${a.copy_blocks.join(", ")}`);
    if (a.concept_description) parts.push(`Core Concept: ${a.concept_description}`);
    if (a.offer_type) parts.push(`Offer Type: ${a.offer_type}`);
    if (a.estimated_production) parts.push(`Production Style: ${a.estimated_production}`);
  }

  parts.push("");
  parts.push(
    `Generate ${count} concept proposals for our product inspired by this competitor ad. Each MUST use a DIFFERENT angle and approach. Draw inspiration from what makes this competitor ad effective, but adapt the strategy for our product with our own claims and proof.`
  );

  return parts.join("\n");
}

/**
 * Parse and validate concept proposals from Claude's raw JSON response.
 */
export function parseConceptProposals(raw: string): ConceptProposal[] {
  // Strip markdown fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(cleaned);
  const proposals: ConceptProposal[] = parsed.proposals ?? parsed;

  if (!Array.isArray(proposals)) {
    throw new Error("Expected proposals array");
  }

  // Map proposals to extract hypothesis if not already present
  return proposals.map((p) => {
    // If hypothesis is already in the JSON structure, use it
    if (p.hypothesis) {
      return p;
    }

    // Otherwise, try to extract from concept_description or differentiation_note
    // (Fallback for responses that don't include hypothesis as a top-level field)
    const hypothesisMatch = (p.concept_description || p.differentiation_note || "")
      .match(/hypothesis:?\s*(.+?)(?=\n\n|\n[A-Z]|$)/i);

    return {
      ...p,
      hypothesis: hypothesisMatch ? hypothesisMatch[1].trim() : undefined,
    };
  }).filter((p) => {
    // Validate each proposal has required fields
    return (
      p.concept_name &&
      p.concept_description &&
      p.cash_dna?.angle &&
      Array.isArray(p.ad_copy_primary) &&
      p.ad_copy_primary.length > 0 &&
      Array.isArray(p.ad_copy_headline) &&
      p.ad_copy_headline.length > 0
    );
  });
}
