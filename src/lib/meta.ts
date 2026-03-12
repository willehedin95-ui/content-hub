import { withRetry, isTransientError } from "./retry";
import type { WorkspaceMetaConfig } from "@/types";

const META_API_BASE = "https://graph.facebook.com/v22.0";
const META_FETCH_TIMEOUT_MS = 30_000;

// Per-request workspace Meta config override (set before calling Meta functions)
let _wsMetaConfig: WorkspaceMetaConfig | null = null;

/** Set workspace Meta config for subsequent API calls. Call with null to clear. */
export function setMetaConfig(config: WorkspaceMetaConfig | null): void {
  _wsMetaConfig = config;
}

export function getToken(): string {
  const token = _wsMetaConfig?.system_user_token || process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN is not set");
  return token;
}

export function getAdAccountId(): string {
  const id = _wsMetaConfig?.ad_account_id || process.env.META_AD_ACCOUNT_ID;
  if (!id) throw new Error("META_AD_ACCOUNT_ID is not set");
  return id;
}

export function getPageId(): string {
  const id = _wsMetaConfig?.page_id || process.env.META_PAGE_ID;
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

async function metaJson<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
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
  return metaJson(`/act_${getAdAccountId()}/campaigns`, {
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
  return metaJson(`/act_${getAdAccountId()}/adsets`, {
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
 * Create a DCO ad creative with multiple images and copy variants.
 * All images and text go into a single asset_feed_spec — Meta tests all combinations.
 * No asset_customization_rules — they cause cascading issues with Instagram accounts,
 * title limits, and placement validation. Meta handles placement optimization automatically.
 */
export async function createAdCreative(params: {
  name: string;
  images: Array<{ hash: string }>;
  bodies: string[];
  titles?: string[];
  linkUrl: string;
  callToAction?: string;
  pageId?: string;
}): Promise<{ id: string }> {
  const cta = params.callToAction || "LEARN_MORE";
  const pageId = params.pageId || getPageId();

  return metaJson(`/act_${getAdAccountId()}/adcreatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      object_story_spec: {
        page_id: pageId,
      },
      asset_feed_spec: {
        ad_formats: ["SINGLE_IMAGE"],
        images: params.images.map((img) => ({ hash: img.hash })),
        bodies: params.bodies.map((text) => ({ text })),
        titles: params.titles && params.titles.length > 0
          ? params.titles.map((text) => ({ text }))
          : undefined,
        link_urls: [{ website_url: params.linkUrl }],
        call_to_action_types: [cta],
      },
    }),
  });
}

export async function duplicateAdSet(adSetId: string): Promise<{ copied_adset_id: string }> {
  return metaJson(`/${adSetId}/copies`, {
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
}

/**
 * Fetch a template ad set's config so we can create new ad sets with the same settings.
 */
export async function getAdSetConfig(adSetId: string): Promise<AdSetTemplateConfig> {
  return metaJson(`/${adSetId}?fields=campaign_id,billing_event,optimization_goal,targeting,promoted_object,attribution_spec,bid_strategy,bid_amount,daily_budget,lifetime_budget`);
}

/**
 * Create a new ad set from scratch using a template's config.
 * Supports is_dynamic_creative=true (required for asset_feed_spec with 9:16 placement rules).
 * Meta's is_dynamic_creative can only be set at creation time, not updated later.
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

  return metaJson(`/act_${getAdAccountId()}/adsets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      campaign_id: cfg.campaign_id,
      billing_event: cfg.billing_event,
      optimization_goal: cfg.optimization_goal,
      targeting: {
        ...cfg.targeting,
        // Restrict to Facebook only — Instagram requires instagram_actor_id
        // which isn't configured on the pages. Audience Network excluded too.
        publisher_platforms: ["facebook"],
      },
      promoted_object: cfg.promoted_object,
      attribution_spec: cfg.attribution_spec,
      bid_strategy: cfg.bid_strategy,
      ...(cfg.bid_amount ? { bid_amount: cfg.bid_amount } : {}),
      ...budgetFields,
      is_dynamic_creative: params.isDynamicCreative || false,
      start_time: params.startTime || new Date().toISOString(),
      status: params.startTime ? "ACTIVE" : "PAUSED",
    }),
  });
}

export async function listAdSets(campaignId: string): Promise<
  Array<{ id: string; name: string; status: string }>
> {
  return metaJsonPaginated<{ id: string; name: string; status: string }>(
    `/${campaignId}/adsets?fields=id,name,status&limit=50`
  );
}

export async function listAdsInAdSet(adSetId: string): Promise<
  Array<{ id: string; name: string; status: string }>
> {
  return metaJsonPaginated<{ id: string; name: string; status: string }>(
    `/${adSetId}/ads?fields=id,name,status&limit=50`
  );
}

export async function createAd(params: {
  name: string;
  adSetId: string;
  creativeId: string;
  status?: string;
  urlTags?: string;
}): Promise<{ id: string }> {
  return metaJson(`/act_${getAdAccountId()}/ads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      adset_id: params.adSetId,
      creative: { creative_id: params.creativeId },
      status: params.status || "PAUSED",
      // Prevent Meta from auto-cropping the image for vertical placements (stories/reels).
      // Without this, a 4:5 image gets zoomed-in to fill 9:16, cutting off content.
      creative_features_spec: {
        image_cropping: { enroll_status: "OPT_OUT" },
      },
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
