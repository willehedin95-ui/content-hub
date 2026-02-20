import OpenAI from "openai";
import { QualityAnalysis } from "@/types";
import { OPENAI_MODEL } from "./constants";

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

/**
 * Analyze the quality of a translated image by comparing it to the original
 * using GPT-4o vision.
 */
export async function analyzeTranslationQuality(
  originalImageUrl: string,
  translatedImageUrl: string,
  targetLanguage: string
): Promise<{ analysis: QualityAnalysis; inputTokens: number; outputTokens: number }> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: 800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Compare an English ad image with its ${targetLanguage} translation. Return JSON:
{"quality_score":<0-100>,"spelling_errors":[],"grammar_issues":[],"missing_text":[],"overall_assessment":"<1-2 sentences>","extracted_text":"<all visible text in translated image>"}

Scoring: 90-100 perfect, 70-89 minor issues, 50-69 noticeable problems, 0-49 major errors. Be strict — one misspelled word reduces score.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Image 1: English original. Image 2: ${targetLanguage} translation. Evaluate quality.`,
          },
          {
            type: "image_url",
            image_url: { url: originalImageUrl, detail: "high" },
          },
          {
            type: "image_url",
            image_url: { url: translatedImageUrl, detail: "high" },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from quality analysis");
  }

  let parsed: QualityAnalysis;
  try {
    parsed = JSON.parse(content) as QualityAnalysis;
  } catch {
    throw new Error("Quality analysis returned invalid JSON");
  }

  // Ensure all fields exist with defaults
  const analysis: QualityAnalysis = {
    quality_score: parsed.quality_score ?? 0,
    spelling_errors: parsed.spelling_errors ?? [],
    grammar_issues: parsed.grammar_issues ?? [],
    missing_text: parsed.missing_text ?? [],
    overall_assessment: parsed.overall_assessment ?? "",
    extracted_text: parsed.extracted_text ?? "",
  };

  return {
    analysis,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

/**
 * Build a corrective prompt from quality analysis results.
 * Used for auto-retry when quality is below threshold.
 */
export function buildCorrectionPrompt(analysis: QualityAnalysis): {
  corrected_text: string;
  visual_instructions: string;
} {
  const corrections: string[] = [];

  if (analysis.spelling_errors.length > 0) {
    corrections.push(`Fix spelling errors: ${analysis.spelling_errors.join(", ")}`);
  }
  if (analysis.grammar_issues.length > 0) {
    corrections.push(`Fix grammar: ${analysis.grammar_issues.join(", ")}`);
  }
  if (analysis.missing_text.length > 0) {
    corrections.push(`Include missing text: ${analysis.missing_text.join(", ")}`);
  }

  const corrected_text = analysis.extracted_text
    ? `The translated text should read: ${analysis.extracted_text}\n${corrections.join("\n")}`
    : corrections.join("\n");

  const visual_instructions = [
    analysis.overall_assessment,
    corrections.length > 0 ? `Please correct these issues: ${corrections.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { corrected_text, visual_instructions };
}
