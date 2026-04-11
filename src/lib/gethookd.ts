/**
 * GetHookd API wrapper
 *
 * Docs: https://gethookdai.crisp.help/en/article/public-api-6ihtg/
 * Base URL: https://app.gethookd.ai/api/v1/
 * Auth: Bearer token from GETHOOKD_API_TOKEN env var
 * Credits: 0.01 per item returned (200 credits/month on Grow plan)
 */

const BASE_URL = "https://app.gethookd.ai/api/v1";
const MONTHLY_CREDIT_LIMIT = 200;
const LOW_CREDIT_THRESHOLD = 30; // Alert when remaining < 30 credits (15%)

function getToken(): string {
  const token = process.env.GETHOOKD_API_TOKEN;
  if (!token) throw new Error("GETHOOKD_API_TOKEN not set");
  return token;
}

async function gethookdFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T & { used_credits?: number; remaining_credits?: string }> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new Error(`GetHookd rate limit hit. Retry after ${retryAfter ?? "?"}s`);
  }

  if (res.status === 402) {
    throw new Error("GetHookd credits depleted");
  }

  const json = await res.json();

  if (json.errors) {
    throw new Error(`GetHookd API error: ${json.message ?? JSON.stringify(json)}`);
  }

  // Track credit usage
  const creditsUsed = json.used_credits ?? 0;
  const remaining = parseFloat(json.remaining_credits ?? "0");
  if (creditsUsed > 0) {
    logCreditUsage(path, creditsUsed, remaining).catch(() => {});
  }

  return json;
}

/** Log credit usage to usage_logs and alert if running low */
async function logCreditUsage(endpoint: string, creditsUsed: number, remaining: number): Promise<void> {
  try {
    const { createServerSupabase } = await import("@/lib/supabase-admin");
    const db = createServerSupabase();

    // Log to usage_logs
    await db.from("usage_logs").insert({
      type: "gethookd_api",
      model: "gethookd",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0, // GetHookd is subscription-based, not per-token
      metadata: {
        endpoint,
        credits_used: creditsUsed,
        credits_remaining: remaining,
        monthly_limit: MONTHLY_CREDIT_LIMIT,
      },
    });

    // Alert if credits running low (only once per day to avoid spam)
    if (remaining > 0 && remaining < LOW_CREDIT_THRESHOLD) {
      const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
      if (!chatId) return;

      // Check if we already sent a low-credit alert today
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { count } = await db
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("type", "gethookd_api")
        .gte("created_at", todayStart.toISOString())
        .contains("metadata", { alert_sent: true });

      if ((count ?? 0) === 0) {
        const { sendMessage } = await import("@/lib/telegram");
        await sendMessage(chatId, [
          `⚠️ GetHookd credits running low`,
          `Remaining: ${remaining.toFixed(1)} / ${MONTHLY_CREDIT_LIMIT}`,
          `Used this call: ${creditsUsed}`,
          `Consider reducing explore mode usage.`,
        ].join("\n"));

        // Mark that we sent an alert
        await db.from("usage_logs").insert({
          type: "gethookd_api",
          model: "gethookd",
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
          metadata: { alert_sent: true, remaining },
        });
      }
    }
  } catch {
    // Don't let credit tracking break the main flow
  }
}

