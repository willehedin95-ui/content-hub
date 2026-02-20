import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { Language, COUNTRY_MAP, LANGUAGES, ConceptCopyTranslations } from "@/types";
import {
  duplicateAdSet,
  updateAdSet,
  uploadImage,
  createAdCreative,
  createAd,
} from "@/lib/meta";
import { getShortLocalizationNote } from "@/lib/localization";
import OpenAI from "openai";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";
import { isValidUUID } from "@/lib/validation";

export const maxDuration = 300;

/**
 * Push a concept (image_job) to Meta Ads — one ad set per target language/market.
 *
 * For each market:
 * 1. Look up campaign mapping (product × country)
 * 2. Auto-assign concept number if not set
 * 3. Translate ad copy (English → target language)
 * 4. Duplicate template ad set
 * 5. Rename ad set: "{COUNTRY} #{number} | statics | {concept_name}"
 * 6. Set start_time to next 03:00 CET
 * 7. Upload images + create ads
 * 8. Create meta_campaigns + meta_ads records
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  // Load the concept with images + translations
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select("*, source_images(*, image_translations(*))")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  if (!job.product) {
    return NextResponse.json({ error: "Product is required" }, { status: 400 });
  }

  const primaryTexts: string[] = (job.ad_copy_primary ?? []).filter((t: string) => t.trim());
  if (primaryTexts.length === 0) {
    return NextResponse.json({ error: "At least one primary text is required" }, { status: 400 });
  }
  const headlineTexts: string[] = (job.ad_copy_headline ?? []).filter((t: string) => t.trim());

  if (!job.landing_page_id) {
    return NextResponse.json({ error: "Landing page is required" }, { status: 400 });
  }

  // Auto-assign concept number if not set (atomic to prevent duplicates)
  let conceptNumber = job.concept_number;
  if (!conceptNumber) {
    const { data: assigned, error: rpcError } = await db.rpc("assign_next_concept_number", {
      p_job_id: jobId,
      p_product: job.product,
    });

    if (rpcError || assigned === null || assigned === undefined) {
      // Fallback: non-atomic assignment (safe for single-user tool)
      const { data: maxRow } = await db
        .from("image_jobs")
        .select("concept_number")
        .eq("product", job.product)
        .not("concept_number", "is", null)
        .order("concept_number", { ascending: false })
        .limit(1)
        .single();

      conceptNumber = (maxRow?.concept_number ?? 0) + 1;

      await db
        .from("image_jobs")
        .update({ concept_number: conceptNumber })
        .eq("id", jobId);
    } else {
      conceptNumber = assigned;
    }
  }

  const conceptNumberStr = String(conceptNumber).padStart(3, "0");
  const conceptName = job.name.toLowerCase();

  // Get landing page URLs for each language
  const { data: landingPageTranslations } = await db
    .from("translations")
    .select("language, published_url")
    .eq("page_id", job.landing_page_id)
    .eq("status", "published")
    .not("published_url", "is", null);

  const landingUrlByLang = new Map<string, string>();
  for (const t of landingPageTranslations ?? []) {
    landingUrlByLang.set(t.language, t.published_url);
  }

  // Get completed image translations grouped by language
  const completedTranslations = (job.source_images ?? []).flatMap(
    (si: { id: string; image_translations?: Array<{ language: string; aspect_ratio: string; status: string; translated_url: string | null; source_image_id: string }> }) =>
      (si.image_translations ?? []).filter(
        (t) => t.status === "completed" && t.translated_url
      )
  );

  // Find 9:16 siblings for each 1:1 translation
  const siblings9x16 = new Map<string, string>(); // key: "source_image_id:language" -> 9:16 url
  for (const t of completedTranslations) {
    if (t.aspect_ratio === "9:16" && t.translated_url) {
      siblings9x16.set(`${t.source_image_id}:${t.language}`, t.translated_url);
    }
  }

  const results: Array<{ language: string; country: string; status: string; error?: string; campaign_id?: string }> = [];

  // Process each target language
  for (const lang of job.target_languages as Language[]) {
    const country = COUNTRY_MAP[lang];
    if (!country) {
      results.push({ language: lang, country: "??", status: "error", error: `No country mapping for ${lang}` });
      continue;
    }

    // Check campaign mapping
    const { data: mapping } = await db
      .from("meta_campaign_mappings")
      .select("meta_campaign_id, template_adset_id")
      .eq("product", job.product)
      .eq("country", country)
      .single();

    // Look up Facebook page for this country
    const { data: pageConfig } = await db
      .from("meta_page_config")
      .select("meta_page_id")
      .eq("country", country)
      .single();

    if (!mapping?.meta_campaign_id || !mapping?.template_adset_id) {
      results.push({
        language: lang,
        country,
        status: "error",
        error: `No campaign mapping for ${job.product}/${country}. Configure in Settings.`,
      });
      continue;
    }

    // Get landing page URL for this language
    const landingUrl = landingUrlByLang.get(lang);
    if (!landingUrl) {
      results.push({
        language: lang,
        country,
        status: "error",
        error: `No published landing page for ${lang}`,
      });
      continue;
    }

    // Get 1:1 images for this language
    const langImages = completedTranslations.filter(
      (t: { language: string; aspect_ratio: string }) => t.language === lang && t.aspect_ratio === "1:1"
    );

    if (langImages.length === 0) {
      results.push({
        language: lang,
        country,
        status: "error",
        error: `No completed 1:1 images for ${lang}`,
      });
      continue;
    }

    try {
      // Use pre-translated copy if available, otherwise translate on-the-fly
      const preTranslated = (job.ad_copy_translations as ConceptCopyTranslations)?.[lang];
      let translatedPrimaries: string[];
      let translatedHeadlines: string[];

      if (preTranslated?.status === "completed" && preTranslated.primary_texts.length > 0) {
        translatedPrimaries = preTranslated.primary_texts;
        translatedHeadlines = preTranslated.headlines;
      } else {
        const result = await translateAdCopyBatch(primaryTexts, headlineTexts, lang, db);
        translatedPrimaries = result.translatedPrimaries;
        translatedHeadlines = result.translatedHeadlines;
      }

      // Generate ad set name
      const adSetName = `${country} #${conceptNumberStr} | statics | ${conceptName}`;

      // Duplicate template ad set
      const { copied_adset_id } = await duplicateAdSet(mapping.template_adset_id);

      // Rename and set start time (single API call, with retry via metaJson)
      const startTime = getNext0300CET();
      await updateAdSet(copied_adset_id, { name: adSetName, start_time: startTime });

      // Create meta_campaigns record
      const { data: campaign } = await db
        .from("meta_campaigns")
        .insert({
          name: adSetName,
          product: job.product,
          image_job_id: jobId,
          meta_campaign_id: mapping.meta_campaign_id,
          meta_adset_id: copied_adset_id,
          objective: "OUTCOME_TRAFFIC",
          countries: [country],
          language: lang,
          daily_budget: 0,
          start_time: startTime,
          status: "pushing",
        })
        .select()
        .single();

      if (!campaign) throw new Error("Failed to create campaign record");

      // Process each image ad
      const adRows = [];
      for (let i = 0; i < langImages.length; i++) {
        const imgTranslation = langImages[i];
        const adName = `${adSetName} - Ad ${i + 1}`;
        const url9x16 = siblings9x16.get(`${imgTranslation.source_image_id}:${lang}`) || null;

        try {
          // Upload 1:1 image
          const { hash: imageHash } = await uploadImage(imgTranslation.translated_url);

          // Upload 9:16 if available
          let imageHash9x16: string | undefined;
          if (url9x16) {
            const result = await uploadImage(url9x16);
            imageHash9x16 = result.hash;
          }

          // Create creative
          const creative = await createAdCreative({
            name: adName,
            imageHash,
            imageHash9x16,
            primaryText: translatedPrimaries[0],
            primaryTexts: translatedPrimaries.length > 1 ? translatedPrimaries : undefined,
            headline: translatedHeadlines[0] || undefined,
            headlines: translatedHeadlines.length > 1 ? translatedHeadlines : undefined,
            linkUrl: landingUrl,
            pageId: pageConfig?.meta_page_id,
          });

          // Create ad
          const metaAd = await createAd({
            name: adName,
            adSetId: copied_adset_id,
            creativeId: creative.id,
            status: "PAUSED",
          });

          adRows.push({
            campaign_id: campaign.id,
            name: adName,
            image_url: imgTranslation.translated_url,
            image_url_9x16: url9x16,
            meta_image_hash: imageHash,
            meta_image_hash_9x16: imageHash9x16 || null,
            ad_copy: translatedPrimaries.join("\n---\n"),
            headline: translatedHeadlines.join("\n---\n") || null,
            source_primary_text: JSON.stringify(primaryTexts),
            source_headline: JSON.stringify(headlineTexts),
            landing_page_url: landingUrl,
            aspect_ratio: "1:1",
            meta_creative_id: creative.id,
            meta_ad_id: metaAd.id,
            status: "pushed",
          });
        } catch (adErr) {
          adRows.push({
            campaign_id: campaign.id,
            name: adName,
            image_url: imgTranslation.translated_url,
            image_url_9x16: url9x16,
            ad_copy: translatedPrimaries.join("\n---\n"),
            headline: translatedHeadlines.join("\n---\n") || null,
            source_primary_text: JSON.stringify(primaryTexts),
            source_headline: JSON.stringify(headlineTexts),
            landing_page_url: landingUrl,
            aspect_ratio: "1:1",
            status: "error",
            error_message: adErr instanceof Error ? adErr.message : "Failed",
          });
        }
      }

      // Insert all ad records
      if (adRows.length > 0) {
        await db.from("meta_ads").insert(adRows);
      }

      // Update campaign status
      const hasSuccess = adRows.some((a) => a.status === "pushed");
      await db
        .from("meta_campaigns")
        .update({
          status: hasSuccess ? "pushed" : "error",
          error_message: hasSuccess ? null : "All ads failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);

      results.push({
        language: lang,
        country,
        status: hasSuccess ? "pushed" : "error",
        campaign_id: campaign.id,
        error: hasSuccess ? undefined : "Some or all ads failed to push",
      });
    } catch (err) {
      results.push({
        language: lang,
        country,
        status: "error",
        error: err instanceof Error ? err.message : "Push failed",
      });
    }
  }

  return NextResponse.json({ results });
}

/**
 * Translate all ad copy variants using GPT-4o (single API call for all variants)
 */
