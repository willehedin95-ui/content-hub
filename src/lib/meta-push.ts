import { createServerSupabase } from "@/lib/supabase";
import { Language, COUNTRY_MAP, LANGUAGES, ConceptCopyTranslations } from "@/types";
import {
  getAdSetConfig,
  createAdSetFromTemplate,
  uploadImage,
  createAdCreative,
  createAd,
} from "@/lib/meta";
import { getShortLocalizationNote } from "@/lib/localization";
import OpenAI from "openai";
import { calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";

/** Retry a Meta API call once after a delay (handles transient errors / rate limits) */
async function withRetry<T>(fn: () => Promise<T>, delayMs = 2000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Don't retry validation/permission errors — only transient ones
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("(#100)") || msg.includes("(#200)") || msg.includes("(#10)")) {
      throw err; // validation or permission error, no point retrying
    }
    await new Promise((r) => setTimeout(r, delayMs));
    return await fn();
  }
}

export interface PushResult {
  language: string;
  country: string;
  status: string;
  error?: string;
  campaign_id?: string;
  scheduled_time?: string;
  added_to_existing?: boolean;
}

/**
 * Push a concept (image_job) to Meta Ads — one ad set per target language/market.
 *
 * If a pushed ad set already exists for a market, adds new (unpushed) images
 * to the existing ad set instead of creating a new one. This supports the
 * iteration batch flow where new images are generated within the same concept.
 *
 * Returns array of per-language results + scheduled time.
 */
