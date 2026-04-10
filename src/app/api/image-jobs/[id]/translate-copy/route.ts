import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { Language, LANGUAGES, ConceptCopyTranslation, ConceptCopyTranslations } from "@/types";
import { getShortLocalizationNote } from "@/lib/localization";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";
import OpenAI from "openai";
import { isValidUUID } from "@/lib/validation";
import { deriveCopyGrade, gradeToNumeric } from "@/lib/quality-grades";
import { reviewTranslationQuality, calcHaikuCost } from "@/lib/translation-review";

export const maxDuration = 120;

/**
 * Translate ad copy for a concept to a specific language, then run quality analysis.
 * Stores results in image_jobs.ad_copy_translations JSON column.
 *
 * POST body: { language: Language }
 * - If language is omitted, translates all target languages in parallel.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const body = await req.json();
  const targetLang = body.language as Language | undefined;
  const corrections = body.corrections as string | undefined;

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data: job, error } = await db
    .from("image_jobs")
    .select("id, name, product, target_languages, ad_copy_primary, ad_copy_headline, ad_copy_translations, source_language")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  const allPrimaryTexts: string[] = (job.ad_copy_primary ?? []).filter((t: string) => t.trim());
  const allHeadlineTexts: string[] = (job.ad_copy_headline ?? []).filter((t: string) => t.trim());

  if (allPrimaryTexts.length === 0) {
    return NextResponse.json({ error: "No primary text to translate" }, { status: 400 });
  }

  // Limit to 1 primary text + 2 headlines for focused, higher-quality translations
  const primaryTexts = allPrimaryTexts.slice(0, 1);
  const headlineTexts = allHeadlineTexts.slice(0, 2);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey });
  const sourceLanguage = (job.source_language as string) ?? "en";
  const sourceLangLabel = LANGUAGES.find((l) => l.value === sourceLanguage)?.label ?? "English";
  const allLanguages = targetLang ? [targetLang] : (job.target_languages as Language[]);
  // Skip the source language — ad copy is already in that language
  const languages = allLanguages.filter((l) => l !== sourceLanguage);

  if (languages.length === 0) {
    return NextResponse.json({ translations: job.ad_copy_translations ?? {}, skipped: "all target languages match source language" });
  }

  const existing: ConceptCopyTranslations = job.ad_copy_translations ?? {};
  const results: Record<string, ConceptCopyTranslation> = { ...existing };

  // Mark all target languages as "translating" in one DB write
  for (const lang of languages) {
    results[lang] = {
      primary_texts: [],
      headlines: [],
      quality_score: null,
      quality_analysis: null,
      status: "translating",
    };
  }
  await db
    .from("image_jobs")
    .update({ ad_copy_translations: results })
    .eq("id", jobId);

  const MAX_QUALITY_RETRIES = 3;
  const conceptName = job!.name ?? "Unnamed concept";

  // Translate all languages in parallel to avoid sequential timeout
  async function translateLang(lang: Language): Promise<ConceptCopyTranslation> {
    const langLabel = LANGUAGES.find((l) => l.value === lang)?.label ?? lang;
    let currentPrimary: string[] = [];
    let currentHeadlines: string[] = [];
    let lastReview: Awaited<ReturnType<typeof reviewTranslationQuality>>["result"] | null = null;
    let retryCorrections: string | undefined = corrections; // use user-provided corrections on first attempt

    for (let attempt = 1; attempt <= MAX_QUALITY_RETRIES; attempt++) {
      const translateResponse = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_completion_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a professional ad copywriter and translator. Translate all ad copy variants from ${sourceLangLabel} to ${langLabel}.
Maintain the tone, style, and persuasive power of the original.
Adapt cultural references and idioms naturally.${getShortLocalizationNote(lang)}
IMPORTANT: If the text contains URL placeholders like [LINK], [LÄNK], [URL] or website addresses, replace them with a natural call-to-action phrase in ${langLabel} (e.g. "Handla nu", "Köp här", "Shop now"). The landing page link is attached separately by the ad platform and must NOT appear in the ad copy text.
CURRENCY — CRITICAL: Convert ANY foreign currency in the source (€, $, £, EUR, USD, GBP) into the LOCAL market currency for ${langLabel}: Swedish → SEK / "kr", Norwegian → NOK / "kr", Danish → DKK / "kr". Use a rough conversion: 1 EUR ≈ 11 kr (SE/NO) or 7.5 kr (DK); 1 USD ≈ 10 kr (SE/NO) or 7 kr (DK). Round to a clean nearby number (e.g. €387 → 4 200 kr, not 4 257 kr). NEVER leave foreign currency symbols (€, $, £) or codes (EUR, USD, GBP) in the output — the translated ad MUST be in local currency only.${retryCorrections ? `\n\nIMPORTANT — The previous translation had quality issues. Fix these problems:\n${retryCorrections}` : ""}
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

      let parsed: { primary_texts: string[]; headlines: string[] };
      try {
        parsed = JSON.parse(translateContent) as { primary_texts: string[]; headlines: string[] };
      } catch {
        throw new Error("Translation returned invalid JSON");
      }
      currentPrimary = parsed.primary_texts;
      currentHeadlines = parsed.headlines;

      // Log translation usage
      const tInput = translateResponse.usage?.prompt_tokens ?? 0;
      const tOutput = translateResponse.usage?.completion_tokens ?? 0;
      await db.from("usage_logs").insert({
        type: "translation",
        model: OPENAI_MODEL,
        input_tokens: tInput,
        output_tokens: tOutput,
        cost_usd: calcOpenAICost(tInput, tOutput),
        metadata: { purpose: "concept_copy_translation", language: lang, job_id: jobId, attempt },
      });

      // Quality review
      try {
        const { result: review, inputTokens: rInput, outputTokens: rOutput } = await reviewTranslationQuality(
          currentPrimary,
          currentHeadlines,
          lang,
          primaryTexts,
          conceptName,
        );
        lastReview = review;

        await db.from("usage_logs").insert({
          type: "translation",
          model: "claude-haiku-4-5-20251001",
          input_tokens: rInput,
          output_tokens: rOutput,
          cost_usd: calcHaikuCost(rInput, rOutput),
          metadata: { purpose: "concept_copy_quality_analysis", language: lang, job_id: jobId, attempt },
        });

        if (review.review_verdict === "pass") break;

        // Build corrections for next attempt
        const issues: string[] = [];
        if (review.narrative_issues?.length) issues.push(`Narrative issues: ${review.narrative_issues.join("; ")}`);
        if (review.naturalness_issues?.length) issues.push(`Naturalness issues: ${review.naturalness_issues.join("; ")}`);
        if (review.grammar_issues?.length) issues.push(`Grammar issues: ${review.grammar_issues.join("; ")}`);
        if (review.context_errors?.length) issues.push(`Context errors: ${review.context_errors.join("; ")}`);
        retryCorrections = issues.join("\n");
      } catch (analysisErr) {
        console.warn(`[translate-copy] Quality review failed for ${lang} attempt ${attempt}:`, analysisErr);
        break; // Can't review → save what we have
      }
    }

    const grade = deriveCopyGrade(lastReview ?? {});
    const qualityScore = gradeToNumeric(grade);
    const copyStatus = lastReview?.review_verdict === "pass" ? "completed" : "review";

    return {
      primary_texts: currentPrimary,
      headlines: currentHeadlines,
      quality_score: qualityScore,
      quality_analysis: lastReview ? { ...lastReview, quality_score: qualityScore } : null,
      status: copyStatus,
    };
  }

  const settled = await Promise.allSettled(
    languages.map((lang) => translateLang(lang).then((result) => ({ lang, result })))
  );

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results[outcome.value.lang] = outcome.value.result;
    } else {
      const lang = languages[settled.indexOf(outcome)];
      results[lang] = {
        primary_texts: [],
        headlines: [],
        quality_score: null,
        quality_analysis: null,
        status: "error",
        error: outcome.reason instanceof Error ? outcome.reason.message : "Translation failed",
      };
    }
  }

  // Save all results in one write
  await db
    .from("image_jobs")
    .update({ ad_copy_translations: results })
    .eq("id", jobId);

  return NextResponse.json({ translations: results });
}
