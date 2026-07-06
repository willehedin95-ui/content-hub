import { AsyncLocalStorage } from "node:async_hooks";
import { withRetry, isTransientError } from "./retry";
import type { WorkspaceMetaConfig } from "@/types";

const META_API_BASE = "https://graph.facebook.com/v22.0";
const META_FETCH_TIMEOUT_MS = 30_000;

// Per-request workspace Meta config override (set before calling Meta functions)
let _wsMetaConfig: WorkspaceMetaConfig | null = null;

// Request-scoped config: immune to concurrent setMetaConfig calls from other
// requests sharing the Node instance. Money-writing paths (ad pushes, crons
// that loop workspaces) MUST use runWithMetaConfig; the module global remains
// as a fallback for legacy read-only routes.
const metaConfigALS = new AsyncLocalStorage<WorkspaceMetaConfig | null>();

/** Set workspace Meta config for subsequent API calls. Call with null to clear. */
export function setMetaConfig(config: WorkspaceMetaConfig | null): void {
  _wsMetaConfig = config;
}

/** Run fn with a request-scoped Meta config that concurrent requests cannot clobber. */
export function runWithMetaConfig<T>(config: WorkspaceMetaConfig | null, fn: () => Promise<T>): Promise<T> {
  return metaConfigALS.run(config, fn);
}

function activeConfig(): WorkspaceMetaConfig | null {
  const scoped = metaConfigALS.getStore();
  return scoped !== undefined ? scoped : _wsMetaConfig;
}

export function getToken(): string {
  const token = activeConfig()?.system_user_token || process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN is not set");
  return token;
}

export function getAdAccountId(): string {
  const id = activeConfig()?.ad_account_id || process.env.META_AD_ACCOUNT_ID;
  if (!id) throw new Error("META_AD_ACCOUNT_ID is not set");
  return id;
}

export function getPageId(): string {
  const id = activeConfig()?.page_id || process.env.META_PAGE_ID;
  if (!id) throw new Error("META_PAGE_ID is not set");
  return id;
}

