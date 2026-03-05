import { createServerSupabase } from "@/lib/supabase";
import { Language, COUNTRY_MAP, VideoTranslation } from "@/types";
import {
  getAdSetConfig,
  createAdSetFromTemplate,
  createAd as metaCreateAd,
} from "@/lib/meta";
import { withRetry, isTransientError } from "@/lib/retry";

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
  const cta = opts.callToAction || "SHOP_NOW";
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
}

/**
 * Create a Meta ad. Video ads are created PAUSED — no image_cropping opt-out
 * needed since there's no image to crop.
 */
export async function createVideoAd(opts: CreateVideoAdOpts): Promise<string> {
  const result = await metaCreateAd({
    name: opts.name,
    adSetId: opts.adSetId,
    creativeId: opts.creativeId,
    status: "PAUSED",
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
}

/**
 * Push a video job to Meta Ads.
 *
 * For each completed video translation (optionally filtered by language):
 *   1. Upload video to Meta
 *   2. Wait for processing
 *   3. Upload thumbnail
 *   4. Create ad creative (video_data)
 *   5. Create ad (PAUSED)
 *   6. Record in meta_ads table
 *   7. 500ms delay between iterations
 *
 * When done, updates video_jobs.status to "live".
 */
export async function pushVideoToMeta(
  videoJobId: string,
  adSetId: string,
  opts?: { languages?: string[]; pageId?: string }
): Promise<VideoPushResult[]> {
  const db = createServerSupabase();

  // Load the video job with translations
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

  // Get ad copy
  const primaryTexts: string[] = (job.ad_copy_primary ?? []).filter((t: string) => t.trim());
  if (primaryTexts.length === 0) {
    throw new Error("At least one primary text is required");
  }
  const headlineTexts: string[] = (job.ad_copy_headline ?? []).filter((t: string) => t.trim());

  const landingPageUrl = job.landing_page_url;
  if (!landingPageUrl) {
    throw new Error("Landing page URL is required");
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

  if (completedTranslations.length === 0) {
    await db
      .from("video_jobs")
      .update({ status: "translated", updated_at: new Date().toISOString() })
      .eq("id", videoJobId);
    throw new Error("No completed video translations to push");
  }

  // Get page config per country for page_id overrides
  const pageConfigs = new Map<string, string>();
  const { data: configs } = await db
    .from("meta_page_config")
    .select("country, meta_page_id");
  for (const c of configs ?? []) {
    pageConfigs.set(c.country, c.meta_page_id);
  }

  // Concept naming
  const conceptNumber = job.concept_number
    ? String(job.concept_number).padStart(3, "0")
    : "000";
  const conceptName = (job.concept_name ?? "video").replace(/^#\d+\s*/, "").toLowerCase();

  const results: VideoPushResult[] = [];

  for (let i = 0; i < completedTranslations.length; i++) {
    const translation = completedTranslations[i];
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

    const pageId = opts?.pageId || pageConfigs.get(country) || undefined;

    // Get thumbnail from the source video (if available)
    const sourceVideo = (job.source_videos ?? []).find(
      (sv: { id: string }) => sv.id === translation.source_video_id
    );
    const thumbnailUrl = sourceVideo?.thumbnail_url ?? null;

    const adName = `${country} #${conceptNumber} | video | ${conceptName} - ${lang}`;

    try {
      // Step 1: Upload video
      const videoId = await uploadVideo(translation.video_url!);

      // Step 2: Wait for processing
      await waitForVideoProcessing(videoId);

      // Step 3: Upload thumbnail (if available)
      let imageHash = "";
      if (thumbnailUrl) {
        imageHash = await uploadThumbnail(thumbnailUrl);
      }

      // Step 4: Create creative
      const primaryText = primaryTexts[0];
      const headline = headlineTexts[0] || "";

      const creativeId = await createVideoCreative({
        name: adName,
        videoId,
        message: primaryText,
        title: headline,
        linkUrl: landingPageUrl,
        imageHash,
        pageId,
      });

      // Step 5: Create ad
      const metaAdId = await createVideoAd({
        name: adName,
        adSetId,
        creativeId,
      });

      // Step 6: Record in meta_ads
      await db.from("meta_ads").insert({
        campaign_id: null,
        name: adName,
        meta_ad_id: metaAdId,
        meta_creative_id: creativeId,
        ad_copy: primaryText,
        headline: headline || null,
        landing_page_url: landingPageUrl,
        status: "pushed",
        video_translation_id: translation.id,
      });

      results.push({
        language: lang,
        country,
        status: "pushed",
        meta_ad_id: metaAdId,
        video_translation_id: translation.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Push failed";

      await db.from("meta_ads").insert({
        campaign_id: null,
        name: adName,
        ad_copy: primaryTexts[0],
        headline: headlineTexts[0] || null,
        landing_page_url: landingPageUrl,
        status: "error",
        error_message: message,
        video_translation_id: translation.id,
      });

      results.push({
        language: lang,
        country,
        status: "error",
        error: message,
        video_translation_id: translation.id,
      });
    }

    // 500ms delay between iterations
    if (i < completedTranslations.length - 1) {
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

  return results;
}
