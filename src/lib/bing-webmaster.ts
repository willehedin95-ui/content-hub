/**
 * Bing Webmaster Tools API client.
 *
 * Bing is 5-10% of Swedish search market - non-trivial. Bing also powers
 * DuckDuckGo + Yahoo + ChatGPT search, so submitting sitemaps to Bing widens
 * indexation across the non-Google ecosystem.
 *
 * Endpoint: https://ssl.bing.com/webmaster/api.svc/json/SubmitSitemap
 * Auth: ?apikey=YOUR_KEY (in URL, not header)
 * Rate limit: 10 sitemap submissions per day per site (sufficient since
 *   we submit weekly per cron).
 *
 * Get API key from Bing Webmaster Tools UI: Settings -> API Access.
 * Site must be verified in BWT first (via meta tag, DNS, or XML file).
 */

const BING_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

function apiKey(): string | null {
  const k = process.env.BING_WEBMASTER_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

export interface BingSubmitResult {
  ok: boolean;
  status?: number;
  message?: string;
}

/**
 * Submit a sitemap URL to Bing Webmaster Tools. Returns ok=true on success.
 * No-op (returns {ok:false, message:"not configured"}) if BING_WEBMASTER_API_KEY
 * env var isn't set - integrations stay optional.
 */
export async function submitSitemapToBing(
  siteUrl: string,
  sitemapUrl: string
): Promise<BingSubmitResult> {
  const key = apiKey();
  if (!key) return { ok: false, message: "BING_WEBMASTER_API_KEY not set" };

  try {
    const url = `${BING_BASE}/SubmitSitemap?apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteUrl,
        feedUrl: sitemapUrl,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, message: body.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export function isBingConfigured(): boolean {
  return apiKey() !== null;
}
