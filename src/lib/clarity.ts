import { createServerSupabase } from "./supabase";

export interface ClarityInsight {
  url: string;
  totalSessionCount: number;
  pagesPerSession: number;
  scrollDepth: number;
  activeTime: number; // seconds
  deadClickCount: number;
  rageClickCount: number;
  quickbackClickCount: number;
  excessiveScrollCount: number;
}

interface ClarityAPIResponse {
  results: Array<{
    url: string;
    totalSessionCount: number;
    pagesPerSession: number;
    scrollDepth: number;
    activeTime: number;
    deadClickCount: number;
    rageClickCount: number;
    quickbackClickCount: number;
    excessiveScrollCount: number;
  }>;
}

const CACHE_TTL_HOURS = 8;

/**
 * Fetch Clarity live insights with URL dimension.
 * Caches in DB to stay within 10 req/day limit.
 */
export async function fetchClarityInsights(
  apiToken: string,
  numDays: number = 3
): Promise<ClarityInsight[]> {
  const db = createServerSupabase();

  // Check cache
  const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { data: cached } = await db
    .from("clarity_cache")
    .select("data")
    .eq("num_days", numDays)
    .gte("fetched_at", cutoff)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  if (cached?.data) {
    return cached.data as ClarityInsight[];
  }

  // Fetch from Clarity API
  const res = await fetch(
    `https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=${numDays}&dimension1=URL`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clarity API error (${res.status}): ${text}`);
  }

  const body: ClarityAPIResponse = await res.json();
  const insights: ClarityInsight[] = (body.results ?? []).map((r) => ({
    url: r.url,
    totalSessionCount: r.totalSessionCount ?? 0,
    pagesPerSession: r.pagesPerSession ?? 0,
    scrollDepth: r.scrollDepth ?? 0,
    activeTime: r.activeTime ?? 0,
    deadClickCount: r.deadClickCount ?? 0,
    rageClickCount: r.rageClickCount ?? 0,
    quickbackClickCount: r.quickbackClickCount ?? 0,
    excessiveScrollCount: r.excessiveScrollCount ?? 0,
  }));

  // Store in cache (delete old entries for same numDays first)
  await db.from("clarity_cache").delete().eq("num_days", numDays);
  await db.from("clarity_cache").insert({
    data: insights,
    num_days: numDays,
    fetched_at: new Date().toISOString(),
  });

  return insights;
}

/**
 * Quick connectivity test — minimal API call.
 */
export async function testClarityConnection(apiToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      "https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1&dimension1=URL",
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
