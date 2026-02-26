import { ApifyClient } from "apify-client";

const ACTOR_ID = "JJghSZmShuco4j9gJ";

function getClient() {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  return new ApifyClient({ token });
}

/**
 * Start an Apify Meta Ad Library scrape for a given Ad Library URL.
 * Returns the run ID for polling.
 */
export async function startScrape(
  adLibraryUrl: string,
  maxAds = 20
): Promise<string> {
  const client = getClient();
  const run = await client.actor(ACTOR_ID).call({
    startUrls: [{ url: adLibraryUrl }],
    resultsLimit: maxAds,
  });
  return run.defaultDatasetId;
}

/**
 * Start scrape and wait for results (blocking).
 * Returns the raw dataset items from Apify.
 */
export async function scrapeAndWait(
  adLibraryUrl: string,
  maxAds = 20
): Promise<ApifyAdItem[]> {
  const client = getClient();
  const run = await client.actor(ACTOR_ID).call(
    {
      startUrls: [{ url: adLibraryUrl }],
      resultsLimit: maxAds,
    },
    { waitSecs: 120 }
  );

  const { items } = await client
    .dataset(run.defaultDatasetId)
    .listItems();

  return items as unknown as ApifyAdItem[];
}

/**
 * Check the status of an Apify run.
 */
export async function getRunStatus(
  runId: string
): Promise<{ status: string; finished: boolean }> {
  const client = getClient();
  const run = await client.run(runId).get();
  if (!run) return { status: "UNKNOWN", finished: true };
  const finished = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(
    run.status
  );
  return { status: run.status, finished };
}

/**
 * Get dataset items from a completed run.
 */
export async function getDatasetItems(
  datasetId: string
): Promise<ApifyAdItem[]> {
  const client = getClient();
  const { items } = await client.dataset(datasetId).listItems();
  return items as unknown as ApifyAdItem[];
}

// --- Types for Apify response ---
// These are approximate — Apify's scraper returns varying fields.
// We store the full raw_data and extract what we need.

export interface ApifyAdItem {
  // Current format (camelCase) fields
  adArchiveID?: string | number;
  adArchiveId?: string | number;
  pageID?: string | number;
  pageId?: string | number;
  pageName?: string;
  isActive?: boolean;
  startDateFormatted?: string;
  endDateFormatted?: string;
  publisherPlatform?: string[];
  impressionsWithIndex?: { impressionsText?: string; impressionsIndex?: number };
  snapshot?: Record<string, unknown>;
  // Legacy format (snake_case) fields
  ad_archive_id?: string;
  id?: string;
  page_id?: string;
  page_name?: string;
  ad_creative_body?: string;
  body?: string;
  ad_creative_link_title?: string;
  title?: string;
  headline?: string;
  ad_creative_link_description?: string;
  description?: string;
  link_url?: string;
  cta_text?: string;
  cta_type?: string;
  image_url?: string;
  video_url?: string;
  video_thumbnail_url?: string;
  thumbnail_url?: string;
  images?: Array<{ url?: string; original_image_url?: string }>;
  videos?: Array<{ video_url?: string; thumbnail_url?: string }>;
  snapshot_url?: string;
  ad_snapshot_url?: string;
  ad_delivery_start_time?: string;
  start_date?: string;
  is_active?: boolean;
  status?: string;
  publisher_platforms?: string[];
  platforms?: string[];
  impressions?: string | { lower_bound?: string; upper_bound?: string };
  // Catch-all
  [key: string]: unknown;
}

/**
 * Normalize an Apify ad item into our database format.
 * Handles both legacy (snake_case) and current (camelCase + snapshot) Apify formats.
 */
