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

  const prompt = `You are a native ${langLabel} speaker reviewing ad copy for a Meta/Facebook ad in Scandinavia.

Your job: check if a native ${langLabel} reader would understand the text and not be confused. This is AD COPY, not literary prose — it can be dramatic, use borrowed idioms, and have a casual or journalistic tone. That's normal and expected.

TRANSLATED AD COPY (${langLabel}):
${allTranslated}

ORIGINAL ENGLISH (for reference):
${allOriginal}

Concept name: "${conceptName}"

Return a JSON object:

{
  "narrative_issues": [
    // ONLY flag if a reader would genuinely be CONFUSED by the story:
    // - A character is called by two different names with no explanation
    // - Perspective switches mid-sentence (1st person suddenly becomes 3rd person)
    // - An event directly contradicts something stated 1-2 sentences earlier in the SAME text
    // DO NOT flag: rhetorical techniques, dramatic license, conspiracy-style narrative tension,
    // or logical gaps that exist in the original English (those are not translation issues)
    // Empty array if no issues.
  ],
  "naturalness_issues": [
    // ONLY flag if the phrasing is SO unnatural that it would make a reader stop and re-read:
    // - Word order that is grammatically wrong (not just unusual)
    // - Idioms that genuinely don't exist in ${langLabel} and would confuse readers
    // DO NOT flag: borrowed idioms that are commonly used (e.g. "fra radaren" in Norwegian),
    // slightly formal register, stylistic choices, or phrasing you'd personally write differently.
    // The question is NOT "would a copywriter write it this way?" but "would a reader be confused?"
    // Empty array if no issues.
  ],
  "grammar_issues": [
    // Actual grammar/spelling errors only:
    // - Wrong gender (en/ett, en/et)
    // - Misspelled words
    // - Broken sentence structure
    // DO NOT flag: stylistic comma usage, "could be smoother" suggestions, or word choices
    // that are correct but not your personal preference.
    // Empty array if no issues.
  ],
  "fluency_issues": [
    // Optional style notes (these never affect the verdict):
    // - Suggestions that would improve the text but aren't necessary
    // Empty array if no issues.
  ],
  "context_errors": [
    // Actual translation failures:
    // - English words left untranslated (except brand names)
    // - Meaning is completely wrong (says the opposite of the original)
    // - Wrong language used (Swedish words in Danish text)
    // Empty array if no issues.
  ],
  "overall_assessment": "1-2 sentence summary.",
  "review_verdict": "pass | review | fail"
}

VERDICT RULES:
- "fail" = context_errors exist (wrong language, wrong meaning, untranslated text)
- "review" = narrative_issues that would genuinely confuse readers, OR grammar errors
- "pass" = everything else (naturalness notes, fluency suggestions, stylistic preferences)

KEY PRINCIPLE: This is a Facebook ad, not a newspaper article. The bar is "would a native reader understand this and keep reading?" — NOT "would a professional copywriter write it identically?" Most translations are good enough. Only flag things that would actually hurt ad performance.

Write all feedback in English. Return ONLY the JSON object, no markdown fences.`;

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
  const hasGrammar = (result.grammar_issues?.length ?? 0) > 0;

  if (hasContext) {
    result.review_verdict = "fail";
  } else if (hasNarrative || hasGrammar) {
    result.review_verdict = "review";
  } else {
    result.review_verdict = "pass";
  }

  return { result, inputTokens, outputTokens };
}
