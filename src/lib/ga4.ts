import { google } from "googleapis";

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
      dimensions: [{ name: "pagePath" }],
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
      pagePath: dims[0]?.value ?? "",
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
 * Returns a map: `"lang:/path"` → metrics.
 */
export async function fetchAllGA4Metrics(
  properties: Record<string, string>, // { sv: "123456789", da: "987654321" }
  days: number
): Promise<Map<string, GA4PageMetrics>> {
  const endDate = "today";
  const startDate = `${days}daysAgo`;

  const entries = Object.entries(properties).filter(([, id]) => !!id);
  if (entries.length === 0) return new Map();

  const results = await Promise.allSettled(
    entries.map(async ([lang, propertyId]) => {
      const metrics = await fetchPageMetrics(propertyId, startDate, endDate);
      return { lang, metrics };
    })
  );

  const map = new Map<string, GA4PageMetrics>();
  for (const result of results) {
    if (result.status === "fulfilled") {
      const { lang, metrics } = result.value;
      for (const m of metrics) {
        map.set(`${lang}:${m.pagePath}`, m);
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
