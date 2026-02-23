import Anthropic from "@anthropic-ai/sdk";
import type { ProductFull, CopywritingGuideline, ReferencePage } from "@/types";
import { withRetry, isTransientError } from "./retry";
import { CLAUDE_MODEL } from "./constants";

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
 * Rewrite competitor HTML body for a target product using Claude.
 * Keeps the HTML structure intact — only changes text content.
 */
export async function rewritePageForProduct(
  bodyHtml: string,
  product: ProductFull,
  guidelines: CopywritingGuideline[],
  references: ReferencePage[],
  apiKey: string,
  sourceLanguage: string = "en"
): Promise<{
  result: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const client = new Anthropic({ apiKey });
  const systemPrompt = buildSystemPrompt(product, guidelines, references);

  const userPrompt = `Rewrite the competitor landing page HTML below so it promotes ${product.name} instead.

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

  const response = await withRetry(
    async () =>
      client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    { maxAttempts: 3, isRetryable: isTransientError }
  );

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  return {
    result: text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
