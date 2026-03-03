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
 * Fetch insights from a single Clarity project.
 */
async function fetchSingleProjectInsights(
  apiToken: string,
  projectId: string,
  numDays: number
): Promise<ClarityInsight[]> {
  const res = await fetch(
    `https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=${numDays}&dimension1=URL&projectId=${projectId}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clarity API error for project ${projectId} (${res.status}): ${text.slice(0, 200)}`);
  }

  const body: ClarityAPIResponse = await res.json();
  return (body.results ?? []).map((r) => ({
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
}

/**
 * Fetch Clarity live insights from multiple projects (per-language).
 * Caches merged results in DB to stay within 10 req/day limit per project.
 */
export async function fetchClarityInsights(
  apiToken: string,
  clarityProjectIds: Record<string, string>,
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

  // Deduplicate project IDs (multiple languages may share a project)
  const uniqueProjectIds = [...new Set(Object.values(clarityProjectIds).filter(Boolean))];

  if (uniqueProjectIds.length === 0) {
    return [];
  }

  // Fetch from each unique project and merge
  const allInsights: ClarityInsight[] = [];
  const results = await Promise.allSettled(
    uniqueProjectIds.map((pid) => fetchSingleProjectInsights(apiToken, pid, numDays))
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allInsights.push(...result.value);
    }
    // Skip failed projects silently — partial data is better than none
  }

  // Store in cache (delete old entries for same numDays first)
  await db.from("clarity_cache").delete().eq("num_days", numDays);
  await db.from("clarity_cache").insert({
    data: allInsights,
    num_days: numDays,
    fetched_at: new Date().toISOString(),
  });

  return allInsights;
}

/**
 * Quick connectivity test — minimal API call for a specific project.
 */
export async function testClarityConnection(
  apiToken: string,
  projectId?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = projectId
      ? `https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1&dimension1=URL&projectId=${projectId}`
      : "https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1&dimension1=URL";

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    });

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
