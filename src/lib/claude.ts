import Anthropic from "@anthropic-ai/sdk";
import type { ProductFull, CopywritingGuideline, ReferencePage } from "@/types";
import { withRetry, isTransientError } from "./retry";
import { CLAUDE_MODEL } from "./constants";

export type SwiperAngle = "neck-pain" | "snoring" | "sleep-quality" | "auto-detect";

const ANGLE_LABELS: Record<SwiperAngle, string> = {
  "neck-pain": "Neck Pain — morning stiffness, chronic pain, failed treatments",
  "snoring": "Snoring — relationship destruction, partner rage, kinked airway",
  "sleep-quality": "Sleep Quality — poor rest, fatigue, tossing and turning",
  "auto-detect": "Auto-detect — match the angle to whatever problem the swiped source addresses",
};

/**
 * Build the swiper-specific system prompt using a product brief.
 * Replaces buildSystemPrompt() for the swiper workflow.
 */
export function buildSwiperPrompt(
  productName: string,
  productBrief: string
): string {
  return `You are a senior direct-response copywriter who specialises in health & wellness ecommerce for the Scandinavian market. You rewrite competitor advertorials adapted for our products while preserving the original page's persuasion architecture.

You have deep knowledge of advertorial formats, direct-response copywriting frameworks, and the psychology of health-conscious Scandinavian consumers.

---

${productBrief}

---

## YOUR TASK

You will receive a competitor advertorial as HTML. Your job is to rewrite it so it promotes ${productName} instead, while preserving the EXACT persuasion structure and HTML layout.

### Step 1: Identify the advertorial type

Before rewriting, identify what type of advertorial this is:
- **First-Person / Cashvertorial** — personal story, "I discovered...", testimonial-driven
- **Authority / Science** — expert-authored, studies cited, clinical tone
- **Breaking News / Discovery** — journalistic framing, "New study reveals..."
- **Exposé / Whistleblower** — "What they don't want you to know", insider secrets
- **David vs Goliath** — small innovator vs big industry, "Big Pharma hates this"
- **Reasons Why** — listicle of benefits/arguments
- **Warning Signs** — listicle of symptoms that lead to the product
- **Tops / Product Review** — comparison of products with ours ranked #1
- **Quiz Funnel** — interactive diagnostic leading to product recommendation

Maintain this SAME format in your rewrite. If the source is a first-person story, write a first-person story. If it's an authority piece, write an authority piece.

### Step 2: Match the advertising angle

The rewrite must focus on ONE of these angles:
- **Neck Pain** — morning stiffness, chronic pain, failed treatments
- **Snoring** — relationship destruction, partner rage, kinked airway
- **Sleep Quality** — poor rest, fatigue, tossing and turning

Use the angle specified in the prompt. If none is specified, match the angle to whatever problem the swiped source addresses.

### Step 3: Rewrite rules

**PRESERVE:**
- The EXACT HTML structure (all tags, classes, IDs, attributes)
- The advertorial TYPE and narrative structure
- Persuasion techniques (urgency, social proof, authority, scarcity, risk reversal)
- Section flow and emotional arc (problem → agitation → mechanism → proof → offer → CTA)
- Approximate paragraph lengths and content density
- Image tags — keep ALL <img> tags exactly as they are (images are handled separately)

**REPLACE:**
- All competitor product references → ${productName}
- All competitor brand references → SwedishBalance
- Product claims → use ONLY claims from the product brief (never invent claims)
- Mechanism/how-it-works → use the UMP from the product brief, framed for the selected angle
- Statistics and proof → use ONLY stats from the product brief proof stack
- Testimonials → adapt using testimonial highlights from the brief. Keep names realistic for the target market (Swedish/Scandinavian names)
- Pricing → use actual pricing from the product brief
- Guarantee → use 100-night money-back guarantee
- CTAs → reference ${productName} with appropriate urgency

**ADAPT:**
- Voice and tone → match the brief's voice guidelines (Empathetic Expert)
- Objection handling → use objections and counters from the brief
- Emotional hooks → use VOC language from the relevant angle section
- Competitor mentions → use positioning from the brief
- Cultural references → adapt for Scandinavian market (understated, honest, peer-focused)

**DO NOT:**
- Change the HTML structure or add/remove elements
- Translate to a different language (keep the same language as the source)
- Invent medical claims, statistics, or testimonials not in the brief
- Add emojis or formatting not present in the source
- Remove or modify <img> tags in any way
- Use words like "cure", "treat", or "medical device" (regulatory)
- Make the copy hypey or salesy — Scandinavian audiences reject this

### Step 4: Output

Return ONLY the rewritten HTML body. No explanations, no markdown code fences, no commentary.`;
}

/**
 * Build the swiper user prompt with angle and HTML.
 */
