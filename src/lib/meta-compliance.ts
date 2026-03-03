import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { CLAUDE_MODEL, OPENAI_MODEL } from "./constants";
import { calcClaudeCost, calcOpenAICost } from "./pricing";
import type {
  ComplianceResult,
  ComplianceTextResult,
  ComplianceImageResult,
  ComplianceIssue,
} from "@/types";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const TEXT_COMPLIANCE_SYSTEM_PROMPT = `You are a Meta Ads compliance reviewer specialising in health and wellness supplement advertising for Scandinavian markets (Sweden, Norway, Denmark).

## CALIBRATION

The products you are reviewing are legitimate health and wellness supplements (pillows, hydration products) sold through established ecommerce stores. They are NOT scams or miracle cures. Your job is to catch the specific phrasings that Meta's automated review systems flag — not to reject good ads.

**Only flag what would ACTUALLY get rejected by Meta. When in doubt, PASS.**

## RULES TO CHECK

### Rule 1: Personal Attributes (HIGH RISK)
Meta prohibits ads that assert or imply knowledge of a user's personal attributes, including direct or indirect assertions about their body, health, or medical condition using "you/your" combined with a negative body state.

**Violations:**
- "Your back pain is ruining your sleep"
- "Are you struggling with neck stiffness?"
- "If your snoring is keeping your partner awake"
- "You deserve better sleep — stop suffering from insomnia"
- "Your body needs proper hydration"
- "Tired of your aching joints?"

**Compliant alternatives:**
- "Many people struggle with back pain at night"
- "Neck stiffness can ruin a good night's sleep"
- "Snoring doesn't have to be a nightly battle"
- "Designed for people who want deeper, more restful sleep"
- "Proper hydration supports overall wellness"
- "A pillow engineered for comfort and support"

### Rule 2: Negative Self-Imagery (MEDIUM RISK)
Ads must not make the viewer feel bad about themselves. Content should frame things positively — what they gain, not what's wrong with them.

**Violations:**
- "Stop feeling exhausted every morning"
- "Don't let poor sleep destroy your health"

**Compliant alternatives:**
- "Wake up feeling refreshed and energised"
- "Support your health with better sleep"

### Rule 3: False Promises (MEDIUM RISK)
Ads must not make absolute guarantees about results. Use hedging language ("may help", "designed to", "can support").

**Violations:**
- "This pillow WILL fix your neck pain"
- "Guaranteed to stop snoring"
- "Eliminates back pain permanently"

**Compliant alternatives:**
- "Designed to support healthy neck alignment"
- "May help reduce snoring by improving sleep posture"
- "Engineered to relieve pressure on the back"

### Rule 4: FTC Weight Loss Red Flags (HIGH RISK)
Even for non-weight-loss products, avoid patterns that trigger Meta's weight-loss content filters: specific timeframes for body changes, dramatic transformation language, or unrealistic claims.

**Violations:**
- "Lose 10 kg in 2 weeks"
- "Transform your body in 30 days"
- "Before and after just 1 week of use"

**Compliant alternatives:**
- "Supports a healthy lifestyle"
- "Part of your daily wellness routine"

### Rule 5: Testimonials (LOW RISK)
Testimonials must reflect typical user experience. Avoid extreme outlier claims.

**Violations:**
- "I went from 4 hours of sleep to 9 hours overnight!"
- "My chronic 20-year back pain vanished after one night"

**Compliant alternatives:**
- "I've noticed a real improvement in my sleep quality"
- "My neck feels much better since switching to this pillow"

### Rule 6: Medical Claims (HIGH RISK)
Never use words like "cure", "treat", "diagnose", "prescription", or "medical device". Products are wellness/lifestyle, not medical.

**Violations:**
- "Treats chronic insomnia"
- "Clinically proven to cure snoring"
- "A medical-grade solution for sleep apnea"

**Compliant alternatives:**
- "Supports restful sleep"
- "Designed with sleep comfort in mind"
- "Premium sleep technology"

## RESPONSE FORMAT

Return a JSON array. One object per text variant analysed. Use this exact structure:

\`\`\`json
[
  {
    "text": "<the exact text analysed>",
    "type": "<primary or headline>",
    "verdict": "PASS | WARNING | REJECT",
    "issues": [
      {
        "rule": "<rule name, e.g. Personal Attributes>",
        "detail": "<what specifically triggers the rule>",
        "suggestion": "<a compliant rewrite>"
      }
    ]
  }
]
\`\`\`

## VERDICT GUIDELINES

- **REJECT** — Clear, unambiguous violation that WILL get the ad rejected (e.g. "Your back pain", "cures insomnia")
- **WARNING** — Borderline phrasing that MIGHT get flagged depending on reviewer (e.g. mild personal attribute, slightly strong claim)
- **PASS** — No issues, or issues so minor they would never trigger a rejection

Return ONLY the JSON array. No markdown fences, no commentary outside the JSON.`;

