// src/lib/klaviyo.ts

export interface KlaviyoMetric {
  date: string;
  revenue: number;
}

export function isKlaviyoConfigured(): boolean {
  return Boolean(process.env.KLAVIYO_API_KEY);
}

export async function fetchKlaviyoRevenue(
  startDate: string,
  endDate: string
): Promise<{ total: number; timeseries: KlaviyoMetric[] }> {
  if (!isKlaviyoConfigured()) {
    return { total: 0, timeseries: [] };
  }

  const apiKey = process.env.KLAVIYO_API_KEY!;
  const baseUrl = "https://a.klaviyo.com/api";

  try {
    // Fetch campaign and flow metrics
    // Note: Klaviyo Metrics API v2024-10-15
    const headers = {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: "2024-10-15",
      "Content-Type": "application/json",
    };

    // For now, return mock structure - actual API integration requires
    // specific metric IDs which vary per Klaviyo account
    // User will need to configure these in settings
    return {
      total: 0,
      timeseries: [],
    };
  } catch (error) {
    console.error("Klaviyo API error:", error);
    return { total: 0, timeseries: [] };
  }
}
