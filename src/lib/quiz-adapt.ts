// src/lib/quiz-adapt.ts
// AI Quiz Adaptation Layer — takes an imported competitor quiz and rewrites
// all copy for a specific product + market while preserving the psychological funnel architecture.
//
// IMPORTANT: Images (SubEl kind="image") are NOT rewritten here. They pass through
// unchanged. A separate UI-driven image-swap step handles them.

import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "./supabase-admin";
import { CORE_KNOWLEDGE } from "./quiz-knowledge";
import type { QuizData, QuizSettings, StepNode } from "@/types/quiz";
import type { ProductFull, CopywritingGuideline, ReferencePage } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdaptChange {
  stepId: string;
  field: string;
  before: string;
  after: string;
}

export interface AdaptResult {
  data: QuizData;
  settings: QuizSettings;
  changes: AdaptChange[];
  warnings: string[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface AdaptOpts {
  data: QuizData;
  settings: QuizSettings;
  productId: string;
  targetMarket: "se" | "dk" | "no";
  userNotes?: string;
}

// Raw shape Claude returns inside its JSON block
interface ClaudeAdaptResponse {
  data: QuizData;
  settings: QuizSettings;
  changes: AdaptChange[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// System prompt builder (exported for unit testing)
// ---------------------------------------------------------------------------

export function buildAdaptSystemPrompt(opts: {
  product: ProductFull;
  guidelines: CopywritingGuideline[];
  references: ReferencePage[];
  targetMarket: "se" | "dk" | "no";
  userNotes?: string;
}): string {
  const { product, guidelines, references, targetMarket, userNotes } = opts;

  const marketLabels: Record<"se" | "dk" | "no", string> = {
    se: "Swedish (sv)",
    dk: "Danish (da)",
    no: "Norwegian Bokmål (no)",
  };

  const sections: string[] = [];

  // 1. Core knowledge base (without teardown lessons to keep tokens reasonable)
  sections.push(CORE_KNOWLEDGE);

  // 2. Product context
  const productLines: string[] = [`## PRODUCT CONTEXT`, `Product: ${product.name}`];
  if (product.tagline) productLines.push(`Tagline: ${product.tagline}`);
  if (product.description) productLines.push(`Description: ${product.description}`);
  if (product.target_audience) productLines.push(`Target avatar: ${product.target_audience}`);
  if (product.benefits?.length)
    productLines.push(`Key benefits:\n${product.benefits.map((b) => `- ${b}`).join("\n")}`);
  if (product.usps?.length)
    productLines.push(`USPs:\n${product.usps.map((u) => `- ${u}`).join("\n")}`);
  if (product.claims?.length)
    productLines.push(`Clinical claims / proof:\n${product.claims.map((c) => `- ${c}`).join("\n")}`);
  if (product.certifications?.length)
    productLines.push(`Certifications: ${product.certifications.join(", ")}`);
  if (product.ingredients)
    productLines.push(`Ingredients / composition: ${product.ingredients}`);
  if (Object.keys(product.price_info ?? {}).length)
    productLines.push(`Pricing info: ${JSON.stringify(product.price_info)}`);
  sections.push(productLines.join("\n\n"));

  // 3. Brand voice guidelines
  if (guidelines.length > 0) {
    const guidelineText = guidelines.map((g) => `### ${g.name}\n${g.content}`).join("\n\n");
    sections.push(`## BRAND VOICE GUIDELINES\n${guidelineText}`);
  }

  // 4. Reference pages (capped at 3 to stay within context)
  if (references.length > 0) {
    const refs = references.slice(0, 3);
    const refText = refs
      .map((r) => `### ${r.name}${r.notes ? ` (${r.notes})` : ""}\n${r.content.slice(0, 2000)}`)
      .join("\n\n---\n\n");
    sections.push(`## REFERENCE COPY EXAMPLES\nMatch tone and persuasion style from these examples:\n\n${refText}`);
  }

  // 5. Market / language rules
  const marketRules: Record<"se" | "dk" | "no", string> = {
    se: [
      "## TARGET MARKET: Sweden (Swedish / sv)",
      "- Write in Swedish (Rikssvenska). Use plain, direct, slightly understated tone.",
      "- Use 'du' form always.",
      "- Avoid hype-y superlatives like 'världens bästa'. Scandinavian readers distrust hype.",
      "- Prefer declarative question phrasing where possible.",
      "- Avoid English loanwords unless they are industry standard (e.g. 'collagen' is fine).",
      "- Names to keep unchanged: Emma, Anna, Ella, Maria, Sara, Ida, Nora, Hanna, Maja, Liv, Erik, Lars, Emil, Oscar, Noah, Oliver, Anton, Axel, Magnus, Karl.",
    ].join("\n"),
    dk: [
      "## TARGET MARKET: Denmark (Danish / da)",
      "- Write in Danish. Use an informal, direct tone — slightly more relaxed than Swedish.",
      "- Use 'du' form always.",
      "- Direct humor is fine. Slightly more aggressive claims are acceptable.",
      "- Avoid English loanwords where a natural Danish alternative exists.",
      "- Names to keep unchanged: same universal Scandinavian list applies.",
    ].join("\n"),
    no: [
      "## TARGET MARKET: Norway (Norwegian Bokmål / no)",
      "- Write in Norwegian Bokmål. Tone similar to Swedish: restrained, direct, honest.",
      "- Use 'du' form always.",
      "- Avoid English loanwords where a natural Norwegian alternative exists.",
      "- Do not use Nynorsk.",
      "- Names to keep unchanged: same universal Scandinavian list applies.",
    ].join("\n"),
  };
  sections.push(marketRules[targetMarket]);

  // 6. User notes (optional steering)
  if (userNotes?.trim()) {
    sections.push(`## ADDITIONAL INSTRUCTIONS FROM THE USER\n${userNotes.trim()}`);
  }

  // 7. Output instructions (reiterate schema clearly)
  sections.push(`## OUTPUT FORMAT

Return ONLY a valid JSON object — no markdown fences, no commentary, no extra text.

The JSON object must match this schema exactly:

{
  "data": { /* full QuizData: nodes, edges, camera, id — unchanged structural keys, rewritten text content */ },
  "settings": { /* full QuizSettings — only metadata.title and metadata.description should change; all colors/fonts unchanged */ },
  "changes": [
    { "stepId": "step_xxx", "field": "subEls[0].text", "before": "...", "after": "..." }
  ],
  "warnings": ["any steps that had no clear product analog and need manual review"]
}

Critical rules:
- Do NOT change any node id, edge id, subEl id, or option id.
- Do NOT rewrite SubEl kind="image" — pass them through with url and alt unchanged.
- Do NOT modify brandColors or fontSettings.
- Set all ExitNode redirectUrl values to "" (empty string).
- Every text rewrite must have a corresponding entry in the "changes" array.
- Write all visible copy in ${marketLabels[targetMarket]}.
- NEVER invent clinical claims, statistics, or testimonials not present in the product context above.`);

  return sections.join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// User message builder (exported for unit testing)
// ---------------------------------------------------------------------------

export function buildAdaptUserMessage(data: QuizData, settings: QuizSettings): string {
  return [
    "Adapt the following imported competitor quiz for the product and market specified in your system prompt.",
    "",
    "Preserve ALL structural keys (node ids, edge ids, subEl ids, option ids, routing logic).",
    "Rewrite ALL visible text (titles, body text, question labels, option labels, insight panels, loading screen text, metadata title/description).",
    "Pass ALL image subEls through unchanged.",
    "Set ALL ExitNode redirectUrl to empty string.",
    "",
    "IMPORTED QUIZ DATA:",
    JSON.stringify({ data, settings }, null, 0),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Response validator
// ---------------------------------------------------------------------------

export function parseAdaptResponse(raw: string): ClaudeAdaptResponse {
  // Claude may occasionally wrap the JSON in a code fence despite instructions.
  // Strip it if present.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse Claude response as JSON: ${err instanceof Error ? err.message : String(err)}. Response preview: ${cleaned.slice(0, 200)}`
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Claude response was not an object");
  }

  const obj = parsed as Record<string, unknown>;

  if (!obj.data || typeof obj.data !== "object") {
    throw new Error("Claude response missing 'data' field");
  }
  if (!obj.settings || typeof obj.settings !== "object") {
    throw new Error("Claude response missing 'settings' field");
  }
  if (!Array.isArray(obj.changes)) {
    throw new Error("Claude response missing 'changes' array");
  }
  if (!Array.isArray(obj.warnings)) {
    throw new Error("Claude response missing 'warnings' array");
  }

  const data = obj.data as QuizData;
  if (!data.nodes || typeof data.nodes !== "object") {
    throw new Error("Claude response data.nodes is missing or invalid");
  }
  if (!data.edges || typeof data.edges !== "object") {
    throw new Error("Claude response data.edges is missing or invalid");
  }

  // Validate changes array entries
  const changes = obj.changes as unknown[];
  for (const c of changes) {
    if (!c || typeof c !== "object") {
      throw new Error("'changes' array contains non-object entry");
    }
    const change = c as Record<string, unknown>;
    if (typeof change.stepId !== "string") throw new Error("change entry missing 'stepId'");
    if (typeof change.field !== "string") throw new Error("change entry missing 'field'");
    if (typeof change.before !== "string") throw new Error("change entry missing 'before'");
    if (typeof change.after !== "string") throw new Error("change entry missing 'after'");
  }

  return {
    data: obj.data as QuizData,
    settings: obj.settings as QuizSettings,
    changes: obj.changes as AdaptChange[],
    warnings: obj.warnings as string[],
  };
}

// ---------------------------------------------------------------------------
// Load product context from Supabase
// ---------------------------------------------------------------------------

async function loadProductContext(productId: string): Promise<{
  product: ProductFull;
  guidelines: CopywritingGuideline[];
  references: ReferencePage[];
}> {
  const db = createServerSupabase();

  // Fetch product
  const { data: productData, error: productError } = await db
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if (productError || !productData) {
    throw new Error(`Product not found: ${productId}${productError ? ` (${productError.message})` : ""}`);
  }

  // Fetch guidelines
  const { data: guidelinesData } = await db
    .from("copywriting_guidelines")
    .select("*")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  // Fetch reference pages
  const { data: referencesData } = await db
    .from("reference_pages")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: true })
    .limit(3);

  return {
    product: productData as ProductFull,
    guidelines: (guidelinesData ?? []) as CopywritingGuideline[],
    references: (referencesData ?? []) as ReferencePage[],
  };
}

// ---------------------------------------------------------------------------
// adaptQuiz — main exported function
// ---------------------------------------------------------------------------

export async function adaptQuiz(opts: AdaptOpts): Promise<AdaptResult> {
  const { data, settings, productId, targetMarket, userNotes } = opts;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");

  // 1. Load product context
  const { product, guidelines, references } = await loadProductContext(productId);

  // 2. Build prompts
  const systemPrompt = buildAdaptSystemPrompt({ product, guidelines, references, targetMarket, userNotes });
  const userMessage = buildAdaptUserMessage(data, settings);

  // 3. Count step nodes for context on complexity
  const stepCount = Object.values(data.nodes).filter((n) => n.kind === "step").length;

  // max_tokens: 16000 base + 400 per step to handle large quizzes
  const maxTokens = Math.min(16000 + stepCount * 400, 32000);

  // 4. Call Claude with prompt caching on the system prompt
  const client = new Anthropic({ apiKey });

  // The system prompt contains CORE_KNOWLEDGE + product context. Both are stable
  // across multiple calls for the same product+market combination, so caching is
  // high-value here. Mark the whole system prompt as ephemeral cache.
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: maxTokens,
    temperature: 0.7,
    system: [
      {
        type: "text",
        text: systemPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic SDK type for cache_control
        cache_control: { type: "ephemeral" } as any,
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  // 5. Extract text response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  // 6. Parse and validate
  const parsed = parseAdaptResponse(textBlock.text);

  // 7. Safety pass: ensure image subEls are not changed
  // If Claude accidentally changed an image URL, restore it from the original.
  const originalImagesByNodeId = new Map<string, Map<string, { url: string; alt: string }>>();
  for (const [nodeId, node] of Object.entries(data.nodes)) {
    if (node.kind !== "step") continue;
    const stepNode = node as StepNode;
    const imgMap = new Map<string, { url: string; alt: string }>();
    for (const el of stepNode.subEls) {
      if (el.kind === "image") {
        imgMap.set(el.id, { url: el.url, alt: el.alt });
      }
    }
    if (imgMap.size > 0) originalImagesByNodeId.set(nodeId, imgMap);
  }

  // Restore any images that were altered
  for (const [nodeId, node] of Object.entries(parsed.data.nodes)) {
    if (node.kind !== "step") continue;
    const imgMap = originalImagesByNodeId.get(nodeId);
    if (!imgMap) continue;
    const stepNode = node as StepNode;
    for (const el of stepNode.subEls) {
      if (el.kind === "image") {
        const original = imgMap.get(el.id);
        if (original) {
          el.url = original.url;
          el.alt = original.alt;
        }
      }
    }
  }

  return {
    data: parsed.data,
    settings: parsed.settings,
    changes: parsed.changes,
    warnings: parsed.warnings,
    usage: { inputTokens, outputTokens },
  };
}
