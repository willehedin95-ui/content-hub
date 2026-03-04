import { google } from "googleapis";
import { withRetry, isTransientError } from "./retry";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v20";

// ---- Auth ----

function getOAuth2Client() {
  const clientId = process.env.GDRIVE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GDRIVE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GDRIVE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth not configured (GDRIVE_OAUTH_* env vars)");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function getCustomerId(): string {
  const id = process.env.GOOGLE_ADS_CUSTOMER_ID;
  if (!id) throw new Error("GOOGLE_ADS_CUSTOMER_ID is not set");
  return id.replace(/-/g, "");
}

function getDeveloperToken(): string {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!token) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not set");
  return token;
}

export function isGoogleAdsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID &&
    process.env.GDRIVE_OAUTH_CLIENT_ID &&
    process.env.GDRIVE_OAUTH_CLIENT_SECRET &&
    process.env.GDRIVE_OAUTH_REFRESH_TOKEN
  );
}

// ---- Low-level fetch ----

async function googleAdsFetch(
  path: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const oauth2 = getOAuth2Client();
  const { token } = await oauth2.getAccessToken();
  if (!token) throw new Error("Failed to get Google OAuth access token");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "developer-token": getDeveloperToken(),
  };

  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId.replace(/-/g, "");
  }

  const url = `${GOOGLE_ADS_API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads API error (${res.status}): ${text.slice(0, 300)}`);
    }

    // searchStream returns NDJSON array
    const text = await res.text();
    // Response is a JSON array of batches
    const batches = JSON.parse(text);
    return batches;
  } finally {
    clearTimeout(timeout);
  }
}

async function googleAdsQuery<T>(query: string): Promise<T[]> {
  return withRetry(
    async () => {
      const customerId = getCustomerId();
      const batches = (await googleAdsFetch(
        `/customers/${customerId}/googleAds:searchStream`,
        { query }
      )) as Array<{ results?: T[] }>;

      const results: T[] = [];
      for (const batch of batches) {
        if (batch.results) {
          results.push(...batch.results);
        }
      }
      return results;
    },
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );
}

// ---- Types ----

export interface GoogleAdsCampaignRow {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  costPerConversion: number;
  conversionsValue: number;
  ctr: number;
  cpc: number;
}

export interface GoogleAdsAccountRow {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  ctr: number;
  cpc: number;
  cpm: number;
}

// ---- Domain functions ----

interface RawCampaignResult {
  campaign: { id: string; name: string; resourceName: string };
  metrics: {
    costMicros: string;
    impressions: string;
    clicks: string;
    conversions: string;
    costPerConversion: string;
    conversionsValue: string;
  };
}

export async function getGoogleAdsCampaignInsights(
  since: string,
  until: string
): Promise<GoogleAdsCampaignRow[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.cost_per_conversion,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND campaign.status = 'ENABLED'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
  `;

  const results = await googleAdsQuery<RawCampaignResult>(query);

  return results.map((r) => {
    const spend = Number(r.metrics.costMicros) / 1_000_000;
    const impressions = Number(r.metrics.impressions);
    const clicks = Number(r.metrics.clicks);
    const conversions = Number(r.metrics.conversions);

    return {
      campaignId: r.campaign.id,
      campaignName: r.campaign.name,
      spend,
      impressions,
      clicks,
      conversions,
      costPerConversion: Number(r.metrics.costPerConversion) / 1_000_000,
      conversionsValue: Number(r.metrics.conversionsValue),
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    };
  });
}

export async function getGoogleAdsAccountInsights(
  since: string,
  until: string
): Promise<GoogleAdsAccountRow> {
  const query = `
    SELECT
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM customer
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `;

  const results = await googleAdsQuery<{
    metrics: { costMicros: string; impressions: string; clicks: string; conversions: string; conversionsValue?: string };
  }>(query);

  let spend = 0, impressions = 0, clicks = 0, conversions = 0, conversionsValue = 0;
  for (const r of results) {
    spend += Number(r.metrics.costMicros) / 1_000_000;
    impressions += Number(r.metrics.impressions);
    clicks += Number(r.metrics.clicks);
    conversions += Number(r.metrics.conversions);
    conversionsValue += Number(r.metrics.conversionsValue ?? 0);
  }

  return {
    spend,
    impressions,
    clicks,
    conversions,
    conversionsValue,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
  };
}

export async function verifyGoogleAdsConnection(): Promise<{
  customerId: string;
  descriptiveName: string;
}> {
  const oauth2 = getOAuth2Client();
  const { token } = await oauth2.getAccessToken();
  if (!token) throw new Error("Failed to get Google OAuth access token");

  const customerId = getCustomerId();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "developer-token": getDeveloperToken(),
  };

  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId.replace(/-/g, "");
  }

  const res = await fetch(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}`,
    { headers }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Ads API error (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    customerId: data.id || customerId,
    descriptiveName: data.descriptiveName || "Google Ads Account",
  };
}