export function normalizeApifyAd(
  item: ApifyAdItem,
  rank: number
): {
  meta_ad_id: string;
  headline: string | null;
  body: string | null;
  description: string | null;
  link_url: string | null;
  cta_type: string | null;
  media_type: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  ad_snapshot_url: string | null;
  ad_delivery_start_time: string | null;
  is_active: boolean;
  publisher_platforms: string[] | null;
  impressions_rank: number;
  impressions_label: string | null;
  raw_data: Record<string, unknown>;
} {
  // Current format nests creative data inside a `snapshot` object
  const snap = (item.snapshot as Record<string, unknown>) ?? {};
  const snapBody = snap.body as { text?: string } | null;
  const snapVideos = (snap.videos as Array<{
    videoHdUrl?: string;
    videoSdUrl?: string;
    videoPreviewImageUrl?: string;
  }>) ?? [];
  const snapImages = (snap.images as Array<{
    originalImageUrl?: string;
    resizedImageUrl?: string;
  }>) ?? [];

  // Ad ID — current format uses adArchiveID (camelCase)
  const metaAdId =
    (item.adArchiveID ?? item.adArchiveId ?? item.ad_archive_id ?? item.id)?.toString()
    ?? `unknown-${rank}`;

  // Creative content — try snapshot fields first, fall back to legacy flat fields
  const headline =
    (snap.title as string) ?? item.ad_creative_link_title ?? item.title ?? item.headline ?? null;
  const body =
    snapBody?.text ?? item.ad_creative_body ?? item.body ?? null;
  const description =
    (snap.linkDescription as string) ?? item.ad_creative_link_description ?? item.description ?? null;
  const linkUrl =
    (snap.linkUrl as string) ?? item.link_url ?? null;
  const ctaType =
    (snap.ctaText as string) ?? (snap.ctaType as string) ?? item.cta_text ?? item.cta_type ?? null;

  // Media — determine type and extract URLs
  let mediaType: string | null = null;
  let mediaUrl: string | null = null;
  let thumbnailUrl: string | null = null;

  // Current format: snapshot.displayFormat tells us the type
  const displayFormat = (snap.displayFormat as string)?.toUpperCase();

  // Videos — current format uses camelCase keys inside snapshot.videos[]
  const videoUrl =
    snapVideos[0]?.videoHdUrl ?? snapVideos[0]?.videoSdUrl ??
    item.video_url ?? item.videos?.[0]?.video_url ?? null;
  const videoThumb =
    snapVideos[0]?.videoPreviewImageUrl ??
    item.video_thumbnail_url ?? item.videos?.[0]?.thumbnail_url ?? null;

  // Images — current format uses originalImageUrl / resizedImageUrl
  const imageUrl =
    snapImages[0]?.originalImageUrl ?? snapImages[0]?.resizedImageUrl ??
    item.image_url ?? item.images?.[0]?.original_image_url ?? item.images?.[0]?.url ??
    item.thumbnail_url ?? null;

  if (displayFormat === "VIDEO" || videoUrl) {
    mediaType = "video";
    mediaUrl = videoUrl;
    thumbnailUrl = videoThumb ?? imageUrl;
  } else if (displayFormat === "IMAGE" || imageUrl) {
    mediaType = "image";
    mediaUrl = imageUrl;
    thumbnailUrl = imageUrl;
  } else if (displayFormat === "DCO") {
    mediaType = "dco";
  }

  // Snapshot URL (legacy format)
  const snapshotUrl = item.snapshot_url ?? item.ad_snapshot_url ?? null;

  // Dates — current format uses startDateFormatted (ISO string)
  const startTime =
    (item.startDateFormatted as string) ?? item.ad_delivery_start_time ?? item.start_date ?? null;

  // Status — current format uses isActive (boolean)
  const isActive =
    (item.isActive as boolean) ?? item.is_active ??
    (item.status === "ACTIVE" || item.status === "active") ?? true;

  // Platforms — current format uses publisherPlatform (camelCase)
  const platforms =
    (item.publisherPlatform as string[]) ?? item.publisher_platforms ?? item.platforms ?? null;

  // Impressions
  let impressionsLabel: string | null = null;
  const impressionsData = item.impressionsWithIndex as { impressionsText?: string } | null;
  if (impressionsData?.impressionsText) {
    impressionsLabel = impressionsData.impressionsText;
  } else if (typeof item.impressions === "string") {
    impressionsLabel = item.impressions;
  } else if (typeof item.impressions === "object" && item.impressions) {
    const imp = item.impressions as { lower_bound?: string; upper_bound?: string };
    if (imp.lower_bound) {
      impressionsLabel = `${imp.lower_bound}-${imp.upper_bound ?? "?"}`;
    }
  }

  return {
    meta_ad_id: metaAdId,
    headline,
    body,
    description,
    link_url: linkUrl,
    cta_type: ctaType,
    media_type: mediaType,
    media_url: mediaUrl,
    thumbnail_url: thumbnailUrl,
    ad_snapshot_url: snapshotUrl,
    ad_delivery_start_time: startTime,
    is_active: !!isActive,
    publisher_platforms: platforms,
    impressions_rank: rank + 1,
    impressions_label: impressionsLabel,
    raw_data: item as Record<string, unknown>,
  };
}

/**
 * 3-pass deduplication of Apify results.
 * 1. Dedupe by meta_ad_id (exact duplicates)
 * 2. Dedupe by media_url (same creative, different ad ID)
 * 3. Dedupe by headline (A/B test variations)
 * Returns top `maxAds` unique ads.
 */
export function deduplicateAds(
  items: ApifyAdItem[],
  maxAds = 20
): ApifyAdItem[] {
  // Pass 1: by ad_archive_id / id (handles both legacy and current formats)
  const seenIds = new Set<string>();
  const pass1: ApifyAdItem[] = [];
  for (const item of items) {
    const id = (item.adArchiveID ?? item.adArchiveId ?? item.ad_archive_id ?? item.id)?.toString();
    if (!id || !seenIds.has(id)) {
      if (id) seenIds.add(id);
      pass1.push(item);
    }
  }

  // Pass 2: by media URL (handles both snapshot and legacy formats)
  const seenMedia = new Set<string>();
  const pass2: ApifyAdItem[] = [];
  for (const item of pass1) {
    const snap = (item.snapshot as Record<string, unknown>) ?? {};
    const snapVideos = (snap.videos as Array<{ videoHdUrl?: string }>) ?? [];
    const snapImages = (snap.images as Array<{ originalImageUrl?: string }>) ?? [];
    const url =
      snapVideos[0]?.videoHdUrl ??
      snapImages[0]?.originalImageUrl ??
      item.video_url ??
      item.image_url ??
      item.images?.[0]?.original_image_url ??
      item.images?.[0]?.url ??
      null;
    if (!url || !seenMedia.has(url)) {
      if (url) seenMedia.add(url);
      pass2.push(item);
    }
  }

  // Pass 3: by headline (handles both snapshot.title and legacy fields)
  const seenHeadlines = new Set<string>();
  const pass3: ApifyAdItem[] = [];
  for (const item of pass2) {
    const snap = (item.snapshot as Record<string, unknown>) ?? {};
    const h = (
      (snap.title as string) ?? item.ad_creative_link_title ?? item.title ?? item.headline ?? ""
    )
      .toString()
      .trim()
      .toLowerCase();
    if (!h || !seenHeadlines.has(h)) {
      if (h) seenHeadlines.add(h);
      pass3.push(item);
    }
  }

  return pass3.slice(0, maxAds);
}