/** Get current month's credit usage from usage_logs */
export async function getMonthlyCreditsUsed(): Promise<{
  used: number;
  remaining: number;
  limit: number;
  callCount: number;
}> {
  const { createServerSupabase } = await import("@/lib/supabase-admin");
  const db = createServerSupabase();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data, count } = await db
    .from("usage_logs")
    .select("metadata", { count: "exact" })
    .eq("type", "gethookd_api")
    .gte("created_at", monthStart.toISOString());

  const totalUsed = (data ?? []).reduce((sum, row) => {
    const meta = row.metadata as Record<string, unknown> | null;
    return sum + ((meta?.credits_used as number) ?? 0);
  }, 0);

  return {
    used: totalUsed,
    remaining: MONTHLY_CREDIT_LIMIT - totalUsed,
    limit: MONTHLY_CREDIT_LIMIT,
    callCount: count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GethookdAd {
  id: number;
  external_id: string;
  platform: string;
  display_format: string;
  title: string;
  body: string;
  landing_page: string;
  cta_type: string;
  cta_text: string;
  start_date: string;
  end_date: string;
  days_active: number;
  active_in_library: number;
  performance_score: number | null;
  performance_score_title: string | null;
  share_url: string;
  brand: {
    external_id: string;
    name: string;
    logo_url: string;
    active_ads: number;
  };
  media: Array<{
    type: string;
    url: string;
    resized_url: string | null;
    thumbnail_url: string;
    video_length: number;
  }>;
}

export interface GethookdBoard {
  id: number;
  name: string;
  description: string | null;
  ads_count: number;
  created_at: string;
  updated_at: string;
}

export interface GethookdBrand {
  id: number;
  external_id: string;
  name: string;
  logo_url: string;
  active_ads: number;
  inactive_ads: number;
  last_spied_at: string;
}

export interface ExploreParams {
  query: string;
  "ad-format"?: string;
  performance_scores?: string;
  niche?: number;
  per_page?: number;
  ads_per_brand_limit?: number;
  sort_column?: string;
  sort_direction?: string;
  "start-date"?: string;
  "end-date"?: string;
  page?: number;
  status?: "active" | "inactive";
  "run-time"?: number;
  language?: string;
  active_ads_count?: number;
  location?: string;
  gender_audience?: "all" | "men" | "women";
  age_audience?: string;
}

// ---------------------------------------------------------------------------
// Explore — search the ad library
// ---------------------------------------------------------------------------

export async function exploreAds(
  params: ExploreParams
): Promise<{ ads: GethookdAd[]; total: number; credits_used: number }> {
  const res = await gethookdFetch<{
    data: GethookdAd[];
    meta: { total: number };
    used_credits: number;
  }>("/explore", params as unknown as Record<string, string | number | undefined>);

  return {
    ads: res.data ?? [],
    total: res.meta?.total ?? 0,
    credits_used: res.used_credits ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Boards — user-curated collections
// ---------------------------------------------------------------------------

export async function getBoards(): Promise<GethookdBoard[]> {
  const res = await gethookdFetch<{ data: GethookdBoard[] }>("/boards");
  return res.data ?? [];
}

export async function getBoardAds(
  boardId: string | number,
  page = 1,
  perPage = 50
): Promise<{ ads: GethookdAd[]; total: number; boardName: string }> {
  const res = await gethookdFetch<{
    data: {
      id: number;
      name: string;
      ads: { data: GethookdAd[]; total: number };
    };
  }>(`/boards/${boardId}`, { page, per_page: perPage });

  return {
    ads: res.data?.ads?.data ?? [],
    total: res.data?.ads?.total ?? 0,
    boardName: res.data?.name ?? "",
  };
}

// ---------------------------------------------------------------------------
// Brand Spy — tracked competitors
// ---------------------------------------------------------------------------

export async function getBrandSpyBrands(): Promise<GethookdBrand[]> {
  const res = await gethookdFetch<{ data: GethookdBrand[] }>("/brandspy", {
    sort_column: "last_spied_at",
    sort_direction: "desc",
  });
  return res.data ?? [];
}

export async function getBrandSpyAds(
  brandId: string | number,
  opts?: { status?: string; platform?: string; per_page?: number }
): Promise<GethookdAd[]> {
  const res = await gethookdFetch<{ data: GethookdAd[] }>(
    `/brandspy`,
    {
      brand_id: brandId,
      status: opts?.status,
      platform: opts?.platform,
      per_page: opts?.per_page ?? 20,
    }
  );
  return res.data ?? [];
}

// ---------------------------------------------------------------------------
// Auth check — verify token
// ---------------------------------------------------------------------------

export async function authCheck(): Promise<{
  authenticated: boolean;
  workspace: { id: number; name: string };
  scopes: string[];
}> {
  const res = await gethookdFetch<{
    data: {
      authenticated: boolean;
      workspace: { id: number; name: string };
      scopes: string[];
    };
  }>("/authcheck");
  return res.data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Filter an ad list to image-only ads (display_format IMAGE or image) */
export function filterImageAds(ads: GethookdAd[]): GethookdAd[] {
  return ads.filter((ad) => {
    const fmt = ad.display_format?.toLowerCase();
    return fmt === "image" || fmt === "dco";
  });
}

/** Get unique image URLs from an ad's media array */
export function getImageUrls(ad: GethookdAd): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const m of ad.media) {
    if (m.type === "image" && m.url && !seen.has(m.url)) {
      seen.add(m.url);
      urls.push(m.url);
    }
  }
  return urls;
}

/** Filter an ad list to video-only ads */
export function filterVideoAds(ads: GethookdAd[]): GethookdAd[] {
  return ads.filter((ad) => {
    const fmt = ad.display_format?.toLowerCase();
    return fmt === "video";
  });
}

/** Get the first video URL from an ad's media array */
export function getVideoUrl(ad: GethookdAd): string | null {
  for (const m of ad.media) {
    if (m.type === "video" && m.url) return m.url;
  }
  return null;
}

/** Get the first video thumbnail URL from an ad's media array */
export function getVideoThumbnailUrl(ad: GethookdAd): string | null {
  for (const m of ad.media) {
    if (m.type === "video" && m.thumbnail_url) return m.thumbnail_url;
  }
  return null;
}

/** Get video duration from an ad's first video media item */
export function getVideoDuration(ad: GethookdAd): number | null {
  for (const m of ad.media) {
    if (m.type === "video" && m.video_length) return m.video_length;
  }
  return null;
}
