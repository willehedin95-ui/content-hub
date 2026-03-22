import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001";

// Haiku pricing (per 1M tokens)
const HAIKU_INPUT_COST = 1.0;
const HAIKU_OUTPUT_COST = 5.0;

export interface TranslationReviewResult {
  narrative_issues: string[];
  naturalness_issues: string[];
  grammar_issues: string[];
  fluency_issues: string[];
  context_errors: string[];
  overall_assessment: string;
  review_verdict: "pass" | "review" | "fail";
}

export function calcHaikuCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * HAIKU_INPUT_COST + outputTokens * HAIKU_OUTPUT_COST) / 1_000_000;
}

const LANGUAGE_LABELS: Record<string, string> = {
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
};

/**
 * Review translated ad copy quality using Claude Haiku as a native reader.
 * Evaluates the FINAL translated text — catches narrative, naturalness, and grammar issues
 * regardless of whether they originate from swipe, brainstorm, or translation.
 */
export async function reviewTranslationQuality(
  translatedTexts: string[],
  translatedHeadlines: string[],
  language: string,
  originalTexts: string[],
  conceptName: string,
): Promise<{ result: TranslationReviewResult; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });
  const langLabel = LANGUAGE_LABELS[language] ?? language;

  const allTranslated = [
    ...translatedTexts.map((t, i) => `Primary text ${i + 1}:\n${t}`),
    ...translatedHeadlines.map((h, i) => `Headline ${i + 1}:\n${h}`),
  ].join("\n\n---\n\n");

  const allOriginal = [
    ...originalTexts.map((t, i) => `Original text ${i + 1}:\n${t}`),
  ].join("\n\n---\n\n");

  const prompt = `You are a native ${langLabel} speaker and professional ad copy editor. You are reviewing ad copy that will run as a Meta/Facebook ad in Scandinavia.

Your job is to evaluate the ${langLabel} text below AS IF YOU ARE THE AUDIENCE READING IT FOR THE FIRST TIME. The text must read naturally, make logical sense, and be grammatically correct.

TRANSLATED AD COPY (${langLabel}):
${allTranslated}

ORIGINAL ENGLISH (for context only — your review is of the ${langLabel} text above):
${allOriginal}

Concept name: "${conceptName}"

Evaluate the ${langLabel} text and return a JSON object with these fields:

{
  "narrative_issues": [
    // CRITICAL: List any problems with the story/narrative making sense:
    // - Characters behaving inconsistently (e.g. husband calling wife "Mamma" for no reason)
    // - Relationships that don't make sense (child's voice mixed with adult's actions)
    // - Perspective shifts within the same text (1st person to 3rd person unexpectedly)
    // - Story events that are illogical or contradictory
    // - Emotional tone that doesn't match the situation described
    // Empty array if no issues.
  ],
  "naturalness_issues": [
    // List phrases that sound like machine translation or non-native writing:
    // - Awkward word order that no native speaker would use
    // - Literal translations of English idioms that don't work in ${langLabel}
    // - Unnatural pronoun usage (e.g. "de hade" when referring to a singular pillow — should be "den hade")
    // - Register/formality mismatches (too formal for a Facebook ad, or too casual)
    // - Words that exist but are wrong in this context
    // Empty array if no issues.
  ],
  "grammar_issues": [
    // Definite grammar/spelling errors:
    // - Wrong gender (en/ett in Swedish, en/et in Danish/Norwegian)
    // - Wrong verb conjugation
    // - Spelling mistakes
    // - Missing conditional words (e.g. missing "om" in an if-clause)
    // Empty array if no issues.
  ],
  "fluency_issues": [
    // Minor style preferences that don't block publication:
    // - Could be phrased slightly better
    // - Unusual but not incorrect word choices
    // Empty array if no issues.
  ],
  "context_errors": [
    // CRITICAL translation failures:
    // - English words left untranslated (except brand names: HappySleep, Hydro13, etc.)
    // - Completely wrong meaning (says the opposite)
    // - Wrong target language (Swedish words in Danish text, etc.)
    // Empty array if no issues.
  ],
  "overall_assessment": "1-2 sentence summary of the translation quality from a native reader's perspective.",
  "review_verdict": "pass | review | fail"
}

VERDICT RULES:
- "fail" = has ANY narrative_issues OR context_errors (MUST be fixed before going live — the ad will look broken to readers)
- "review" = has naturalness_issues OR grammar_issues (should be reviewed, may be acceptable but risky)
- "pass" = only fluency_issues or no issues (good to go)

IMPORTANT:
1. Be STRICT about narrative coherence. If the story doesn't make sense to a ${langLabel} reader, that's a fail.
2. Be STRICT about naturalness. If a phrase sounds obviously translated rather than natively written, flag it.
3. The bar for "pass" should be: "Would a native ${langLabel} copywriter approve this for a paid ad?"
4. Write ALL feedback in English so the developer can understand it.
5. Return ONLY the JSON object, no markdown fences or extra text.`;

  const response = await client.messages.create({
    model: CLAUDE_HAIKU_MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  let text = response.content.find((b) => b.type === "text")?.text ?? "";
  // Strip markdown fences (Haiku quirk)
  text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  const result = JSON.parse(text) as TranslationReviewResult;

  // Validate verdict matches the rules (Haiku might disagree with itself)
  const hasNarrative = (result.narrative_issues?.length ?? 0) > 0;
  const hasContext = (result.context_errors?.length ?? 0) > 0;
  const hasNaturalness = (result.naturalness_issues?.length ?? 0) > 0;
  const hasGrammar = (result.grammar_issues?.length ?? 0) > 0;

  if (hasNarrative || hasContext) {
    result.review_verdict = "fail";
  } else if (hasNaturalness || hasGrammar) {
    result.review_verdict = "review";
  } else {
    result.review_verdict = "pass";
  }

  return { result, inputTokens, outputTokens };
}
