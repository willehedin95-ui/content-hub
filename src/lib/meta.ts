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

async function metaFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${META_API_BASE}${path}`;
  const separator = path.includes("?") ? "&" : "?";
  return fetch(`${url}${separator}access_token=${getToken()}`, options);
}

async function metaJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await metaFetch(path, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Meta API error (${res.status})`);
  }
  return data as T;
}

export async function listCampaigns(): Promise<
  Array<{ id: string; name: string; status: string; objective: string }>
> {
  const data = await metaJson<{
    data: Array<{ id: string; name: string; status: string; objective: string }>;
  }>(
    `/act_${getAdAccountId()}/campaigns?fields=id,name,status,objective&limit=50`
  );
  return data.data.filter(
    (c) => c.status === "ACTIVE" || c.status === "PAUSED"
  );
}

export async function verifyConnection(): Promise<{
  name: string;
  account_status: number;
  id: string;
}> {
  return metaJson(`/act_${getAdAccountId()}?fields=name,account_status,id`);
}

export async function uploadImage(imageUrl: string): Promise<{ hash: string; url: string }> {
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

export async function createAdCreative(params: {
  name: string;
  imageHash: string;
  primaryText: string;
  headline?: string;
  linkUrl: string;
  callToAction?: string;
}): Promise<{ id: string }> {
  return metaJson(`/act_${getAdAccountId()}/adcreatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      object_story_spec: {
        page_id: getPageId(),
        link_data: {
          image_hash: params.imageHash,
          message: params.primaryText,
          name: params.headline || undefined,
          link: params.linkUrl,
          call_to_action: { type: params.callToAction || "LEARN_MORE" },
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
