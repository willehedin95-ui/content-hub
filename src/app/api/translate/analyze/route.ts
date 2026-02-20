import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { extractReadableText } from "@/lib/html-parser";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";
import { LANGUAGES } from "@/types";
import OpenAI from "openai";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { translation_id, previous_context } = (await req.json()) as {
    translation_id: string;
    previous_context?: {
      applied_corrections: { find: string; replace: string }[];
      previous_score: number;
      previous_issues: {
        fluency_issues: string[];
        grammar_issues: string[];
        context_errors: string[];
      };
    };
  };

  if (!translation_id) {
    return NextResponse.json(
      { error: "translation_id is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    );
  }

  const db = createServerSupabase();

  // Fetch translation + parent page
  const { data: translation, error: tError } = await db
    .from("translations")
    .select("*, pages!inner(original_html)")
    .eq("id", translation_id)
    .single();

  if (tError || !translation) {
    return NextResponse.json(
      { error: "Translation not found" },
      { status: 404 }
    );
  }

  if (!translation.translated_html) {
    return NextResponse.json(
      { error: "No translated HTML to analyze" },
      { status: 400 }
    );
  }

  try {
    const startTime = Date.now();

    const originalText = extractReadableText(translation.pages.original_html);
    const translatedText = extractReadableText(translation.translated_html);

    const langLabel =
      LANGUAGES.find((l) => l.value === translation.language)?.label ??
      translation.language;

    const openai = new OpenAI({ apiKey });

    let systemPrompt = `You are a senior quality analyst for translated web pages. You evaluate ${langLabel} translations of English landing pages.

Your job is to evaluate how natural and fluent the FULL translated page reads as a whole — it should read as if ORIGINALLY WRITTEN in ${langLabel}.

PROTECTED BRAND NAMES — these must NEVER be translated or flagged as issues:
HappySleep, Hydro13, SwedishBalance, Nordic Cradle, HappySleep Ergo, Hälsobladet, OEKO-TEX, CertiPUR-US, Trustpilot, CPAP.
These are brand names, product names, company names, or technical terms. Do NOT suggest corrections for them.

PERSON NAMES — character names should be KEPT EXACTLY as they appear in the original English source. They are pre-selected universal Nordic names. Do NOT flag them as issues or suggest renaming them. If a name was CHANGED from the original (e.g. "Ella" in English became "Emma" in the translation), flag that as a context error.

Respond with JSON:
{
  "quality_score": <0-100>,
  "fluency_issues": ["<short description of issue>", ...],
  "grammar_issues": ["<short description of issue>", ...],
  "context_errors": ["<short description of issue>", ...],
  "name_localization": ["<person name that was CHANGED from the original>", ...],
  "overall_assessment": "<2-3 sentence summary>",
  "suggested_corrections": [
    {"find": "exact visible text to fix", "replace": "corrected ${langLabel} text"},
    ...
  ]
}

CRITICAL — "suggested_corrections" is the most important field:
- For EVERY issue you identify (fluency, grammar, context, changed names), include a correction.
- "find" = the VISIBLE TEXT exactly as it appears to a reader (no HTML tags, no markup).
- "replace" = the corrected ${langLabel} text.
- Include ALL corrections needed — don't limit yourself to a few. Fix everything.
- For compound words split by spaces (e.g. "Mun tejp"), correct to proper form ("muntejp").
- If a character name was CHANGED from the original, correct it back to the original name.
- For unnatural phrases or literal calques, provide a natural ${langLabel} alternative.
- Each correction applies to ALL occurrences on the page automatically.

name_localization: Only include person names that were INCORRECTLY CHANGED from the English original. Do NOT include names that were kept the same. Do NOT include brand names.

Scoring guide:
- 90-100: Reads naturally as native ${langLabel} content. No grammar errors. Character names match the original.
- 75-89: Good quality with minor issues. A few awkward phrases but generally fluent.
- 50-74: Noticeable problems. Multiple unnatural phrases, grammar errors, or changed character names.
- 0-49: Poor quality. Reads like a machine translation. Significant issues.

Be strict about: grammar errors, unnatural phrasing, literal calques from English, names that were changed from the original.
Do NOT penalize for: protected brand names listed above, technical terms (CPAP, memory foam), product feature names, character names that match the English source.

IMPORTANT: Write ALL issue descriptions and overall_assessment in English. The "find"/"replace" values in suggested_corrections should be in ${langLabel} as they appear on the page.`;

    // When re-analyzing after a fix, include context about what was already corrected
    if (previous_context?.applied_corrections?.length) {
      const corrList = previous_context.applied_corrections
        .map((c) => `- "${c.find}" → "${c.replace}"`)
        .join("\n");
      const prevIssues = [
        ...previous_context.previous_issues.fluency_issues,
        ...previous_context.previous_issues.grammar_issues,
        ...previous_context.previous_issues.context_errors,
      ];
      const issueList = prevIssues.length > 0
        ? prevIssues.map((i) => `- ${i}`).join("\n")
        : "none";

      systemPrompt += `

CORRECTIONS ALREADY APPLIED — DO NOT RE-REPORT:
The following corrections were just applied to this translation. Do NOT report these same issues again, and do NOT report variations or rephrasings of them. Only report genuinely NEW issues that are completely different from what was already fixed.

Applied corrections:
${corrList}

Previously identified issues (now resolved):
${issueList}

SCORING: The previous score was ${previous_context.previous_score}. Since corrections were applied to improve quality, your score MUST be equal to or higher than ${previous_context.previous_score} — unless you find a genuinely new critical issue that is completely unrelated to the corrections above.`;
    }

    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Original (English):\n${originalText.slice(0, 8000)}\n\n---\n\nTranslation (${langLabel}):\n${translatedText.slice(0, 8000)}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No analysis returned");

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      throw new Error("Quality analysis returned invalid JSON");
    }

    // Enforce score floor after fix — corrections can only improve quality
    if (previous_context?.previous_score != null && analysis.quality_score < previous_context.previous_score) {
      console.log(
        `[translate/analyze] Score floor: GPT returned ${analysis.quality_score}, previous was ${previous_context.previous_score} — using floor`
      );
      analysis.quality_score = previous_context.previous_score;
    }

    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    // Save to translation row
    await db
      .from("translations")
      .update({
        quality_score: analysis.quality_score,
        quality_analysis: analysis,
        updated_at: new Date().toISOString(),
      })
      .eq("id", translation_id);

    // Log usage
    await db.from("usage_logs").insert({
      type: "translation",
      page_id: translation.page_id,
      translation_id: translation_id,
      model: OPENAI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: calcOpenAICost(inputTokens, outputTokens),
      metadata: {
        purpose: "page_quality_analysis",
        language: translation.language,
        duration_ms: Date.now() - startTime,
      },
    });

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("[translate/analyze] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
