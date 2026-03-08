import { createServerSupabase } from "@/lib/supabase";
import { Language, COUNTRY_MAP, VideoTranslation, ConceptCopyTranslations } from "@/types";
import {
  getAdSetConfig,
  createAdSetFromTemplate,
  createAd as metaCreateAd,
} from "@/lib/meta";
import { withRetry, isTransientError } from "@/lib/retry";
import { translateAdCopyBatch } from "@/lib/meta-push";

// ---------------------------------------------------------------------------
// Meta API helpers (local copies — video upload uses multipart/form-data which
// the generic metaJson in meta.ts already supports, but we need a longer
// timeout for video uploads and different response shapes)
// ---------------------------------------------------------------------------

const META_API_BASE = "https://graph.facebook.com/v22.0";

function getToken(): string {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN is not set");
  return token;
}

function getAdAccountId(): string {
  const id = process.env.META_AD_ACCOUNT_ID;
  if (!id) throw new Error("META_AD_ACCOUNT_ID is not set");
  return id;
}

function getPageId(): string {
  const id = process.env.META_PAGE_ID;
  if (!id) throw new Error("META_PAGE_ID is not set");
  return id;
}

/** Generic Meta API JSON call with retry, matching the pattern in meta.ts */
async function metaFetchJson<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 30_000
): Promise<T> {
  return withRetry(
    async () => {
      const url = `${META_API_BASE}${path}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${getToken()}`,
          },
        });

        if (!res.ok) {
          let errorMessage = `Meta API error (${res.status})`;
          try {
            const ct = res.headers.get("content-type") ?? "";
            if (ct.includes("application/json")) {
              const data = await res.json();
              const err = data.error;
              const parts = [err?.message, err?.error_user_msg, err?.error_user_title].filter(
                Boolean
              );
              if (err?.error_subcode) parts.push(`(subcode: ${err.error_subcode})`);
              errorMessage = parts.join(" — ") || errorMessage;
            } else {
              const text = await res.text();
              errorMessage = `Meta API error (${res.status}): ${text.slice(0, 200)}`;
            }
          } catch {
            // ignore parse errors
          }
          throw new Error(errorMessage);
        }

        return (await res.json()) as T;
      } finally {
        clearTimeout(timeout);
      }
    },
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );
}

// ---------------------------------------------------------------------------
// Supabase URL validation (same check as meta.ts uploadImage)
// ---------------------------------------------------------------------------