export function buildSwiperUserPrompt(
  bodyHtml: string,
  productName: string,
  angle: SwiperAngle,
  sourceLanguage: string,
  notes?: string
): string {
  const parts = [
    `Rewrite the following competitor advertorial HTML for ${productName}.`,
    ``,
    `**Advertising angle:** ${ANGLE_LABELS[angle]}`,
    `**Source language:** ${sourceLanguage}`,
  ];

  if (notes) {
    parts.push(`**Additional notes:** ${notes}`);
  }

  parts.push(``, `COMPETITOR HTML:`, bodyHtml);

  return parts.join("\n");
}

/**
 * Build a dynamic system prompt from product bank data.
 * Includes product info, copywriting guidelines, and reference page examples.
 */
export function buildSystemPrompt(
  product: ProductFull,
  guidelines: CopywritingGuideline[],
  references: ReferencePage[]
): string {
  const sections: string[] = [];

  // Role
  sections.push(
    `You are a senior direct-response copywriter who specialises in health & wellness ecommerce for the Scandinavian market. You write for ${product.name}.`
  );

  // Product knowledge
  const productInfo: string[] = [];
  productInfo.push(`Product: ${product.name}`);
  if (product.tagline) productInfo.push(`Tagline: ${product.tagline}`);
  if (product.description) productInfo.push(`Description: ${product.description}`);
  if (product.benefits?.length)
    productInfo.push(`Key benefits:\n${product.benefits.map((b) => `- ${b}`).join("\n")}`);
  if (product.usps?.length)
    productInfo.push(`USPs:\n${product.usps.map((u) => `- ${u}`).join("\n")}`);
  if (product.claims?.length)
    productInfo.push(`Claims:\n${product.claims.map((c) => `- ${c}`).join("\n")}`);
  if (product.certifications?.length)
    productInfo.push(`Certifications: ${product.certifications.join(", ")}`);
  if (product.ingredients)
    productInfo.push(`Materials/ingredients: ${product.ingredients}`);
  if (product.target_audience)
    productInfo.push(`Target audience: ${product.target_audience}`);

  sections.push(`## PRODUCT KNOWLEDGE\n${productInfo.join("\n\n")}`);

  // Competitor keywords
  if (product.competitor_keywords?.length) {
    sections.push(
      `## COMPETITOR TERMS TO REPLACE\nWhen you encounter any of these terms in the competitor page, replace them with references to ${product.name}:\n${product.competitor_keywords.map((k) => `- "${k}"`).join("\n")}`
    );
  }

  // Copywriting guidelines
  if (guidelines.length > 0) {
    const guidelineText = guidelines
      .map((g) => `### ${g.name}\n${g.content}`)
      .join("\n\n");
    sections.push(`## COPYWRITING GUIDELINES\n${guidelineText}`);
  }

  // Reference pages
  if (references.length > 0) {
    // Include up to 3 reference pages (to stay within context limits)
    const refs = references.slice(0, 3);
    const refText = refs
      .map(
        (r) =>
          `### ${r.name}${r.notes ? ` (${r.notes})` : ""}\n${r.content.slice(0, 3000)}`
      )
      .join("\n\n---\n\n");
    sections.push(
      `## REFERENCE EXAMPLES\nBelow are examples of copy that represent the ideal style. Match this tone, structure, and persuasion approach:\n\n${refText}`
    );
  }

  return sections.join("\n\n");
}

/**
 * Build system + user prompts for a page rewrite.
 * Extracted so the SSE route can access them without running the full rewrite.
 */
export function buildRewritePrompts(
  bodyHtml: string,
  product: ProductFull,
  guidelines: CopywritingGuideline[],
  references: ReferencePage[],
  sourceLanguage: string = "en",
  angle?: SwiperAngle,
  productBrief?: string
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = productBrief && angle
    ? buildSwiperPrompt(product.name, productBrief)
    : buildSystemPrompt(product, guidelines, references);

  const userPrompt = productBrief && angle
    ? buildSwiperUserPrompt(bodyHtml, product.name, angle, sourceLanguage)
    : `Rewrite the competitor landing page HTML below so it promotes ${product.name} instead.

RULES:
1. Keep the EXACT HTML structure — only change visible text content (headings, paragraphs, buttons, alt text, meta text, etc.)
2. Replace ALL competitor product references with ${product.name} and its actual benefits/claims
3. Adapt the copy to match our product's real benefits and USPs (do not invent claims we don't have)
4. Maintain the same persuasion techniques (urgency, social proof, authority, scarcity, etc.)
5. Keep the same language (${sourceLanguage}) — do NOT translate to another language
6. Update call-to-action text to reference ${product.name}
7. If there are testimonial names, keep them realistic for the target market
8. Return ONLY the rewritten HTML body — no explanations, no markdown code fences

COMPETITOR HTML:
${bodyHtml}`;

  return { systemPrompt, userPrompt };
}

/**
 * Create a streaming Claude rewrite. Returns the Anthropic MessageStream
 * so callers can listen to events and stream progress to the client.
 */
export function createRewriteStream(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
) {
  const client = new Anthropic({ apiKey });
  return client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 64000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
}
