/**
 * AI evaluation pipeline for research nuggets.
 *
 * Uses Claude Haiku to evaluate each review/comment, extracting:
 * - sentiment, significance, tags, customer phrases, pain points, desires, summary
 *
 * Only nuggets with significance >= 4 are considered worth storing.
 */

import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001";

// Haiku pricing (per 1M tokens)
const HAIKU_INPUT_COST = 1.0;
const HAIKU_OUTPUT_COST = 5.0;

const NORDIC_LANGUAGES = new Set(["sv", "da", "no", "nb", "nn", "fi", "is"]);

export interface NuggetEvaluation {
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  significance: number; // 1-10
  tags: string[];
  customer_phrases: string[]; // exact quotes worth reusing in ad copy
  pain_points: string[];
  desires: string[];
  summary: string;
}

export interface EvaluationResult {
  evaluation: NuggetEvaluation;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Determine market relevance tier from review language.
 * Nordic = "primary" (direct ammunition for copy), everything else = "reference".
 */
export function getMarketRelevance(language: string): "primary" | "reference" {
  return NORDIC_LANGUAGES.has(language) ? "primary" : "reference";
}

/**
 * Evaluate a single review using Claude Haiku.
 */
export async function evaluateReview(review: {
  text: string;
  title?: string | null;
  stars: number;
  language: string;
  competitorName: string;
}): Promise<EvaluationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });

  const reviewContent = [
    review.title ? `Title: ${review.title}` : "",
    `Rating: ${review.stars}/5`,
    `Language: ${review.language}`,
    `Brand reviewed: ${review.competitorName}`,
    `Review text: ${review.text}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: CLAUDE_HAIKU_MODEL,
    max_tokens: 400,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: `You are analyzing a customer review of a collagen/beauty supplement brand. Extract insights useful for a COMPETING brand's marketing.

${reviewContent}

Return JSON (no markdown fences):
{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "significance": 1-10,
  "tags": ["tag1", "tag2"],
  "customer_phrases": ["exact quote 1", "exact quote 2"],
  "pain_points": ["pain point 1"],
  "desires": ["desire 1"],
  "summary": "One-line insight"
}

SIGNIFICANCE SCALE:
- 8-10: Contains exact phrases usable in ad hooks, reveals deep emotions, exposes specific competitor weakness, or describes vivid before/after transformation. GOLD for copywriters.
- 5-7: Useful insight about customer psychology, general pain point, or product feedback. Good context but not directly quotable.
- 1-4: Generic ("good product", "fast delivery"), no emotional depth, nothing a copywriter can use. Basic satisfaction/dissatisfaction.

TAGS — use lowercase, pick all that apply:
skepticism, results_visible, no_results, skin, hair, nails, joints, aging, wrinkles, competitor_switch, price_concern, taste, absorption, dosage, subscription_issue, delivery, before_after, emotional_transformation, confidence, self_image, natural_alternative, routine, long_term_use, gift, recommendation

CUSTOMER_PHRASES — extract the exact words/sentences that a copywriter could use verbatim in ads. These must be direct quotes from the review, in the original language. Only include phrases with emotional punch or vivid imagery. If none qualify, return empty array.

PAIN_POINTS — what problems, frustrations, or fears does the reviewer mention? In English.

DESIRES — what outcomes, wishes, or goals does the reviewer describe? In English.`,
      },
    ],
  });

  const raw =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Haiku sometimes wraps JSON in markdown fences or adds notes after the JSON.
  // Strategy: strip fences, then extract the first valid JSON object.
  let cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  // If there's text after the closing brace, extract just the JSON object
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace >= 0) {
    let depth = 0;
    let lastBrace = -1;
    for (let i = firstBrace; i < cleaned.length; i++) {
      if (cleaned[i] === "{") depth++;
      else if (cleaned[i] === "}") {
        depth--;
        if (depth === 0) {
          lastBrace = i;
          break;
        }
      }
    }
    if (lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd =
    (inputTokens * HAIKU_INPUT_COST + outputTokens * HAIKU_OUTPUT_COST) /
    1_000_000;

  try {
    const parsed = JSON.parse(cleaned) as NuggetEvaluation;
    return {
      evaluation: {
        sentiment: parsed.sentiment ?? "neutral",
        significance: Math.max(1, Math.min(10, parsed.significance ?? 5)),
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        customer_phrases: Array.isArray(parsed.customer_phrases)
          ? parsed.customer_phrases
          : [],
        pain_points: Array.isArray(parsed.pain_points)
          ? parsed.pain_points
          : [],
        desires: Array.isArray(parsed.desires) ? parsed.desires : [],
        summary: parsed.summary ?? "",
      },
      inputTokens,
      outputTokens,
      costUsd,
    };
  } catch {
    // If JSON parsing fails, return a minimal evaluation
    console.error("Failed to parse Haiku evaluation response:", cleaned);
    return {
      evaluation: {
        sentiment: "neutral",
        significance: 3,
        tags: [],
        customer_phrases: [],
        pain_points: [],
        desires: [],
        summary: "Evaluation parse error",
      },
      inputTokens,
      outputTokens,
      costUsd,
    };
  }
}

/**
 * Evaluate a batch of reviews, with optional delay between calls.
 * Returns only nuggets meeting the significance threshold.
 */
export async function evaluateBatch(
  reviews: Array<{
    text: string;
    title?: string | null;
    stars: number;
    language: string;
    competitorName: string;
  }>,
  opts?: { minSignificance?: number; delayMs?: number }
): Promise<
  Array<{
    index: number;
    evaluation: NuggetEvaluation;
    costUsd: number;
  }>
> {
  const minSig = opts?.minSignificance ?? 4;
  const delayMs = opts?.delayMs ?? 200; // 200ms between Haiku calls
  const results: Array<{
    index: number;
    evaluation: NuggetEvaluation;
    costUsd: number;
  }> = [];

  for (let i = 0; i < reviews.length; i++) {
    if (i > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    try {
      const result = await evaluateReview(reviews[i]);
      if (result.evaluation.significance >= minSig) {
        results.push({
          index: i,
          evaluation: result.evaluation,
          costUsd: result.costUsd,
        });
      }
    } catch (e) {
      console.error(`Failed to evaluate review ${i}:`, e);
    }
  }

  return results;
}