function assertSupabaseUrl(url: string): void {
  try {
    const u = new URL(url);
    const parts = u.hostname.split(".");
    if (!(parts.length === 3 && parts[1] === "supabase" && parts[2] === "co") || u.protocol !== "https:") {
      throw new Error("URL must be from Supabase Storage (https://<project>.supabase.co)");
    }
  } catch (e) {
    if (e instanceof TypeError) throw new Error("Invalid URL");
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 1. Upload video to Meta
// ---------------------------------------------------------------------------

/**
 * Download a video from Supabase Storage and upload it to Meta as an ad video.
 * Uses multipart form upload with the `source` field.
 * Returns the Meta video_id.
 */
export async function uploadVideo(videoUrl: string): Promise<string> {
  assertSupabaseUrl(videoUrl);

  // Download from Supabase
  const dlRes = await withRetry(
    async () => {
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error(`Failed to download video (${res.status})`);
      return res;
    },
    { maxAttempts: 3, initialDelayMs: 1000, isRetryable: isTransientError }
  );

  const buffer = Buffer.from(await dlRes.arrayBuffer());
  const blob = new Blob([buffer], { type: "video/mp4" });

  const form = new FormData();
  form.append("source", blob, "video.mp4");

  // Video uploads can be large — use 120s timeout
  const data = await metaFetchJson<{ id: string }>(
    `/act_${getAdAccountId()}/advideos`,
    { method: "POST", body: form },
    120_000
  );

  return data.id;
}

// ---------------------------------------------------------------------------
// 2. Wait for video processing
// ---------------------------------------------------------------------------

interface VideoStatusResponse {
  status: {
    processing_phase?: {
      status: string;
    };
    video_status?: string;
  };
}

/**
 * Poll Meta until the video finishes processing.
 * Checks every 5 seconds, up to maxWaitMs (default 120s).
 */
export async function waitForVideoProcessing(
  videoId: string,
  maxWaitMs = 120_000
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 5_000;

  while (Date.now() - startTime < maxWaitMs) {
    const data = await metaFetchJson<VideoStatusResponse>(
      `/${videoId}?fields=status`
    );

    const phase = data.status?.processing_phase?.status;
    const videoStatus = data.status?.video_status;

    // Processing complete
    if (phase === "complete" || videoStatus === "ready") {
      return;
    }

    // Error state
    if (phase === "error" || videoStatus === "error") {
      throw new Error(`Video processing failed (phase: ${phase}, status: ${videoStatus})`);
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error(`Video processing timed out after ${maxWaitMs / 1000}s`);
}

// ---------------------------------------------------------------------------
// 3. Upload thumbnail image
// ---------------------------------------------------------------------------

/**
 * Upload a thumbnail image to Meta ad images.
 * Returns the image hash.
 */
export async function uploadThumbnail(thumbnailUrl: string): Promise<string> {
  assertSupabaseUrl(thumbnailUrl);

  const imgRes = await withRetry(
    async () => {
      const res = await fetch(thumbnailUrl);
      if (!res.ok) throw new Error(`Failed to download thumbnail (${res.status})`);
      return res;
    },
    { maxAttempts: 3, initialDelayMs: 1000, isRetryable: isTransientError }
  );

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const base64 = buffer.toString("base64");

  const form = new FormData();
  form.append("bytes", base64);

  const data = await metaFetchJson<{
    images: Record<string, { hash: string; url: string }>;
  }>(`/act_${getAdAccountId()}/adimages`, {
    method: "POST",
    body: form,
  });

  const key = Object.keys(data.images)[0];
  return data.images[key].hash;
}

// ---------------------------------------------------------------------------
// 4. Create video ad creative
// ---------------------------------------------------------------------------

interface CreateVideoCreativeOpts {
  name: string;
  videoId: string;
  message: string;
  title: string;
  linkUrl: string;
  imageHash: string;
  callToAction?: string;
  pageId?: string;
}

/**
 * Create a Meta ad creative using object_story_spec.video_data.
 * Video ads do NOT use dynamic creative — they use a standard creative spec.
 */
export async function createVideoCreative(
  opts: CreateVideoCreativeOpts
): Promise<string> {
  const cta = opts.callToAction || "LEARN_MORE";
  const pageId = opts.pageId || getPageId();

  const data = await metaFetchJson<{ id: string }>(
    `/act_${getAdAccountId()}/adcreatives`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: opts.name,
        object_story_spec: {
          page_id: pageId,
          video_data: {
            video_id: opts.videoId,
            message: opts.message,
            title: opts.title,
            call_to_action: {
              type: cta,
              value: { link: opts.linkUrl },
            },
            image_hash: opts.imageHash,
          },
        },
      }),
    }
  );

  return data.id;
}

// ---------------------------------------------------------------------------
// 5. Create ad (wrapper around meta.ts createAd)
// ---------------------------------------------------------------------------

interface CreateVideoAdOpts {
  name: string;
  adSetId: string;
  creativeId: string;
  status?: string;
  urlTags?: string;
}

/**
 * Create a Meta ad for a video creative.
 * Uses the shared createAd() which applies image_cropping opt-out automatically.
 */
export async function createVideoAd(opts: CreateVideoAdOpts): Promise<string> {
  const result = await metaCreateAd({
    name: opts.name,
    adSetId: opts.adSetId,
    creativeId: opts.creativeId,
    status: opts.status || "PAUSED",
    urlTags: opts.urlTags,
  });
  return result.id;
}

// ---------------------------------------------------------------------------
// 6. Main orchestration: push video job to Meta
// ---------------------------------------------------------------------------

export interface VideoPushResult {
  language: string;
  country: string;
  status: "pushed" | "error";
  error?: string;
  meta_ad_id?: string;
  video_translation_id?: string;
  campaign_id?: string;
}

/**
 * Push a video job to Meta Ads.
 *
 * For each target market/language:
 *   1. Look up campaign mapping (format='video') + page config
 *   2. Create ad set from template
 *   3. Upload video (captioned if available, else raw)
 *   4. Wait for processing
 *   5. Upload thumbnail
 *   6. Create ad creative (video_data) with translated copy
 *   7. Create ad (PAUSED)
 *   8. Record in meta_campaigns + meta_ads tables
 *   9. 500ms delay between iterations
 *
 * When done, updates video_jobs.status to "live".
 */
export async function pushVideoToMeta(
  videoJobId: string,
  opts?: { languages?: string[]; markets?: string[] }
): Promise<{ results: VideoPushResult[] }> {
  const db = createServerSupabase();

  // Load the video job with translations + source videos
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*, video_translations(*), source_videos(*)")
    .eq("id", videoJobId)
    .single();

  if (jobError || !job) {
    throw new Error("Video job not found");
  }

  if (!job.product) {
    throw new Error("Product is required");
  }

  // Get English ad copy (fallback)
  const primaryTexts: string[] = (job.ad_copy_primary ?? []).filter((t: string) => t.trim());
  if (primaryTexts.length === 0) {
    throw new Error("At least one primary text is required");
  }
  const headlineTexts: string[] = (job.ad_copy_headline ?? []).filter((t: string) => t.trim());

  // Landing page: resolve from landing_page_id (per-language URLs) or fall back to landing_page_url
  if (!job.landing_page_id && !job.landing_page_url) {
    throw new Error("Landing page is required (set landing_page_id or landing_page_url)");
  }

  // Get landing page URLs per language
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

  // Auto-assign concept number if not set
  let conceptNumber = job.concept_number;
  if (!conceptNumber) {
    // Query max concept_number from video_jobs for this product, increment
    const { data: maxRow } = await db
      .from("video_jobs")
      .select("concept_number")
      .eq("product", job.product)
      .not("concept_number", "is", null)
      .order("concept_number", { ascending: false })
      .limit(1)
      .single();

    conceptNumber = (maxRow?.concept_number ?? 0) + 1;

    await db
      .from("video_jobs")
      .update({ concept_number: conceptNumber })
      .eq("id", videoJobId);
  }

  const conceptNumberStr = String(conceptNumber).padStart(3, "0");
  // Strip leading "#XXX " prefix from concept name to avoid duplication in ad set name
  const conceptName = (job.concept_name ?? "video").replace(/^#\d+\s*/, "").toLowerCase();

  // Prevent duplicate pushes — reject if there's already a push in progress
  const { data: activePush } = await db
    .from("meta_campaigns")
    .select("id")
    .eq("video_job_id", videoJobId)
    .eq("status", "pushing")
    .limit(1);
  if (activePush && activePush.length > 0) {
    throw new Error("A push is already in progress for this video concept");
  }

  // Update status to pushing
  await db
    .from("video_jobs")
    .update({ status: "pushing", updated_at: new Date().toISOString() })
    .eq("id", videoJobId);

  // Filter translations: completed only, optionally by language
  const allTranslations = (job.video_translations ?? []) as VideoTranslation[];
  const completedTranslations = allTranslations.filter((t) => {
    if (t.status !== "completed" || !t.video_url) return false;
    if (opts?.languages && !opts.languages.includes(t.language)) return false;
    return true;
  });

  // If markets filter provided, also filter by mapped languages
  const LANG_TO_COUNTRY: Record<string, string> = { sv: "SE", da: "DK", no: "NO", de: "DE" };
  const filteredTranslations = opts?.markets
    ? completedTranslations.filter((t) => {
        const country = LANG_TO_COUNTRY[t.language];
        return country && opts.markets!.includes(country);
      })
    : completedTranslations;

  if (filteredTranslations.length === 0) {
    await db
      .from("video_jobs")
      .update({ status: "translated", updated_at: new Date().toISOString() })
      .eq("id", videoJobId);
    throw new Error("No completed video translations to push");
  }

  // Load default schedule time from settings
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
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    scheduledStartTime = scheduled.toISOString();
  }

  const results: VideoPushResult[] = [];

  for (let i = 0; i < filteredTranslations.length; i++) {
    const translation = filteredTranslations[i];
    const lang = translation.language as Language;
    const country = COUNTRY_MAP[lang];

    if (!country) {
      results.push({
        language: lang,
        country: "??",
        status: "error",
        error: `No country mapping for ${lang}`,
        video_translation_id: translation.id,
      });
      continue;
    }

    // Look up campaign mapping + page config
    const [{ data: mapping }, { data: pageConfig }] = await Promise.all([
      db.from("meta_campaign_mappings").select("meta_campaign_id, template_adset_id").eq("product", job.product).eq("country", country).eq("format", "video").single(),
      db.from("meta_page_config").select("meta_page_id").eq("country", country).single(),
    ]);

    if (!mapping?.meta_campaign_id) {
      results.push({
        language: lang,
        country,
        status: "error",
        error: `No video campaign mapping for ${job.product}/${country}. Configure in Settings.`,
        video_translation_id: translation.id,
      });
      continue;
    }

    // Resolve landing page URL
    const landingUrl = landingUrlByLang.get(lang) || job.landing_page_url;
    if (!landingUrl) {
      results.push({
        language: lang,
        country,
        status: "error",
        error: `No landing page URL for ${lang}`,
        video_translation_id: translation.id,
      });
      continue;
    }

    // Get translated ad copy: prefer pre-translated, fall back to on-the-fly translation
    const preTranslated = (job.ad_copy_translations as ConceptCopyTranslations)?.[lang];
    let translatedPrimary: string;
    let translatedHeadline: string;

    if (preTranslated?.status === "completed" && preTranslated.primary_texts.length > 0) {
      translatedPrimary = preTranslated.primary_texts[0];
      translatedHeadline = preTranslated.headlines[0] || "";
    } else {
      // Translate on the fly
      const result = await translateAdCopyBatch(primaryTexts, headlineTexts, lang, db);
      translatedPrimary = result.translatedPrimaries[0];
      translatedHeadline = result.translatedHeadlines[0] || "";
    }

    // Use captioned video URL when available, otherwise fall back to raw video
    const videoUrl = translation.captioned_video_url || translation.video_url!;

    // Get thumbnail from the source video (if available)
    const sourceVideo = (job.source_videos ?? []).find(
      (sv: { id: string }) => sv.id === translation.source_video_id
    );
    const thumbnailUrl = sourceVideo?.thumbnail_url ?? null;

    const adSetName = `${country} #${conceptNumberStr} | video | ${conceptName}`;
    const adName = `${adSetName} - ${lang}`;

    try {
      // Create ad set from template (NOT dynamic creative — video ads use standard creative)
      let adSetId: string;

      if (mapping.template_adset_id) {
        const templateConfig = await getAdSetConfig(mapping.template_adset_id);
        const newAdSet = await createAdSetFromTemplate({
          templateConfig,
          name: adSetName,
          isDynamicCreative: false,
          startTime: scheduledStartTime || undefined,
        });
        adSetId = newAdSet.id;
      } else {
        // No template — create a basic ad set under the campaign
        const adSetRes = await metaFetchJson<{ id: string }>(
          `/act_${getAdAccountId()}/adsets`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: adSetName,
              campaign_id: mapping.meta_campaign_id,
              billing_event: "IMPRESSIONS",
              optimization_goal: "LINK_CLICKS",
              targeting: { geo_locations: { countries: [country] } },
              start_time: scheduledStartTime || new Date().toISOString(),
              status: scheduledStartTime ? "ACTIVE" : "PAUSED",
            }),
          }
        );
        adSetId = adSetRes.id;
      }

      // Record in meta_campaigns table
      const { data: newCampaign } = await db
        .from("meta_campaigns")
        .insert({
          name: adSetName,
          product: job.product,
          video_job_id: videoJobId,
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
      const campaignId = newCampaign.id;

      try {
        // Step 1: Upload video
        const metaVideoId = await uploadVideo(videoUrl);

        // Step 2: Wait for processing
        await waitForVideoProcessing(metaVideoId);

        // Step 3: Upload thumbnail (required by Meta)
        let imageHash = "";
        if (thumbnailUrl) {
          imageHash = await uploadThumbnail(thumbnailUrl);
        } else {
          // No thumbnail from source — use Meta's auto-generated video thumbnail
          const { picture } = await metaFetchJson<{ picture: string }>(
            `/${metaVideoId}?fields=picture`
          );
          if (picture) {
            // Download Meta's thumbnail and upload as ad image
            const thumbRes = await fetch(picture);
            if (thumbRes.ok) {
              const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
              const base64 = thumbBuffer.toString("base64");
              const form = new FormData();
              form.append("bytes", base64);
              const imgData = await metaFetchJson<{
                images: Record<string, { hash: string }>;
              }>(`/act_${getAdAccountId()}/adimages`, {
                method: "POST",
                body: form,
              });
              const key = Object.keys(imgData.images)[0];
              imageHash = imgData.images[key].hash;
            }
          }
          if (!imageHash) {
            throw new Error("No thumbnail available — upload a thumbnail or ensure video processing completes");
          }
        }

        // Step 4: Create creative with translated copy
        const pageId = pageConfig?.meta_page_id || undefined;

        const creativeId = await createVideoCreative({
          name: adName,
          videoId: metaVideoId,
          message: translatedPrimary,
          title: translatedHeadline,
          linkUrl: landingUrl,
          imageHash,
          pageId,
        });

        // Step 5: Create ad (ACTIVE + UTM tags, matching image ad flow)
        const metaAdId = await createVideoAd({
          name: adName,
          adSetId,
          creativeId,
          status: "ACTIVE",
          urlTags: `utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}&utm_term=${encodeURIComponent(new URL(landingUrl).pathname.replace(/^\/|\/$/g, ""))}`,
        });

        // Step 6: Record in meta_ads
        await db.from("meta_ads").insert({
          campaign_id: campaignId,
          name: adName,
          meta_ad_id: metaAdId,
          meta_creative_id: creativeId,
          ad_copy: translatedPrimary,
          headline: translatedHeadline || null,
          landing_page_url: landingUrl,
          status: "pushed",
          video_translation_id: translation.id,
        });

        // Mark campaign as pushed
        await db
          .from("meta_campaigns")
          .update({
            status: "pushed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaignId);

        results.push({
          language: lang,
          country,
          status: "pushed",
          meta_ad_id: metaAdId,
          video_translation_id: translation.id,
          campaign_id: campaignId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Push failed";

        await db.from("meta_ads").insert({
          campaign_id: campaignId,
          name: adName,
          ad_copy: translatedPrimary,
          headline: translatedHeadline || null,
          landing_page_url: landingUrl,
          status: "error",
          error_message: message,
          video_translation_id: translation.id,
        });

        await db
          .from("meta_campaigns")
          .update({
            status: "error",
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaignId);

        results.push({
          language: lang,
          country,
          status: "error",
          error: message,
          video_translation_id: translation.id,
          campaign_id: campaignId,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Push failed";
      results.push({
        language: lang,
        country,
        status: "error",
        error: message,
        video_translation_id: translation.id,
      });
    }

    // 500ms delay between iterations
    if (i < filteredTranslations.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Update job status
  const hasSuccess = results.some((r) => r.status === "pushed");
  await db
    .from("video_jobs")
    .update({
      status: hasSuccess ? "live" : "translated",
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoJobId);

  return { results };
}
