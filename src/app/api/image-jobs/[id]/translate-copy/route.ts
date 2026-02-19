import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { Language, LANGUAGES, ConceptCopyTranslation, ConceptCopyTranslations } from "@/types";
import { getShortLocalizationNote } from "@/lib/localization";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";
import OpenAI from "openai";

export const maxDuration = 120;

/**
 * Translate ad copy for a concept to a specific language, then run quality analysis.
 * Stores results in image_jobs.ad_copy_translations JSON column.
 *
 * POST body: { language: Language }
 * - If language is omitted, translates all target languages sequentially.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const body = await req.json();
  const targetLang = body.language as Language | undefined;

  const db = createServerSupabase();

  const { data: job, error } = await db
    .from("image_jobs")
    .select("id, name, product, target_languages, ad_copy_primary, ad_copy_headline, ad_copy_translations")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  const primaryTexts: string[] = (job.ad_copy_primary ?? []).filter((t: string) => t.trim());
  const headlineTexts: string[] = (job.ad_copy_headline ?? []).filter((t: string) => t.trim());

  if (primaryTexts.length === 0) {
    return NextResponse.json({ error: "No primary text to translate" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey });
  const languages = targetLang ? [targetLang] : (job.target_languages as Language[]);
  const existing: ConceptCopyTranslations = job.ad_copy_translations ?? {};
  const results: Record<string, ConceptCopyTranslation> = { ...existing };

  for (const lang of languages) {
    const langLabel = LANGUAGES.find((l) => l.value === lang)?.label ?? lang;

    // Mark as translating
    results[lang] = {
      primary_texts: [],
      headlines: [],
      quality_score: null,
      quality_analysis: null,
      status: "translating",
    };
    await db
      .from("image_jobs")
      .update({ ad_copy_translations: results })
      .eq("id", jobId);

    try {
      // Step 1: Translate
      const translateResponse = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a professional ad copywriter and translator. Translate all ad copy variants from English to ${langLabel}.
Maintain the tone, style, and persuasive power of the original.
Adapt cultural references and idioms naturally.${getShortLocalizationNote(lang)}
Return a JSON object with exactly two keys:
- "primary_texts": an array of translated primary texts (same order as input)
- "headlines": an array of translated headlines (same order as input)
No other text.`,
          },
          {
            role: "user",
            content: JSON.stringify({ primary_texts: primaryTexts, headlines: headlineTexts }),
          },
        ],
      });

      const translateContent = translateResponse.choices[0]?.message?.content?.trim();
      if (!translateContent) throw new Error("No translation returned");

      const parsed = JSON.parse(translateContent) as { primary_texts: string[]; headlines: string[] };

      // Log translation usage
      const tInput = translateResponse.usage?.prompt_tokens ?? 0;
      const tOutput = translateResponse.usage?.completion_tokens ?? 0;
      await db.from("usage_logs").insert({
        type: "translation",
        model: OPENAI_MODEL,
        input_tokens: tInput,
        output_tokens: tOutput,
        cost_usd: calcOpenAICost(tInput, tOutput),
        metadata: { purpose: "concept_copy_translation", language: lang, job_id: jobId },
      });

      // Step 2: Quality analysis
      const allOriginal = [...primaryTexts, ...headlineTexts].join("\n---\n");
      const allTranslated = [...parsed.primary_texts, ...parsed.headlines].join("\n---\n");

      const analyzeResponse = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a quality analyst for translated ad copy. Compare the original English ad copy with its ${langLabel} translation and evaluate quality.

Respond with JSON:
{
  "quality_score": <0-100>,
  "fluency_issues": [<list of unnatural or awkward phrasings>],
  "grammar_issues": [<list of grammar problems>],
  "context_errors": [<list of meaning changes, mistranslations, or cultural issues>],
  "overall_assessment": "<1-2 sentence summary>"
}

Be strict: any grammar error, meaning change, or awkward phrasing should reduce the score. Pay special attention to:
- Names being properly localized to ${langLabel} equivalents
- Cultural references adapted for the target market
- Ad copy maintaining its persuasive power
- Natural-sounding ${langLabel} (not "translationese")`,
          },
          {
            role: "user",
            content: `Original (English):\n${allOriginal}\n\nTranslation (${langLabel}):\n${allTranslated}`,
          },
        ],
      });

      const analyzeContent = analyzeResponse.choices[0]?.message?.content?.trim();
      if (!analyzeContent) throw new Error("No analysis returned");

      const analysis = JSON.parse(analyzeContent);

      // Log analysis usage
      const aInput = analyzeResponse.usage?.prompt_tokens ?? 0;
      const aOutput = analyzeResponse.usage?.completion_tokens ?? 0;
      await db.from("usage_logs").insert({
        type: "translation",
        model: OPENAI_MODEL,
        input_tokens: aInput,
        output_tokens: aOutput,
        cost_usd: calcOpenAICost(aInput, aOutput),
        metadata: { purpose: "concept_copy_quality_analysis", language: lang, job_id: jobId },
      });

      results[lang] = {
        primary_texts: parsed.primary_texts,
        headlines: parsed.headlines,
        quality_score: analysis.quality_score,
        quality_analysis: analysis,
        status: "completed",
      };
    } catch (err) {
      results[lang] = {
        primary_texts: [],
        headlines: [],
        quality_score: null,
        quality_analysis: null,
        status: "error",
        error: err instanceof Error ? err.message : "Translation failed",
      };
    }

    // Save after each language
    await db
      .from("image_jobs")
      .update({ ad_copy_translations: results })
      .eq("id", jobId);
  }

  return NextResponse.json({ translations: results });
}