const IMAGE_COMPLIANCE_SYSTEM_PROMPT = `You are a Meta Ads image compliance reviewer for health and wellness product advertising.

## RULES

Flag images that contain:
1. **Before/After compositions** — split images showing body transformation, side-by-side weight comparisons
2. **Body imperfection close-ups** — zoomed-in shots of cellulite, acne, wrinkles, stretch marks used to shame
3. **Unrealistic transformations** — digitally altered bodies, impossibly dramatic changes
4. **Excessive nudity** — exposed intimate areas beyond what's typical for health/fitness advertising
5. **Scales or measuring tape as focal point** — weighing scales, tape measures, or body measurements as the central element
6. **Distressed person as focal point** — person crying, in visible anguish, or looking deeply unhappy as the primary subject (mild discomfort for context is fine)

## WHAT IS FINE (DO NOT FLAG)

- Happy, healthy people using the product
- Product shots (pillows, supplements, packaging)
- People exercising or doing yoga
- Text overlays with marketing copy
- Editorial-style lifestyle photography
- People sleeping comfortably
- Neutral or positive facial expressions
- Before/after of the PRODUCT (not bodies)

## CALIBRATION

Most static ad images for health/wellness products are compliant. Only flag genuinely problematic content that would cause Meta to reject the ad. When in doubt, PASS.

## RESPONSE FORMAT

Return JSON with this exact structure:

\`\`\`json
{
  "verdict": "PASS | WARNING",
  "issues": [
    {
      "rule": "<rule name>",
      "detail": "<what specifically is problematic>",
      "suggestion": "<how to fix it>"
    }
  ]
}
\`\`\`

If the image is compliant, return:
\`\`\`json
{
  "verdict": "PASS",
  "issues": []
}
\`\`\`

Return ONLY the JSON object. No markdown fences, no commentary.`;

// ---------------------------------------------------------------------------
// Text compliance analysis (Claude)
// ---------------------------------------------------------------------------

interface TextAnalysisResult {
  results: ComplianceTextResult[];
  summary: string;
  inputTokens: number;
  outputTokens: number;
}

