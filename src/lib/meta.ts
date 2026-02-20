import { withRetry, isTransientError } from "./retry";

const META_API_BASE = "https://graph.facebook.com/v22.0";
const META_FETCH_TIMEOUT_MS = 30_000;

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
            errorMessage = data.error?.message ?? errorMessage;
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

export async function listCampaigns(): Promise<
  Array<{ id: string; name: string; status: string; objective: string }>
> {
  const data = await metaJson<{
    data: Array<{ id: string; name: string; status: string; objective: string }>;
  }>(
    `/act_${getAdAccountId()}/campaigns?fields=id,name,status,objective&limit=50`
  );
  return data.data.filter((c) => c.status === "ACTIVE");
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

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error("Failed to download image for Meta upload");
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
  const data = await metaJson<{
    data: Array<{ id: string; name: string }>;
  }>(`/me/accounts?fields=id,name&limit=50`);
  return data.data;
}

export async function createAdCreative(params: {
  name: string;
  imageHash: string;
  imageHash9x16?: string;
  primaryText: string;
  primaryTexts?: string[];
  headline?: string;
  headlines?: string[];
  linkUrl: string;
  callToAction?: string;
  pageId?: string;
}): Promise<{ id: string }> {
  const cta = params.callToAction || "LEARN_MORE";
  const pageId = params.pageId || getPageId();

  // Build bodies and titles arrays (multi-variant support)
  const bodies = params.primaryTexts?.length
    ? params.primaryTexts.map((t) => ({ text: t }))
    : [{ text: params.primaryText }];
  const titles = params.headlines?.length
    ? params.headlines.map((t) => ({ text: t }))
    : params.headline
    ? [{ text: params.headline }]
    : undefined;

  // Use asset_feed_spec when we have multiple images, texts, or headlines
  const useAssetFeed = params.imageHash9x16 || bodies.length > 1 || (titles && titles.length > 1);

  if (useAssetFeed) {
    const images = params.imageHash9x16
      ? [
          { hash: params.imageHash, adlabels: [{ name: "feed_image" }] },
          { hash: params.imageHash9x16, adlabels: [{ name: "story_image" }] },
        ]
      : [{ hash: params.imageHash }];

    const assetCustomizationRules = params.imageHash9x16
      ? [
          {
            customization_spec: {
              publisher_platforms: ["facebook"],
              facebook_positions: ["feed", "marketplace", "video_feeds", "search", "right_hand_column"],
            },
            image_label: { name: "feed_image" },
          },
          {
            customization_spec: {
              publisher_platforms: ["facebook"],
              facebook_positions: ["story", "reels", "facebook_reels"],
            },
            image_label: { name: "story_image" },
          },
          {
            customization_spec: {
              publisher_platforms: ["instagram"],
              instagram_positions: ["stream", "explore", "explore_home", "profile_feed", "ig_search"],
            },
            image_label: { name: "feed_image" },
          },
          {
            customization_spec: {
              publisher_platforms: ["instagram"],
              instagram_positions: ["story", "reels"],
            },
            image_label: { name: "story_image" },
          },
        ]
      : undefined;

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
          images,
          bodies,
          titles,
          link_urls: [{ website_url: params.linkUrl }],
          call_to_action_types: [cta],
          ...(assetCustomizationRules ? { asset_customization_rules: assetCustomizationRules } : {}),
        },
        degrees_of_freedom_spec: {
          creative_features_spec: {
            standard_enhancements: { enroll_status: "OPT_OUT" },
          },
        },
      }),
    });
  }

  // Single image, single text: use standard object_story_spec
  return metaJson(`/act_${getAdAccountId()}/adcreatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          image_hash: params.imageHash,
          message: params.primaryText,
          name: params.headline || undefined,
          link: params.linkUrl,
          call_to_action: { type: cta },
        },
      },
      degrees_of_freedom_spec: {
        creative_features_spec: {
          standard_enhancements: { enroll_status: "OPT_OUT" },
        },
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

export async function updateAdSet(adSetId: string, params: { name: string }): Promise<{ success: boolean }> {
  return metaJson(`/${adSetId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: params.name }),
  });
}

export async function listAdSets(campaignId: string): Promise<
  Array<{ id: string; name: string; status: string }>
> {
  const data = await metaJson<{
    data: Array<{ id: string; name: string; status: string }>;
  }>(`/${campaignId}/adsets?fields=id,name,status&limit=50`);
  return data.data;
}

export async function createAd(params: {
  name: string;
  adSetId: string;
  creativeId: string;
  status?: string;
}): Promise<{ id: string }> {
  return metaJson(`/act_${getAdAccountId()}/ads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      adset_id: params.adSetId,
      creative: { creative_id: params.creativeId },
      status: params.status || "PAUSED",
    }),
  });
}
