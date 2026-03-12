import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId, getWorkspace, getWorkspaceSettings } from "@/lib/workspace";
import { Language, COUNTRY_MAP, LANGUAGES, ConceptCopyTranslations } from "@/types";
import {
  getAdSetConfig,
  createAdSetFromTemplate,
  uploadImage,
  createAdCreative,
  createAd,
  setMetaConfig,
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
  opts?: { languages?: string[]; workspaceId?: string }
): Promise<{ results: PushResult[]; scheduled_time: string | null }> {
  const db = createServerSupabase();
  const wsId = opts?.workspaceId ?? await getWorkspaceId();

  // Load workspace Meta config (uses per-workspace creds if configured, else env vars)
  const ws = await getWorkspace();
  setMetaConfig(ws.meta_config ?? null);

  // Load the concept with images + translations
  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select("*, source_images(*, image_translations(*))")
    .eq("workspace_id", wsId)
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

  if (!job.landing_page_id) {
    throw new Error("Landing page is required");
  }

  // Prevent duplicate pushes — reject if there's already a push in progress for this concept
  const { data: activePush } = await db
    .from("meta_campaigns")
    .select("id")
    .eq("workspace_id", wsId)
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

  // Load default schedule time from workspace settings (e.g. "03:00")
  let scheduledStartTime: string | null = null;
  const wsSettings = await getWorkspaceSettings();
  const scheduleHHMM = wsSettings.meta_default_schedule_time as string | undefined;
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

  // Get landing page URLs for each language (page A)
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

  // Get landing page B URLs (for A/B page testing)
  const landingUrlByLangB = new Map<string, string>();
  const isPageTest = !!job.landing_page_id_b;

  if (isPageTest) {
    const { data: landingPageBTranslations } = await db
      .from("translations")
      .select("language, published_url")
      .eq("page_id", job.landing_page_id_b)
      .eq("status", "published")
      .not("published_url", "is", null);

    for (const t of landingPageBTranslations ?? []) {
      landingUrlByLangB.set(t.language, t.published_url.trim());
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
        db.from("meta_campaign_mappings").select("meta_campaign_id, template_adset_id").eq("workspace_id", wsId).eq("product", job.product).eq("country", country).eq("format", "image").single(),
        db.from("meta_page_config").select("meta_page_id").eq("workspace_id", wsId).eq("country", country).single(),
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

      const adSetNameBase = `${country} ${numberPrefix}${conceptNumberStr} | statics | ${conceptName}`;
      const hasPageB = isPageTest && landingUrlByLangB.has(lang);
      const adSetName = hasPageB ? `${adSetNameBase} [A]` : adSetNameBase;

      // Check for existing pushed ad set for this concept + language
      // If found, add new images to it instead of creating a new ad set
      const { data: existingCampaign } = await db
        .from("meta_campaigns")
        .select("id, meta_adset_id, meta_ads(image_url)")
        .eq("workspace_id", wsId)
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
            workspace_id: wsId,
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
        // Phase 1: Upload feed-ratio (4:5) AND 9:16 images in parallel.
        // Both ratios go into asset_feed_spec without labels/rules —
        // Meta's "Adapt to Placement" automatically selects the right ratio
        // (4:5 for feed, 9:16 for stories/reels).
        const uploadResults = await Promise.allSettled(
          langImages.map(async (img) => {
            const imgFeed = await withRetry(() => uploadImage(img.image_url));

            // Look up 9:16 sibling for this source image + language
            const key9x16 = `${img.source_image_id}:${lang}`;
            const url9x16 = siblings9x16.get(key9x16) ?? null;
            let hash9x16: string | null = null;
            if (url9x16) {
              const img9x16 = await withRetry(() => uploadImage(url9x16));
              hash9x16 = img9x16.hash;
            }

            return { imageHash: imgFeed.hash, imageUrl: img.image_url, hash9x16, url9x16 };
          })
        );

        // Collect successful uploads
        const uploadedImages: Array<{
          hash: string;
          url: string;
          hash9x16: string | null;
          url9x16: string | null;
        }> = [];
        for (const r of uploadResults) {
          if (r.status === "fulfilled") {
            uploadedImages.push({
              hash: r.value.imageHash,
              url: r.value.imageUrl,
              hash9x16: r.value.hash9x16,
              url9x16: r.value.url9x16,
            });
          }
        }

        if (uploadedImages.length === 0) {
          throw new Error("All image uploads failed");
        }

        // Phase 2: Create ONE DCO creative with all images (4:5 + 9:16) + all copy variants.
        // No asset_customization_rules — Meta's "Adapt to Placement" automatically
        // selects 4:5 for feed and 9:16 for stories/reels.
        const adName = adSetName;
        const urlTags = `utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}&utm_term=${encodeURIComponent(new URL(landingUrl!).pathname.replace(/^\/|\/$/g, ""))}`;

        // Combine 4:5 and 9:16 hashes — Meta picks the best ratio per placement
        const allImageHashes: Array<{ hash: string }> = [];
        for (const img of uploadedImages) {
          allImageHashes.push({ hash: img.hash }); // 4:5
          if (img.hash9x16) {
            allImageHashes.push({ hash: img.hash9x16 }); // 9:16
          }
        }

        const creative = await withRetry(() => createAdCreative({
          name: adName,
          images: allImageHashes,
          bodies: translatedPrimaries,
          titles: translatedHeadlines.length > 0 ? translatedHeadlines : undefined,
          linkUrl: landingUrl,
          pageId: pageConfig?.meta_page_id,
        }));

        // Phase 3: Create ONE ad for the DCO creative
        const metaAd = await withRetry(() => createAd({
          name: adName,
          adSetId,
          creativeId: creative.id,
          status: "ACTIVE",
          urlTags,
        }));

        // Store meta_ads row
        await db.from("meta_ads").insert({
          campaign_id: campaignId,
          name: adName,
          image_url: uploadedImages[0].url,
          image_url_9x16: uploadedImages[0].url9x16,
          image_urls: uploadedImages.map((img) => img.url),
          meta_image_hash: uploadedImages[0].hash,
          meta_image_hash_9x16: uploadedImages[0].hash9x16 ?? null,
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

        await db
          .from("meta_campaigns")
          .update({
            status: "pushed",
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaignId);

        // ── Page Test: Create ad set B for the second landing page ──
        if (hasPageB && !isAddingToExisting) {
          const landingUrlB = landingUrlByLangB.get(lang)!;
          const adSetNameB = `${adSetNameBase} [B]`;

          // Create a new ad set from template for page B
          const templateConfigB = await getAdSetConfig(mapping.template_adset_id);
          const newAdSetB = await createAdSetFromTemplate({
            templateConfig: templateConfigB,
            name: adSetNameB,
            isDynamicCreative: true,
            startTime: scheduledStartTime || undefined,
          });

          const { data: newCampaignB } = await db
            .from("meta_campaigns")
            .insert({
              workspace_id: wsId,
              name: adSetNameB,
              product: job.product,
              image_job_id: jobId,
              meta_campaign_id: mapping.meta_campaign_id,
              meta_adset_id: newAdSetB.id,
              objective: "OUTCOME_TRAFFIC",
              countries: [country],
              language: lang,
              daily_budget: 0,
              status: "pushing",
              start_time: scheduledStartTime,
            })
            .select()
            .single();

          if (!newCampaignB) throw new Error("Failed to create campaign record for page B");

          // Reuse the same uploaded images — create a new creative pointing to page B
          const urlTagsB = `utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}&utm_term=${encodeURIComponent(new URL(landingUrlB).pathname.replace(/^\/|\/$/g, ""))}`;

          const allImageHashesB: Array<{ hash: string }> = [];
          for (const img of uploadedImages) {
            allImageHashesB.push({ hash: img.hash });
            if (img.hash9x16) {
              allImageHashesB.push({ hash: img.hash9x16 });
            }
          }

          const creativeB = await withRetry(() => createAdCreative({
            name: adSetNameB,
            images: allImageHashesB,
            bodies: translatedPrimaries,
            titles: translatedHeadlines.length > 0 ? translatedHeadlines : undefined,
            linkUrl: landingUrlB,
            pageId: pageConfig?.meta_page_id,
          }));

          const metaAdB = await withRetry(() => createAd({
            name: adSetNameB,
            adSetId: newAdSetB.id,
            creativeId: creativeB.id,
            status: "ACTIVE",
            urlTags: urlTagsB,
          }));

          // Store meta_ads row for page B
          await db.from("meta_ads").insert({
            campaign_id: newCampaignB.id,
            name: adSetNameB,
            image_url: uploadedImages[0].url,
            image_url_9x16: uploadedImages[0].url9x16,
            image_urls: uploadedImages.map((img) => img.url),
            meta_image_hash: uploadedImages[0].hash,
            meta_image_hash_9x16: uploadedImages[0].hash9x16 ?? null,
            ad_copy: translatedPrimaries[0],
            headline: translatedHeadlines[0] || null,
            source_primary_text: JSON.stringify(primaryTexts),
            source_headline: JSON.stringify(headlineTexts),
            landing_page_url: landingUrlB,
            aspect_ratio: feedRatio,
            variation_index: 0,
            meta_creative_id: creativeB.id,
            meta_ad_id: metaAdB.id,
            status: "pushed",
          });

          await db.from("meta_campaigns").update({
            status: "pushed",
            error_message: null,
            updated_at: new Date().toISOString(),
          }).eq("id", newCampaignB.id);

          // Create page test record + link ad sets
          const testName = `${conceptName} — page test`;
          const { data: existingTest } = await db
            .from("page_tests")
            .select("id")
            .eq("workspace_id", wsId)
            .eq("image_job_id", jobId)
            .eq("page_a_id", job.landing_page_id)
            .eq("page_b_id", job.landing_page_id_b)
            .limit(1)
            .single();

          let pageTestId: string;
          if (existingTest) {
            pageTestId = existingTest.id;
          } else {
            const { data: newTest } = await db
              .from("page_tests")
              .insert({
                workspace_id: wsId,
                name: testName,
                image_job_id: jobId,
                page_a_id: job.landing_page_id,
                page_b_id: job.landing_page_id_b,
              })
              .select("id")
              .single();
            pageTestId = newTest!.id;
          }

          // Link both ad sets to the page test
          await db.from("page_test_adsets").insert([
            {
              page_test_id: pageTestId,
              variant: "a",
              meta_campaign_record_id: campaignId,
              meta_adset_id: adSetId,
              language: lang,
              country,
            },
            {
              page_test_id: pageTestId,
              variant: "b",
              meta_campaign_record_id: newCampaignB.id,
              meta_adset_id: newAdSetB.id,
              language: lang,
              country,
            },
          ]);
        }
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