async function translateAdCopyBatch(
  primaryTexts: string[],
  headlines: string[],
  language: Language,
  db: ReturnType<typeof createServerSupabase>
): Promise<{ translatedPrimaries: string[]; translatedHeadlines: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const openai = new OpenAI({ apiKey });
  const langLabel = LANGUAGES.find((l) => l.value === language)?.label ?? language;

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: 4000,
    messages: [
      {
        role: "system",
        content: `You are a professional ad copywriter and translator. Translate all ad copy variants from English to ${langLabel}.
Maintain the tone, style, and persuasive power of the original.
Adapt cultural references and idioms naturally.${getShortLocalizationNote(language)}
Return a JSON object with exactly two keys:
- "primary_texts": an array of translated primary texts (same order as input)
- "headlines": an array of translated headlines (same order as input)
No other text.`,
      },
      {
        role: "user",
        content: JSON.stringify({ primary_texts: primaryTexts, headlines }),
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("No translation returned");

  const parsed = JSON.parse(content) as { primary_texts: string[]; headlines: string[] };

  // Log usage
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  await db.from("usage_logs").insert({
    type: "translation",
    page_id: null,
    translation_id: null,
    model: OPENAI_MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: calcOpenAICost(inputTokens, outputTokens),
    metadata: { purpose: "concept_push_copy_translation", language, variant_count: primaryTexts.length + headlines.length },
  });

  return {
    translatedPrimaries: parsed.primary_texts,
    translatedHeadlines: parsed.headlines,
  };
}

/**
 * Get the next 03:00 CET/CEST as ISO string.
 * If it's currently before 03:00 CET, returns today at 03:00.
 * If it's after 03:00 CET, returns tomorrow at 03:00.
 *
 * Works correctly regardless of server timezone (including UTC on Vercel)
 * by comparing UTC timestamps of 03:00 on consecutive days in Europe/Oslo.
 */
function getNext0300CET(): string {
  const now = new Date();
  const TZ = "Europe/Oslo";

  // Get today's date components in CET/CEST
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayCET = formatter.format(now); // "YYYY-MM-DD"

  // Build "today at 03:00" in Europe/Oslo by binary-searching for the UTC ms
  // that corresponds to 03:00 in CET/CEST
  function cetDateToUTC(dateStr: string, hour: number): Date {
    // Start with a rough UTC guess (CET is UTC+1 or UTC+2)
    const [y, m, d] = dateStr.split("-").map(Number);
    const guess = new Date(Date.UTC(y, m - 1, d, hour - 1, 0, 0));

    // Verify what hour this actually is in CET and adjust
    const hourFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "2-digit",
      hour12: false,
    });
    const actualHour = parseInt(hourFmt.format(guess));
    const diff = hour - actualHour;
    return new Date(guess.getTime() - diff * 3600_000);
  }

  const target0300 = cetDateToUTC(todayCET, 3);

  // If already past 03:00 CET today, use tomorrow
  if (now >= target0300) {
    const tomorrow = new Date(now.getTime() + 86400_000);
    const tomorrowCET = formatter.format(tomorrow);
    return cetDateToUTC(tomorrowCET, 3).toISOString();
  }

  return target0300.toISOString();
}
