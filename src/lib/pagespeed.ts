// Google PageSpeed Insights API v5 wrapper

const PSI_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export interface PageSpeedCheckResult {
  performance_score: number; // 0-100
  lcp_ms: number;
  fcp_ms: number;
  cls: number;
  tbt_ms: number;
  si_ms: number;
  ttfb_ms: number;
  opportunities: PageSpeedOpportunity[];
  lighthouse_version: string;
}

export interface PageSpeedOpportunity {
  id: string;
  title: string;
  savings_ms: number;
}

/**
 * Run a PageSpeed Insights check for a URL.
 * Uses PAGESPEED_API_KEY env var if available, otherwise anonymous (rate-limited).
 */
export async function runPageSpeedCheck(
  url: string,
  strategy: "mobile" | "desktop"
): Promise<PageSpeedCheckResult> {
  const params = new URLSearchParams({
    url,
    strategy,
    category: "performance",
  });

  const apiKey = process.env.PAGESPEED_API_KEY;
  if (apiKey) params.set("key", apiKey);

  const res = await fetch(`${PSI_API}?${params}`, {
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PSI API error ${res.status}: ${body.slice(0, 300)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  return parseResponse(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseResponse(data: any): PageSpeedCheckResult {
  const lhr = data.lighthouseResult;
  const audits = lhr?.audits ?? {};

  const score = lhr?.categories?.performance?.score ?? null;

  // Extract Core Web Vitals from audits
  const lcp = audits["largest-contentful-paint"]?.numericValue ?? 0;
  const fcp = audits["first-contentful-paint"]?.numericValue ?? 0;
  const cls = audits["cumulative-layout-shift"]?.numericValue ?? 0;
  const tbt = audits["total-blocking-time"]?.numericValue ?? 0;
  const si = audits["speed-index"]?.numericValue ?? 0;
  const ttfb = audits["server-response-time"]?.numericValue ?? 0;

  // Extract top opportunities (audits with savings)
  const opportunities: PageSpeedOpportunity[] = [];
  for (const [id, audit] of Object.entries(audits)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = audit as any;
    const savings = a?.details?.overallSavingsMs;
    if (typeof savings === "number" && savings > 0 && a.score !== null && a.score < 1) {
      opportunities.push({
        id,
        title: a.title ?? id,
        savings_ms: Math.round(savings),
      });
    }
  }
  opportunities.sort((a, b) => b.savings_ms - a.savings_ms);

  return {
    performance_score: score !== null ? Math.round(score * 100) : 0,
    lcp_ms: Math.round(lcp),
    fcp_ms: Math.round(fcp),
    cls: Math.round(cls * 1000) / 1000, // 3 decimals
    tbt_ms: Math.round(tbt),
    si_ms: Math.round(si),
    ttfb_ms: Math.round(ttfb),
    opportunities: opportunities.slice(0, 5),
    lighthouse_version: lhr?.lighthouseVersion ?? "unknown",
  };
}

/** Score color: green ≥90, amber 50-89, red <50 */
export function scoreColor(score: number): "green" | "amber" | "red" {
  if (score >= 90) return "green";
  if (score >= 50) return "amber";
  return "red";
}

/** Format milliseconds as human-readable */
export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}