async function metaFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${META_API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${getToken()}`,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Retryable check for MUTATING calls (create ad/adset/creative/campaign).
 * Only retry when Meta definitively REJECTED the request (rate limit) — a
 * timeout, abort, or 5xx has an uncertain outcome: the object may have been
 * created server-side, and a retry then creates a duplicate ACTIVE ad.
 */
function isRetryableMutation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return /\b429\b/.test(error.message) || msg.includes("rate limit") || msg.includes("too many requests");
}

async function metaJsonMutating<T>(path: string, options: RequestInit = {}): Promise<T> {
  return metaJsonWith<T>(path, options, isRetryableMutation);
}

async function metaJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  return metaJsonWith<T>(path, options, isTransientError);
}

async function metaJsonWith<T>(path: string, options: RequestInit, isRetryable: (e: unknown) => boolean): Promise<T> {
  return withRetry(
    async () => {
      const res = await metaFetch(path, options);

      if (!res.ok) {
        // Try to parse error body for a message, but don't crash on HTML/non-JSON responses
        let errorMessage = `Meta API error (${res.status})`;
        try {
          const contentType = res.headers.get("content-type") ?? "";
          if (contentType.includes("application/json")) {
            const data = await res.json();
            const err = data.error;
            // Include detailed error info from Meta's response
            const parts = [err?.message, err?.error_user_msg, err?.error_user_title]
              .filter(Boolean);
            if (err?.error_subcode) parts.push(`(subcode: ${err.error_subcode})`);
            errorMessage = parts.join(" — ") || errorMessage;
          } else {
            const text = await res.text();
            errorMessage = `Meta API error (${res.status}): ${text.slice(0, 200)}`;
          }
        } catch {
          // Ignore parse errors — use the generic message
        }
        throw new Error(errorMessage);
      }

      return (await res.json()) as T;
    },
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable }
  );
}

interface MetaPaginatedResponse<T> {
  data: T[];
  paging?: { next?: string };
}

async function metaJsonPaginated<T>(path: string, maxPages = 10): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = path;

  for (let page = 0; url && page < maxPages; page++) {
    const resp: MetaPaginatedResponse<T> = await metaJson(url);
    results.push(...resp.data);
    // Meta returns full URLs for pagination — strip the base to use with metaJson
    const nextUrl = resp.paging?.next;
    if (!nextUrl) break;
    // Handle both exact match and URL-encoded variants
    if (nextUrl.startsWith(META_API_BASE)) {
      url = nextUrl.slice(META_API_BASE.length);
    } else if (nextUrl.startsWith("https://graph.facebook.com")) {
      // Different version or format — extract path after the domain+version
      const parsed = new URL(nextUrl);
      url = parsed.pathname.replace(/^\/v[\d.]+/, "") + parsed.search;
    } else {
      url = nextUrl;
    }
  }

  return results;
}

export async function listCampaigns(): Promise<
  Array<{ id: string; name: string; status: string; objective: string }>
> {
  const all = await metaJsonPaginated<{ id: string; name: string; status: string; objective: string }>(
    `/act_${getAdAccountId()}/campaigns?fields=id,name,status,objective&limit=50`
  );
  return all.filter((c) => c.status === "ACTIVE");
}

export async function verifyConnection(): Promise<{
  name: string;
  account_status: number;
  id: string;
}> {
  return metaJson(`/act_${getAdAccountId()}?fields=name,account_status,id`);
}

export async function uploadImage(imageUrl: string): Promise<{ hash: string; url: string }> {
  // Only allow downloads from our Supabase Storage domain (exact <project>.supabase.co)
  try {
    const u = new URL(imageUrl);
    const parts = u.hostname.split(".");
    if (!(parts.length === 3 && parts[1] === "supabase" && parts[2] === "co") || u.protocol !== "https:") {
      throw new Error("Image URL must be from Supabase Storage (https://<project>.supabase.co)");
    }
  } catch (e) {
    if (e instanceof TypeError) throw new Error("Invalid image URL");
    throw e;
  }

  const imgRes = await withRetry(
    async () => {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Failed to download image (${res.status})`);
      return res;
    },
    { maxAttempts: 3, initialDelayMs: 1000, isRetryable: isTransientError }
  );
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const base64 = buffer.toString("base64");

  const form = new FormData();
  form.append("bytes", base64);

  const data = await metaJson<{
    images: Record<string, { hash: string; url: string }>;
  }>(`/act_${getAdAccountId()}/adimages`, {
    method: "POST",
    body: form,
  });

  const key = Object.keys(data.images)[0];
  return { hash: data.images[key].hash, url: data.images[key].url };
}

export async function createCampaign(params: {
  name: string;
  objective: string;
  status?: string;
}): Promise<{ id: string }> {
  return metaJsonMutating(`/act_${getAdAccountId()}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      objective: params.objective,
      status: params.status || "PAUSED",
      special_ad_categories: [],
    }),
  });
}

export async function createAdSet(params: {
  name: string;
  campaignId: string;
  dailyBudget: number;
  countries: string[];
  optimizationGoal?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
}): Promise<{ id: string }> {
  return metaJsonMutating(`/act_${getAdAccountId()}/adsets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      campaign_id: params.campaignId,
      daily_budget: params.dailyBudget,
      billing_event: "IMPRESSIONS",
      optimization_goal: params.optimizationGoal || "LINK_CLICKS",
      targeting: { geo_locations: { countries: params.countries } },
      start_time: params.startTime || new Date().toISOString(),
      end_time: params.endTime || undefined,
      status: params.status || "PAUSED",
    }),
  });
}

export async function listPages(): Promise<
  Array<{ id: string; name: string }>
> {
  return metaJsonPaginated<{ id: string; name: string }>(
    `/me/accounts?fields=id,name&limit=50`
  );
}

/**
 * Create a DCO ad creative with images and copy variants.
 *
 * When `assetCustomizationRules` is provided, images can carry labels and
 * rules route labeled images to specific placements (e.g. 4:5 → feed,
 * 9:16 → stories/reels). Note: titles limited to 1 with rules (Meta
 * rejects multiple unlabeled titles, subcode 1885878).
 */
