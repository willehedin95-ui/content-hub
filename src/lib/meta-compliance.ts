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

const TEXT_COMPLIANCE_SYSTEM_PROMPT = `You are a Meta Ads compliance reviewer for health/wellness products (pillows, hydration) in Scandinavian markets. Your job is to catch ONLY the specific phrasings that actually get ads rejected — not to be a paranoid lawyer.

## YOUR BIAS MUST BE TOWARD PASSING

Most ad copy is compliant. You should PASS the vast majority of texts. Only flag something if you are genuinely confident it would get rejected by Meta's automated review. If you're unsure, PASS.

Think of it this way: a false positive (flagging good copy) costs the advertiser time and money rewriting copy that was fine. A false negative (missing bad copy) means one ad gets rejected and can be fixed. False positives are MORE costly than false negatives. Err on the side of passing.

## THE ONE RULE THAT ACTUALLY MATTERS

**Personal Attributes** is the #1 reason health ads get rejected. But it's VERY specific:

The violation is: "you/your" + NEGATIVE BODY/HEALTH STATE. That's it. Meta's system looks for ads that assert or imply they know the viewer has a specific problem.

**ACTUALLY GETS REJECTED:**
- "Your back pain" / "your neck pain" / "your insomnia" (asserts viewer has this condition)
- "Are you suffering from..." / "If you're struggling with..." (implies viewer has condition)
- "Your body is holding onto fat" (asserts body state)
- "Tired of your aching joints?" (asserts viewer has aching joints)

**DOES NOT GET REJECTED (do NOT flag these):**
- "Your pillow" / "Your mattress" / "Your old pillow" (refers to a PRODUCT, not body)
- "Your expensive pillow failed you" (about product experience, not health)
- "Want no more neck pain?" (general desire framing, no personal assertion)
- "No neck pain, must be a fluke" (testimonial/narrative voice, not addressing viewer)
- "Do this now" / "Try this" / "Here's what works" (normal CTA language)
- "What if you could sleep better?" (aspirational, not asserting current state)
- "You deserve better sleep" (positive framing, not asserting problem)
- "Designed for you" / "Made for people like you" (standard marketing)
- First-person testimonial narratives ("I couldn't believe it", "My neck feels amazing")

## OTHER RULES (lower priority)

**False Promises** — Only flag ABSOLUTE health outcome guarantees:
- FLAG: "WILL cure your insomnia", "Guaranteed to eliminate pain forever", "100% effective for everyone"
- DO NOT FLAG: Money-back guarantees ("Full refund if not satisfied", "100 nights to decide")
- DO NOT FLAG: Competitive claims ("This one won't let you down", "Unlike other pillows")
- DO NOT FLAG: Confident product claims ("The last pillow you'll ever need", "This changes everything")
- DO NOT FLAG: Testimonial outcomes ("No neck pain. Must be a fluke." — this is narrative)

**Medical Claims** — Only flag actual medical terminology:
- FLAG: "cures", "treats", "diagnoses", "prescription", "FDA approved" (when not actually approved), "medical device"
- DO NOT FLAG: "supports", "helps", "promotes", "designed for", "engineered to"

**Negative Self-Imagery** — Only flag genuinely shaming language:
- FLAG: "Sick of your ugly body?", "Stop being fat and tired"
- DO NOT FLAG: "Tired of bad sleep?", "Want to wake up refreshed?", normal problem-solution framing

**Weight Loss Red Flags** — Only relevant if the ad actually makes weight/body transformation claims.

## VERDICT GUIDELINES

- **REJECT** — ONLY for clear "you/your" + negative health state, or actual medical claims like "cures/treats". Must be unambiguous.
- **WARNING** — Borderline personal attributes that could go either way. Use sparingly.
- **PASS** — Everything else. This should be 80%+ of your verdicts.

When reviewing, ask yourself: "Would a real Meta reviewer actually reject this specific ad?" If the answer is "probably not", then PASS.

## RESPONSE FORMAT

Return a JSON array. One object per text variant:

[
  {
    "text": "<exact text>",
    "type": "<primary or headline>",
    "verdict": "PASS | WARNING | REJECT",
    "issues": [
      {
        "rule": "<rule name>",
        "detail": "<what specifically triggers it>",
        "suggestion": "<compliant rewrite>"
      }
    ]
  }
]

Return ONLY the JSON array. No markdown, no commentary.`;

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
