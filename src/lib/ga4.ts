import { google } from "googleapis";
import { LANGUAGES } from "@/types";

const analyticsdata = google.analyticsdata("v1beta");

function getAuth() {
  const email = process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GDRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account not configured");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
}

export interface GA4PageMetrics {
  hostName: string;
  pagePath: string;
  screenPageViews: number;
  sessions: number;
  totalUsers: number;
  bounceRate: number;
  averageSessionDuration: number;
  engagementRate: number;
  conversions: number;
}

/**
 * Fetch per-page metrics from a single GA4 property.
 * Uses hostName + pagePath dimensions to distinguish markets.
 */
export async function fetchPageMetrics(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<GA4PageMetrics[]> {
  const auth = getAuth();

  const res = await analyticsdata.properties.runReport({
    auth,
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "hostName" }, { name: "pagePath" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
        { name: "engagementRate" },
        { name: "conversions" },
      ],
      limit: "500",
      orderBys: [
        { metric: { metricName: "screenPageViews" }, desc: true },
      ],
    },
  });

  const rows = res.data.rows ?? [];
  return rows.map((row) => {
    const dims = row.dimensionValues ?? [];
    const mets = row.metricValues ?? [];
    return {
      hostName: dims[0]?.value ?? "",
      pagePath: dims[1]?.value ?? "",
      screenPageViews: parseInt(mets[0]?.value ?? "0", 10),
      sessions: parseInt(mets[1]?.value ?? "0", 10),
      totalUsers: parseInt(mets[2]?.value ?? "0", 10),
      bounceRate: parseFloat(mets[3]?.value ?? "0"),
      averageSessionDuration: parseFloat(mets[4]?.value ?? "0"),
      engagementRate: parseFloat(mets[5]?.value ?? "0"),
      conversions: parseInt(mets[6]?.value ?? "0", 10),
    };
  });
}

/**
 * Fetch metrics from all configured GA4 properties in parallel.
 * Deduplicates property IDs and uses hostName to map pages to markets.
 * Returns a map: `"lang:/path"` → metrics.
 */
export async function fetchAllGA4Metrics(
  properties: Record<string, string>,
  days: number,
  extraPropertyIds?: string[]
): Promise<Map<string, GA4PageMetrics>> {
  const endDate = "today";
  const startDate = `${days}daysAgo`;

  // Build domain→lang map from LANGUAGES
  const domainToLang = new Map<string, string>();
  for (const lang of LANGUAGES) {
    if (lang.domain) domainToLang.set(lang.domain, lang.value);
  }

  // Deduplicate property IDs (e.g. all markets share one property)
  // Include extra property IDs (e.g. legacy property with historical data)
  const allIds = [...Object.values(properties).filter(Boolean), ...(extraPropertyIds ?? [])];
  const uniquePropertyIds = [...new Set(allIds)];
  if (uniquePropertyIds.length === 0) return new Map();

  const results = await Promise.allSettled(
    uniquePropertyIds.map((propertyId) =>
      fetchPageMetrics(propertyId, startDate, endDate)
    )
  );

  const map = new Map<string, GA4PageMetrics>();
  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const m of result.value) {
        // Map hostname to market language
        const lang = domainToLang.get(m.hostName);
        if (!lang) continue; // Skip unknown hostnames (e.g. localhost, preview domains)

        const key = `${lang}:${m.pagePath}`;
        const existing = map.get(key);
        // Keep the entry with more pageviews (avoids legacy property overwriting main)
        if (!existing || m.screenPageViews > existing.screenPageViews) {
          map.set(key, m);
        }
      }
    }
  }
  return map;
}

/**
 * Quick connectivity test — runs a minimal report.
 */
export async function testGA4Connection(propertyId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const auth = getAuth();
    await analyticsdata.properties.runReport({
      auth,
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        metrics: [{ name: "screenPageViews" }],
        limit: "1",
      },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