export async function createAdCreative(params: {
  name: string;
  images: Array<{ hash: string; label?: string }>;
  bodies: string[];
  titles?: string[];
  linkUrl: string;
  callToAction?: string;
  pageId?: string;
  instagramUserId?: string;
  assetCustomizationRules?: Array<{
    customization_spec: Record<string, unknown>;
    image_label: { name: string };
  }>;
}): Promise<{ id: string }> {
  const cta = params.callToAction || "LEARN_MORE";
  const pageId = params.pageId || getPageId();
  const usePacRules = !!(params.assetCustomizationRules && params.assetCustomizationRules.length > 0);

  // SINGLE-IMAGE NON-DCO PATH (no PAC rules):
  // Build a traditional creative with object_story_spec.link_data instead of
  // asset_feed_spec. asset_feed_spec is treated as dynamic-creative content by
  // Meta even with one of each field, and gets rejected by non-DCO ad sets
  // (subcode 1885998 "Annonser med dynamiskt innehåll kan bara skapas i
  // annonsuppsättningar med dynamiskt innehåll"). asset_feed_spec is still
  // used when PAC rules are present, since rules require it.
  if (!usePacRules && params.images.length === 1) {
    const linkData: Record<string, unknown> = {
      link: params.linkUrl,
      image_hash: params.images[0].hash,
      message: params.bodies[0] ?? "",
      call_to_action: { type: cta, value: { link: params.linkUrl } },
    };
    if (params.titles && params.titles[0]) {
      linkData.name = params.titles[0];
    }

    const objectStorySpec: Record<string, unknown> = {
      page_id: pageId,
      link_data: linkData,
      ...(params.instagramUserId ? { instagram_user_id: params.instagramUserId } : {}),
    };

    // If multiple body/title variations exist, add asset_feed_spec WITHOUT
    // images/link_urls so Meta rotates copy only (still non-DCO compatible).
    const hasCopyVariations =
      params.bodies.length > 1 || (params.titles && params.titles.length > 1);
    const assetFeedSpec: Record<string, unknown> | undefined = hasCopyVariations
      ? {
          bodies: params.bodies.map((text) => ({ text })),
          titles: params.titles && params.titles.length > 0
            ? params.titles.map((text) => ({ text }))
            : undefined,
          optimization_type: "DEGREES_OF_FREEDOM",
        }
      : undefined;

    return metaJsonMutating(`/act_${getAdAccountId()}/adcreatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: params.name,
        object_story_spec: objectStorySpec,
        ...(assetFeedSpec ? { asset_feed_spec: assetFeedSpec } : {}),
      }),
    });
  }

  // PAC-rules path: keep asset_feed_spec with multiple images + labels.
  const images = params.images.map((img) => {
    if (img.label) {
      return { hash: img.hash, adlabels: [{ name: img.label }] };
    }
    return { hash: img.hash };
  });

  const assetFeedSpec: Record<string, unknown> = {
    ad_formats: ["SINGLE_IMAGE"],
    images,
    bodies: params.bodies.map((text) => ({ text })),
    titles: params.titles && params.titles.length > 0
      ? params.titles.map((text) => ({ text }))
      : undefined,
    link_urls: [{ website_url: params.linkUrl }],
    call_to_action_types: [cta],
  };

  if (params.assetCustomizationRules && params.assetCustomizationRules.length > 0) {
    assetFeedSpec.asset_customization_rules = params.assetCustomizationRules;
  }

  return metaJsonMutating(`/act_${getAdAccountId()}/adcreatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      object_story_spec: {
        page_id: pageId,
        ...(params.instagramUserId ? { instagram_user_id: params.instagramUserId } : {}),
      },
      asset_feed_spec: assetFeedSpec,
    }),
  });
}