export async function pushConceptToMeta(
  jobId: string,
  opts?: { languages?: string[] }
): Promise<{ results: PushResult[]; scheduled_time: string | null }> {
  const db = createServerSupabase();

  // Load the concept with images + translations
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select("*, source_images(*, image_translations(*))")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    throw new Error("Concept not found");
  }

  if (!job.product) {
    throw new Error("Product is required");
  }

  const primaryTexts: string[] = (job.ad_copy_primary ?? []).filter((t: string) => t.trim());
  if (primaryTexts.length === 0) {
    throw new Error("At least one primary text is required");
  }
  const headlineTexts: string[] = (job.ad_copy_headline ?? []).filter((t: string) => t.trim());

  if (!job.landing_page_id && !job.ab_test_id) {
    throw new Error("Landing page or AB test is required");
  }

  // Prevent duplicate pushes — reject if there's already a push in progress for this concept
  const { data: activePush } = await db
    .from("meta_campaigns")
    .select("id")
    .eq("image_job_id", jobId)
    .eq("status", "pushing")
    .limit(1);
  if (activePush && activePush.length > 0) {
    throw new Error("A push is already in progress for this concept");
  }

  // Auto-assign concept number if not set
  let conceptNumber = job.concept_number;
  const isExternal = job.source === "external";

  if (!conceptNumber) {
    if (isExternal) {
      const { data: assigned, error: rpcError } = await db.rpc("assign_next_external_concept_number", {
        p_job_id: jobId,
        p_product: job.product,
      });
      if (!rpcError && assigned !== null) {
        conceptNumber = assigned;
      }
    }

    if (!conceptNumber) {
      // Hub concepts or fallback
      const { data: assigned, error: rpcError } = await db.rpc("assign_next_concept_number", {
        p_job_id: jobId,
        p_product: job.product,
      });

      if (rpcError || assigned === null || assigned === undefined) {
        const { data: maxRow } = await db
          .from("image_jobs")
          .select("concept_number")
          .eq("product", job.product)
          .not("concept_number", "is", null)
          .neq("source", "external")
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
  }

  const conceptNumberStr = String(conceptNumber).padStart(3, "0");
  const numberPrefix = isExternal ? "R" : "#";
  // Strip leading "#XXX " or "RXXX " prefix from concept name to avoid duplication in ad set name
  const conceptName = job.name.replace(/^#\d+\s*/, "").replace(/^R\d+\s*/, "").toLowerCase();

  // Load default schedule time from settings (e.g. "03:00")
  let scheduledStartTime: string | null = null;
  const { data: settingsRow } = await db
    .from("app_settings")
    .select("settings")
    .limit(1)
    .single();
  const scheduleHHMM = (settingsRow?.settings as Record<string, unknown>)?.meta_default_schedule_time as string | undefined;
  if (scheduleHHMM) {
    const [hh, mm] = scheduleHHMM.split(":").map(Number);
    const now = new Date();
    const scheduled = new Date(now);
    scheduled.setHours(hh, mm, 0, 0);
    // If the time has already passed today, schedule for tomorrow
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    scheduledStartTime = scheduled.toISOString();
  }

  // Get landing page URLs for each language
  const landingUrlByLang = new Map<string, string>();

  if (job.landing_page_id) {
    const { data: landingPageTranslations } = await db
      .from("translations")
      .select("language, published_url")
      .eq("page_id", job.landing_page_id)
      .eq("status", "published")
      .not("published_url", "is", null);

    for (const t of landingPageTranslations ?? []) {
      landingUrlByLang.set(t.language, t.published_url.trim());
    }
  }

  // Override with AB test router URL for its language (if selected)
  if (job.ab_test_id) {
    const { data: abTest } = await db
      .from("ab_tests")
      .select("language, router_url")
      .eq("id", job.ab_test_id)
      .single();

    if (abTest?.router_url) {
      landingUrlByLang.set(abTest.language, abTest.router_url);
    }
  }

  // Get completed image translations grouped by language
  const completedTranslations = (job.source_images ?? []).flatMap(
    (si: { id: string; image_translations?: Array<{ language: string; aspect_ratio: string; status: string; translated_url: string | null; source_image_id: string }> }) =>
      (si.image_translations ?? []).filter(
        (t) => t.status === "completed" && t.translated_url
      )
  );

  // Collect source images that skipped translation — use original for all languages
  const skippedOriginals = (job.source_images ?? [])
    .filter((si: { skip_translation: boolean; original_url: string }) => si.skip_translation && si.original_url)
    .map((si: { id: string; original_url: string; processing_order: number | null }) => ({
      source_image_id: si.id,
      original_url: si.original_url,
      processing_order: si.processing_order ?? 0,
    }));

  // Find 9:16 siblings for each 1:1 translation
  const siblings9x16 = new Map<string, string>(); // key: "source_image_id:language" -> 9:16 url
  for (const t of completedTranslations) {
    if (t.aspect_ratio === "9:16" && t.translated_url) {
      siblings9x16.set(`${t.source_image_id}:${t.language}`, t.translated_url);
    }
  }

  const results: PushResult[] = [];

  // Filter languages if specified (for per-market queue pushing)
  const targetLangs = opts?.languages
    ? (job.target_languages as Language[]).filter((l) => opts.languages!.includes(l))
    : (job.target_languages as Language[]);

  // Process all target languages in parallel
  const langResults = await Promise.allSettled(
    targetLangs.map(async (lang) => {
      const country = COUNTRY_MAP[lang];
      if (!country) {
        return { language: lang, country: "??", status: "error", error: `No country mapping for ${lang}` } as const;
      }

      // Check campaign mapping + page config in parallel
      const [{ data: mapping }, { data: pageConfig }] = await Promise.all([
        db.from("meta_campaign_mappings").select("meta_campaign_id, template_adset_id").eq("product", job.product).eq("country", country).eq("format", "image").single(),
        db.from("meta_page_config").select("meta_page_id").eq("country", country).single(),
      ]);

      if (!mapping?.meta_campaign_id || !mapping?.template_adset_id) {
        return { language: lang, country, status: "error", error: `No campaign mapping for ${job.product}/${country}. Configure in Settings.` } as const;
      }

      const landingUrl = landingUrlByLang.get(lang);
      if (!landingUrl) {
        return { language: lang, country, status: "error", error: `No published landing page for ${lang}` } as const;
      }

      // Combine translated feed images + skipped originals into a unified list
      const feedRatio = job.target_ratios?.[0] ?? "4:5";
      const translatedForLang = completedTranslations
        .filter((t: { language: string; aspect_ratio: string }) => t.language === lang && t.aspect_ratio === feedRatio)
        .map((t: { translated_url: string; source_image_id: string }) => ({
          image_url: t.translated_url,
          source_image_id: t.source_image_id,
        }));
      const skippedForLang = skippedOriginals.map((si: { original_url: string; source_image_id: string }) => ({
        image_url: si.original_url,
        source_image_id: si.source_image_id,
      }));
      const allLangImages = [...translatedForLang, ...skippedForLang];

      if (allLangImages.length === 0) {
        return { language: lang, country, status: "error", error: `No completed ${feedRatio} images for ${lang}` } as const;
      }

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

      const adSetName = `${country} ${numberPrefix}${conceptNumberStr} | statics | ${conceptName}`;

      // Check for existing pushed ad set for this concept + language
      // If found, add new images to it instead of creating a new ad set
      const { data: existingCampaign } = await db
        .from("meta_campaigns")
        .select("id, meta_adset_id, meta_ads(image_url)")
        .eq("image_job_id", jobId)
        .eq("language", lang)
        .eq("status", "pushed")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      let adSetId: string;
      let campaignId: string;
      let isAddingToExisting = false;

      if (existingCampaign?.meta_adset_id) {
        // Reuse existing ad set — filter out already-pushed images
        const pushedUrls = new Set(
          ((existingCampaign.meta_ads ?? []) as Array<{ image_url: string | null }>)
            .map((a) => a.image_url)
            .filter(Boolean)
        );
        const newImages = allLangImages.filter((img) => !pushedUrls.has(img.image_url));

        if (newImages.length === 0) {
          return { language: lang, country, status: "pushed", error: undefined } as const;
        }

        adSetId = existingCampaign.meta_adset_id;
        campaignId = existingCampaign.id;
        isAddingToExisting = true;

        // Mark as pushing during the add
        await db.from("meta_campaigns").update({
          status: "pushing",
          updated_at: new Date().toISOString(),
        }).eq("id", campaignId);

        // Replace with only new images
        allLangImages.length = 0;
        allLangImages.push(...newImages);
      } else {
        // Create new ad set from template config
        const templateConfig = await getAdSetConfig(mapping.template_adset_id);
        const newAdSet = await createAdSetFromTemplate({
          templateConfig,
          name: adSetName,
          isDynamicCreative: true,
          startTime: scheduledStartTime || undefined,
        });
        adSetId = newAdSet.id;

        const { data: newCampaign } = await db
          .from("meta_campaigns")
          .insert({
            name: adSetName,
            product: job.product,
            image_job_id: jobId,
            meta_campaign_id: mapping.meta_campaign_id,
            meta_adset_id: adSetId,
            objective: "OUTCOME_TRAFFIC",
            countries: [country],
            language: lang,
            daily_budget: 0,
            status: "pushing",
            start_time: scheduledStartTime,
          })
          .select()
          .single();

        if (!newCampaign) throw new Error("Failed to create campaign record");
        campaignId = newCampaign.id;
      }

      const langImages = allLangImages.slice(0, 5);

      // Upsert image_job_markets entry for pipeline tracking
      // (may already exist from queue — just update meta_campaign_id)
      await db.from("image_job_markets").upsert({
        image_job_id: jobId,
        market: country,
        meta_campaign_id: campaignId,
      }, { onConflict: "image_job_id,market" });

      try {
        // Phase 1: Upload ALL images in parallel (biggest time saver)
        const uploadResults = await Promise.allSettled(
          langImages.map(async (img) => {
            const url9x16 = siblings9x16.get(`${img.source_image_id}:${lang}`) || null;
            const [imgFeed, img9x16] = await Promise.all([
              withRetry(() => uploadImage(img.image_url)),
              url9x16 ? withRetry(() => uploadImage(url9x16)) : Promise.resolve(null),
            ]);
            return { imageHash: imgFeed.hash, imageHash9x16: img9x16?.hash, url9x16, imageUrl: img.image_url };
          })
        );

        // Collect successful uploads
        const uploadedImages: Array<{
          hash: string;
          hash9x16?: string;
          url: string;
          url9x16: string | null;
        }> = [];
        for (const r of uploadResults) {
          if (r.status === "fulfilled") {
            uploadedImages.push({
              hash: r.value.imageHash,
              hash9x16: r.value.imageHash9x16 ?? undefined,
              url: r.value.imageUrl,
              url9x16: r.value.url9x16,
            });
          }
        }

        if (uploadedImages.length === 0) {
          throw new Error("All image uploads failed");
        }

        // Phase 2 & 3: Create ads
        // Meta's asset_customization_rules only support 1 image per rule per placement.
        // When 9:16 variants exist, we must create one ad per image pair.
        // Without 9:16, a single DCO creative with all images works fine.
        const adBaseName = adSetName;
        const hasAny9x16 = uploadedImages.some((img) => img.hash9x16);
        const urlTags = `utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}&utm_term=${encodeURIComponent(new URL(landingUrl!).pathname.replace(/^\/|\/$/g, ""))}`;

        if (hasAny9x16) {
          // One ad per image pair — proper feed/story placement routing
          for (let idx = 0; idx < uploadedImages.length; idx++) {
            const img = uploadedImages[idx];
            const adName = uploadedImages.length > 1
              ? `${adBaseName} v${idx + 1}`
              : adBaseName;

            const creative = await withRetry(() => createAdCreative({
              name: adName,
              images: [{ hash: img.hash, hash9x16: img.hash9x16 }],
              bodies: translatedPrimaries,
              titles: translatedHeadlines.length > 0 ? translatedHeadlines : undefined,
              linkUrl: landingUrl,
              pageId: pageConfig?.meta_page_id,
            }));

            await new Promise((r) => setTimeout(r, 500)); // Rate limit between API calls

            const metaAd = await withRetry(() => createAd({
              name: adName,
              adSetId,
              creativeId: creative.id,
              status: "ACTIVE",
              urlTags,
            }));

            await db.from("meta_ads").insert({
              campaign_id: campaignId,
              name: adName,
              image_url: img.url,
              image_url_9x16: img.url9x16,
              image_urls: [img.url],
              meta_image_hash: img.hash,
              meta_image_hash_9x16: img.hash9x16 || null,
              ad_copy: translatedPrimaries[0],
              headline: translatedHeadlines[0] || null,
              source_primary_text: JSON.stringify(primaryTexts),
              source_headline: JSON.stringify(headlineTexts),
              landing_page_url: landingUrl,
              aspect_ratio: feedRatio,
              variation_index: idx,
              meta_creative_id: creative.id,
              meta_ad_id: metaAd.id,
              status: "pushed",
            });

            if (idx < uploadedImages.length - 1) {
              await new Promise((r) => setTimeout(r, 500)); // Rate limit
            }
          }
        } else {
          // No 9:16 variants — single DCO creative with all images
          const creative = await withRetry(() => createAdCreative({
            name: adBaseName,
            images: uploadedImages.map((img) => ({ hash: img.hash })),
            bodies: translatedPrimaries,
            titles: translatedHeadlines.length > 0 ? translatedHeadlines : undefined,
            linkUrl: landingUrl,
            pageId: pageConfig?.meta_page_id,
          }));

          const metaAd = await withRetry(() => createAd({
            name: adBaseName,
            adSetId,
            creativeId: creative.id,
            status: "ACTIVE",
            urlTags,
          }));

          await db.from("meta_ads").insert({
            campaign_id: campaignId,
            name: adBaseName,
            image_url: uploadedImages[0].url,
            image_url_9x16: null,
            image_urls: uploadedImages.map((img) => img.url),
            meta_image_hash: uploadedImages[0].hash,
            meta_image_hash_9x16: null,
            ad_copy: translatedPrimaries[0],
            headline: translatedHeadlines[0] || null,
            source_primary_text: JSON.stringify(primaryTexts),
            source_headline: JSON.stringify(headlineTexts),
            landing_page_url: landingUrl,
            aspect_ratio: feedRatio,
            variation_index: 0,
            meta_creative_id: creative.id,
            meta_ad_id: metaAd.id,
            status: "pushed",
          });
        }

        await db
          .from("meta_campaigns")
          .update({
            status: "pushed",
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaignId);
      } catch (crashErr) {
        // If anything crashes unexpectedly, mark the campaign as error so it doesn't stay stuck in "pushing"
        await db
          .from("meta_campaigns")
          .update({
            status: "error",
            error_message: crashErr instanceof Error ? crashErr.message : "Push crashed unexpectedly",
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaignId);
        throw crashErr; // Re-throw so it's reported as a failure for this language
      }

      // Re-read campaign status (set inside the try block above)
      const { data: finalCampaign } = await db
        .from("meta_campaigns")
        .select("status")
        .eq("id", campaignId)
        .single();
      const finalStatus = finalCampaign?.status === "pushed" ? "pushed" : "error";

      return {
        language: lang,
        country,
        status: finalStatus,
        campaign_id: campaignId,
        scheduled_time: isAddingToExisting ? undefined : (scheduledStartTime || undefined),
        error: finalStatus === "pushed" ? undefined : "Some or all ads failed to push",
        added_to_existing: isAddingToExisting,
      } as const;
    })
  );

  // Collect results from all languages
  for (const r of langResults) {
    if (r.status === "fulfilled") {
      results.push(r.value);
    } else {
      results.push({ language: "?", country: "??", status: "error", error: r.reason?.message ?? "Push failed" });
    }
  }

  return { results, scheduled_time: scheduledStartTime };
}

/**
 * Translate all ad copy variants using GPT-4o (single API call for all variants)
 */
export async function translateAdCopyBatch(
  primaryTexts: string[],
  headlines: string[],
  language: Language,
  db: ReturnType<typeof createServerSupabase>,
  sourceLanguage?: Language
): Promise<{ translatedPrimaries: string[]; translatedHeadlines: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const openai = new OpenAI({ apiKey });
  const langLabel = LANGUAGES.find((l) => l.value === language)?.label ?? language;
  const sourceLangLabel = sourceLanguage
    ? (LANGUAGES.find((l) => l.value === sourceLanguage)?.label ?? "English")
    : "English";

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: 4000,
    messages: [
      {
        role: "system",
        content: `You are a professional ad copywriter and translator. Translate all ad copy variants from ${sourceLangLabel} to ${langLabel}.
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