export async function analyzeTextCompliance(
  primaryTexts: string[],
  headlines: string[]
): Promise<TextAnalysisResult> {
  const client = getAnthropicClient();

  const filteredPrimary = primaryTexts.filter((t) => t.trim().length > 0);
  const filteredHeadlines = headlines.filter((t) => t.trim().length > 0);

  if (filteredPrimary.length === 0 && filteredHeadlines.length === 0) {
    return { results: [], summary: "No text to analyse.", inputTokens: 0, outputTokens: 0 };
  }

  // Build user message listing all text variants
  const textLines: string[] = [];
  for (const text of filteredPrimary) {
    textLines.push(`[primary] ${text}`);
  }
  for (const text of filteredHeadlines) {
    textLines.push(`[headline] ${text}`);
  }

  const userMessage = `Analyse the following ad text variants for Meta Ads compliance. Each line is prefixed with its type (primary or headline).\n\n${textLines.join("\n\n")}`;

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: TEXT_COMPLIANCE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  // Extract text content from response
  const rawContent = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Parse JSON — handle possible markdown code block wrapping
  let jsonStr = rawContent.trim();
  if (jsonStr.startsWith("```")) {
    // Strip ```json ... ``` or ``` ... ```
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```$/, "");
  }

  let parsed: ComplianceTextResult[];
  try {
    parsed = JSON.parse(jsonStr) as ComplianceTextResult[];
  } catch {
    // If parsing fails, return a single WARNING with the raw response
    console.error("Failed to parse compliance text response:", rawContent);
    parsed = [];
  }

  // Ensure each result has all required fields
  const results: ComplianceTextResult[] = parsed.map((r) => ({
    text: r.text ?? "",
    type: r.type === "headline" ? "headline" : "primary",
    verdict: (["PASS", "WARNING", "REJECT"].includes(r.verdict) ? r.verdict : "PASS") as
      | "PASS"
      | "WARNING"
      | "REJECT",
    issues: (r.issues ?? []).map((issue: ComplianceIssue) => ({
      rule: issue.rule ?? "Unknown",
      detail: issue.detail ?? "",
      suggestion: issue.suggestion,
    })),
  }));

  // Build summary
  const rejectCount = results.filter((r) => r.verdict === "REJECT").length;
  const warningCount = results.filter((r) => r.verdict === "WARNING").length;
  const passCount = results.filter((r) => r.verdict === "PASS").length;
  const total = results.length;

  let summary: string;
  if (rejectCount > 0) {
    summary = `${rejectCount} of ${total} text variants flagged for rejection. ${warningCount} warnings. Review issues before submitting.`;
  } else if (warningCount > 0) {
    summary = `All ${total} text variants pass, but ${warningCount} have warnings worth reviewing.`;
  } else {
    summary = `All ${passCount} text variants pass compliance checks.`;
  }

  return { results, summary, inputTokens, outputTokens };
}

// ---------------------------------------------------------------------------
// Image compliance analysis (GPT-4o vision)
// ---------------------------------------------------------------------------

interface ImageAnalysisResult {
  results: ComplianceImageResult[];
  inputTokens: number;
  outputTokens: number;
}

async function analyzeOneImage(
  openai: OpenAI,
  imageUrl: string
): Promise<{
  result: ComplianceImageResult;
  inputTokens: number;
  outputTokens: number;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: IMAGE_COMPLIANCE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyse this ad image for Meta Ads compliance.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "low" },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        result: { image_url: imageUrl, verdict: "PASS", issues: [] },
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
    }

    const parsed = JSON.parse(content) as {
      verdict?: string;
      issues?: ComplianceIssue[];
    };

    const verdict: "PASS" | "WARNING" =
      parsed.verdict === "WARNING" ? "WARNING" : "PASS";

    const issues: ComplianceIssue[] = (parsed.issues ?? []).map((issue) => ({
      rule: issue.rule ?? "Unknown",
      detail: issue.detail ?? "",
      suggestion: issue.suggestion,
    }));

    return {
      result: { image_url: imageUrl, verdict, issues },
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  } catch (error) {
    // On error, default to PASS — don't block on analysis failure
    console.error(`Image compliance analysis failed for ${imageUrl}:`, error);
    return {
      result: { image_url: imageUrl, verdict: "PASS", issues: [] },
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

export async function analyzeImageCompliance(
  imageUrls: string[]
): Promise<ImageAnalysisResult> {
  if (imageUrls.length === 0) {
    return { results: [], inputTokens: 0, outputTokens: 0 };
  }

  const openai = getOpenAIClient();

  const analyses = await Promise.all(
    imageUrls.map((url) => analyzeOneImage(openai, url))
  );

  const results = analyses.map((a) => a.result);
  const inputTokens = analyses.reduce((sum, a) => sum + a.inputTokens, 0);
  const outputTokens = analyses.reduce((sum, a) => sum + a.outputTokens, 0);

  return { results, inputTokens, outputTokens };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

interface ComplianceCheckResult {
  result: ComplianceResult;
  cost: {
    claudeCost: number;
    openaiCost: number;
    totalCost: number;
  };
  tokens: {
    claudeInput: number;
    claudeOutput: number;
    openaiInput: number;
    openaiOutput: number;
  };
}

export async function runComplianceCheck(params: {
  primaryTexts: string[];
  headlines: string[];
  imageUrls: string[];
}): Promise<ComplianceCheckResult> {
  const { primaryTexts, headlines, imageUrls } = params;

  // Run text and image analysis in parallel
  const [textAnalysis, imageAnalysis] = await Promise.all([
    analyzeTextCompliance(primaryTexts, headlines),
    analyzeImageCompliance(imageUrls),
  ]);

  // Determine overall verdict: REJECT > WARNING > PASS
  const textVerdicts = textAnalysis.results.map((r) => r.verdict);
  const imageVerdicts = imageAnalysis.results.map((r) => r.verdict);
  const allVerdicts = [...textVerdicts, ...imageVerdicts];

  let overallVerdict: "PASS" | "WARNING" | "REJECT" = "PASS";
  if (allVerdicts.includes("REJECT")) {
    overallVerdict = "REJECT";
  } else if (allVerdicts.includes("WARNING")) {
    overallVerdict = "WARNING";
  }

  // Build summary
  let summary = textAnalysis.summary;
  if (imageAnalysis.results.length > 0) {
    const imgWarnings = imageAnalysis.results.filter((r) => r.verdict === "WARNING").length;
    if (imgWarnings > 0) {
      summary += ` ${imgWarnings} image(s) flagged with warnings.`;
    }
  }

  const result: ComplianceResult = {
    overall_verdict: overallVerdict,
    text_results: textAnalysis.results,
    image_results: imageAnalysis.results,
    summary,
    checked_at: new Date().toISOString(),
  };

  // Calculate costs
  const claudeCost = calcClaudeCost(textAnalysis.inputTokens, textAnalysis.outputTokens);
  const openaiCost = calcOpenAICost(imageAnalysis.inputTokens, imageAnalysis.outputTokens);

  return {
    result,
    cost: {
      claudeCost,
      openaiCost,
      totalCost: claudeCost + openaiCost,
    },
    tokens: {
      claudeInput: textAnalysis.inputTokens,
      claudeOutput: textAnalysis.outputTokens,
      openaiInput: imageAnalysis.inputTokens,
      openaiOutput: imageAnalysis.outputTokens,
    },
  };
}