export async function duplicateAdSet(adSetId: string): Promise<{ copied_adset_id: string }> {
  return metaJsonMutating(`/${adSetId}/copies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status_option: "PAUSED",
    }),
  });
}

export async function updateAdSet(adSetId: string, params: { name?: string; start_time?: string; status?: string }): Promise<{ success: boolean }> {
  return metaJson(`/${adSetId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function updateCampaign(campaignId: string, params: { daily_budget?: string; name?: string; status?: string }): Promise<{ success: boolean }> {
  return metaJson(`/${campaignId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function updateAd(adId: string, params: { status?: string; name?: string }): Promise<{ success: boolean }> {
  return metaJson(`/${adId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

/**
 * Pause an ad set AND all ads within it.
 * Prevents killed ad sets from showing ads as "active" in Meta Ads Manager.
 *
 * 2026-04-16: This used to swallow errors silently (console.error only), which
 * meant partial failures looked like a clean kill to callers. Now we collect
 * errors and throw if anything after the initial ad-set pause fails, so the
 * caller can record the failure + alert the user. The ad set itself IS paused
 * before any throw, so the primary kill action always takes effect.
 * See resilience-audit-2026-04-16.md (P0-4).
 */
export async function pauseAdSetAndAds(adSetId: string): Promise<void> {
  // Primary action: pause the ad set. If this fails, the whole kill failed.
  await updateAdSet(adSetId, { status: "PAUSED" });

  // Secondary: pause all still-active ads so they don't appear "active" in
  // Ads Manager. Collect errors instead of silently logging.
  const errors: string[] = [];

  let ads: Array<{ id: string; status: string; name?: string }>;
  try {
    ads = await listAdsInAdSet(adSetId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Ad set ${adSetId} paused, but failed to list ads for cleanup: ${msg}`
    );
  }

  for (const ad of ads) {
    if (ad.status !== "PAUSED" && ad.status !== "DELETED") {
      try {
        await updateAd(ad.id, { status: "PAUSED" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`ad ${ad.id}: ${msg}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Ad set ${adSetId} paused, but ${errors.length} ad(s) remained active: ${errors.join("; ")}`
    );
  }
}

/**
 * Mirror of pauseAdSetAndAds: re-activate an ad set and its paused ads.
 * Used when a re-push completes into an ad set that a crashed previous push
 * paused — without this the re-push reports "pushed" but nothing delivers.
 */
export async function activateAdSetAndAds(adSetId: string): Promise<void> {
  await updateAdSet(adSetId, { status: "ACTIVE" });

  const errors: string[] = [];
  let ads: Array<{ id: string; status: string; name?: string }>;
  try {
    ads = await listAdsInAdSet(adSetId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Ad set ${adSetId} activated, but failed to list ads: ${msg}`);
  }

  for (const ad of ads) {
    if (ad.status === "PAUSED") {
      try {
        await updateAd(ad.id, { status: "ACTIVE" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`ad ${ad.id}: ${msg}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Ad set ${adSetId} activated, but ${errors.length} ad(s) remained paused: ${errors.join("; ")}`
    );
  }
}

/**
 * Batch-fetch effective_status for many ad sets in a single Meta call.
 * Uses the Graph API's ?ids= multi-read endpoint (max 50 IDs per call).
 * Returns a Map of ad_set_id -> effective_status. IDs that fail to read
 * are simply omitted (callers should treat missing as "unknown").
 */
export async function getAdSetStatuses(
  adSetIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (adSetIds.length === 0) return result;

  const CHUNK = 50;
  for (let i = 0; i < adSetIds.length; i += CHUNK) {
    const chunk = adSetIds.slice(i, i + CHUNK);
    try {
      const data = await metaJson<Record<string, { id: string; effective_status?: string; status?: string }>>(
        `/?ids=${chunk.join(",")}&fields=id,effective_status,status`,
      );
      for (const [id, info] of Object.entries(data)) {
        const status = info.effective_status ?? info.status;
        if (status) result.set(id, status);
      }
    } catch (err) {
      console.error(`[getAdSetStatuses] Batch failed:`, err);
    }
  }

  return result;
}

interface AdSetTemplateConfig {
  campaign_id: string;
  billing_event: string;
  optimization_goal: string;
  targeting: Record<string, unknown>;
  promoted_object?: Record<string, unknown>;
  attribution_spec?: Array<Record<string, unknown>>;
  bid_strategy?: string;
  bid_amount?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  dsa_beneficiary?: string;
  dsa_payor?: string;
}

/**
 * Fetch a template ad set's config so we can create new ad sets with the same settings.
 */
export async function getAdSetConfig(adSetId: string): Promise<AdSetTemplateConfig> {
  return metaJson(`/${adSetId}?fields=campaign_id,billing_event,optimization_goal,targeting,promoted_object,attribution_spec,bid_strategy,bid_amount,daily_budget,lifetime_budget,dsa_beneficiary,dsa_payor`);
}

/**
 * Create a new ad set from scratch using a template's config.
 * Uses is_dynamic_creative=false for PAC (placement asset customization) rules.
 * Meta's is_dynamic_creative can only be set at creation time, not updated later.
 * No publisher_platforms override — Meta uses Advantage+ placements (all platforms).
 */
export async function createAdSetFromTemplate(params: {
  templateConfig: AdSetTemplateConfig;
  name: string;
  isDynamicCreative?: boolean;
  startTime?: string;
}): Promise<{ id: string }> {
  const cfg = params.templateConfig;

  // Only pass budget if the template has one set at ad-set level.
  // CBO campaigns manage budget at campaign level — ad sets have no budget.
  const budgetFields: Record<string, string> = {};
  if (cfg.daily_budget && Number(cfg.daily_budget) > 0) {
    budgetFields.daily_budget = cfg.daily_budget;
  } else if (cfg.lifetime_budget && Number(cfg.lifetime_budget) > 0) {
    budgetFields.lifetime_budget = cfg.lifetime_budget;
  }

  return metaJsonMutating(`/act_${getAdAccountId()}/adsets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      campaign_id: cfg.campaign_id,
      billing_event: cfg.billing_event,
      optimization_goal: cfg.optimization_goal,
      // Use template targeting as-is — no publisher_platforms override.
      // Meta defaults to Advantage+ placements (all platforms including Instagram).
      targeting: cfg.targeting,
      promoted_object: cfg.promoted_object,
      attribution_spec: cfg.attribution_spec,
      bid_strategy: cfg.bid_strategy,
      ...(cfg.bid_amount ? { bid_amount: cfg.bid_amount } : {}),
      ...budgetFields,
      is_dynamic_creative: params.isDynamicCreative || false,
      start_time: params.startTime || new Date().toISOString(),
      status: params.startTime ? "ACTIVE" : "PAUSED",
      ...(cfg.dsa_beneficiary ? { dsa_beneficiary: cfg.dsa_beneficiary } : {}),
      ...(cfg.dsa_payor ? { dsa_payor: cfg.dsa_payor } : {}),
    }),
  });
}

export async function listAdSets(campaignId: string): Promise<
  Array<{ id: string; name: string; status: string; effective_status?: string }>
> {
  return metaJsonPaginated<{ id: string; name: string; status: string; effective_status?: string }>(
    `/${campaignId}/adsets?fields=id,name,status,effective_status&limit=50`
  );
}

export async function listAdsInAdSet(adSetId: string): Promise<
  Array<{ id: string; name: string; status: string; effective_status?: string }>
> {
  return metaJsonPaginated<{ id: string; name: string; status: string; effective_status?: string }>(
    `/${adSetId}/ads?fields=id,name,status,effective_status&limit=50`
  );
}

export async function createAd(params: {
  name: string;
  adSetId: string;
  creativeId: string;
  status?: string;
  urlTags?: string;
}): Promise<{ id: string }> {
  return metaJsonMutating(`/act_${getAdAccountId()}/ads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      adset_id: params.adSetId,
      creative: { creative_id: params.creativeId },
      status: params.status || "PAUSED",
      // No creative_features_spec needed — placement asset customization rules
      // route the correct aspect ratio image to each placement (4:5→feed, 9:16→stories).
      ...(params.urlTags ? { url_tags: params.urlTags } : {}),
    }),
  });
}

// ---- Analytics Insights ----

export interface MetaInsightsRow {
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  cpm: string;
  campaign_id?: string;
  campaign_name?: string;
  date_start: string;
  date_stop: string;
}

export async function getAccountInsights(
  since: string,
  until: string
): Promise<MetaInsightsRow[]> {
  const fields = "impressions,clicks,spend,ctr,cpc,cpm";
  const timeRange = JSON.stringify({ since, until });
  const data = await metaJson<{ data: MetaInsightsRow[] }>(
    `/act_${getAdAccountId()}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=account`
  );
  return data.data;
}

export async function getCampaignInsights(
  since: string,
  until: string
): Promise<MetaInsightsRow[]> {
  const fields = "impressions,clicks,spend,ctr,cpc,cpm,campaign_id,campaign_name";
  const timeRange = JSON.stringify({ since, until });
  return metaJsonPaginated<MetaInsightsRow>(
    `/act_${getAdAccountId()}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&limit=50`
  );
}

export async function getAdInsights(
  since: string,
  until: string
): Promise<Array<MetaInsightsRow & { ad_id: string; frequency?: string; actions?: Array<{ action_type: string; value: string }>; action_values?: Array<{ action_type: string; value: string }> }>> {
  const fields = "impressions,clicks,spend,ctr,cpc,cpm,frequency,ad_id,actions,action_values";
  const timeRange = JSON.stringify({ since, until });
  return metaJsonPaginated<MetaInsightsRow & { ad_id: string; frequency?: string; actions?: Array<{ action_type: string; value: string }>; action_values?: Array<{ action_type: string; value: string }> }>(
    `/act_${getAdAccountId()}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=ad&limit=200`
  );
}

export type AdInsightRow = MetaInsightsRow & {
  ad_id: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
};

export interface AdInsightDailyRow {
  date_start: string;
  date_stop: string;
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  cpm: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

/**
 * Fetch ad-level insights with daily breakdown (time_increment=1).
 * Returns one row per ad per day. Includes ad name, ad set, and campaign info
 * for the performance monitoring table.
 */
export async function getAdInsightsDaily(
  since: string,
  until: string
): Promise<AdInsightDailyRow[]> {
  const fields = [
    "ad_id", "ad_name",
    "adset_id", "adset_name",
    "campaign_id", "campaign_name",
    "impressions", "clicks", "spend",
    "ctr", "cpc", "cpm", "frequency",
    "actions", "action_values",
  ].join(",");
  const timeRange = JSON.stringify({ since, until });
  return metaJsonPaginated<AdInsightDailyRow>(
    `/act_${getAdAccountId()}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=ad&time_increment=1&limit=200`
  );
}

/**
 * Fetch ad-set-level insights with daily breakdown (for strategy engine).
 */
export interface AdSetInsightDailyRow {
  date_start: string;
  date_stop: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  cpm: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

export async function getAdSetInsightsDaily(
  since: string,
  until: string
): Promise<AdSetInsightDailyRow[]> {
  const fields = [
    "adset_id", "adset_name",
    "campaign_id", "campaign_name",
    "impressions", "clicks", "spend",
    "ctr", "cpc", "cpm", "frequency",
    "actions", "action_values",
  ].join(",");
  const timeRange = JSON.stringify({ since, until });
  return metaJsonPaginated<AdSetInsightDailyRow>(
    `/act_${getAdAccountId()}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=adset&time_increment=1&limit=200`
  );
}

/**
 * Fetch ad-level insights for specific Meta ad IDs (batched, max 50 per request).
 */
export async function getAdInsightsForIds(
  adIds: string[],
  since: string,
  until: string
): Promise<AdInsightRow[]> {
  if (adIds.length === 0) return [];

  const timeRange = JSON.stringify({ since, until });
  const fields = "impressions,clicks,spend,ctr,cpc,cpm,frequency,ad_id,actions,action_values";
  const results: AdInsightRow[] = [];

  const BATCH_SIZE = 50;
  for (let i = 0; i < adIds.length; i += BATCH_SIZE) {
    const batch = adIds.slice(i, i + BATCH_SIZE);
    const filtering = JSON.stringify([{
      field: "ad.id",
      operator: "IN",
      value: batch,
    }]);
    const data = await metaJsonPaginated<AdInsightRow>(
      `/act_${getAdAccountId()}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=ad&filtering=${encodeURIComponent(filtering)}&limit=200`
    );
    results.push(...data);
  }

  return results;
}

export async function getCampaignBudget(campaignId: string): Promise<{ daily_budget: string; name: string }> {
  return metaJson(`/${campaignId}?fields=daily_budget,name`);
}
