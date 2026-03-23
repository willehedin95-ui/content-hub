import { google } from "googleapis";

const searchconsole = google.searchconsole("v1");

function getAuth() {
  const email = process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GDRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account not configured");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

export function isGscConfigured(): boolean {
  return !!(
    process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GDRIVE_PRIVATE_KEY
  );
}

/** GSC uses 3-letter country codes; we use 2-letter uppercase internally */
const COUNTRY_MAP: Record<string, string> = {
  swe: "SE",
  dnk: "DK",
  nor: "NO",
  deu: "DE",
  fin: "FI",
  gbr: "GB",
  usa: "US",
};

export function gscCountryToMarket(gscCountry: string): string {
  return COUNTRY_MAP[gscCountry.toLowerCase()] || gscCountry.toUpperCase();
}

export interface GscRow {
  query: string;
  page: string;
  country: string;
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Fetch search analytics data from a GSC property.
 * Handles pagination (25K rows per request).
 */
export async function fetchSearchAnalytics(
  property: string,
  startDate: string,
  endDate: string,
  options?: { rowLimit?: number }
): Promise<GscRow[]> {
  const auth = getAuth();
  const maxPerRequest = 25000;
  const totalLimit = options?.rowLimit ?? 100000;
  const allRows: GscRow[] = [];
  let startRow = 0;

  while (allRows.length < totalLimit) {
    const res = await searchconsole.searchanalytics.query({
      auth,
      siteUrl: property,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["query", "page", "country", "date"],
        rowLimit: Math.min(maxPerRequest, totalLimit - allRows.length),
        startRow,
        type: "web",
      },
    });

    const rows = res.data.rows ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const keys = row.keys ?? [];
      allRows.push({
        query: keys[0] ?? "",
        page: keys[1] ?? "",
        country: keys[2] ?? "",
        date: keys[3] ?? "",
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      });
    }

    if (rows.length < maxPerRequest) break;
    startRow += rows.length;
  }

  return allRows;
}

/** List all sites the service account has access to */
export async function listSites(): Promise<
  Array<{ siteUrl: string; permissionLevel: string }>
> {
  const auth = getAuth();
  const res = await searchconsole.sites.list({ auth });
  return (res.data.siteEntry ?? []).map((s) => ({
    siteUrl: s.siteUrl ?? "",
    permissionLevel: s.permissionLevel ?? "unknown",
  }));
}

/** Quick connectivity test for a single property */
export async function testGscConnection(
  property: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const auth = getAuth();
    await searchconsole.searchanalytics.query({
      auth,
      siteUrl: property,
      requestBody: {
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        dimensions: ["query"],
        rowLimit: 1,
        type: "web",
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

/** Format a Date as YYYY-MM-DD */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Get date N days ago as YYYY-MM-DD */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}
