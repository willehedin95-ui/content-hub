/**
 * DataForSEO API client for keyword research.
 * Pay-as-you-go: ~$0.05/task for keyword data, ~$0.002/query for SERP.
 * Docs: https://docs.dataforseo.com/v3/
 */

// Location codes for our markets
const LOCATION_CODES: Record<string, number> = {
  SE: 2752, // Sweden
  NO: 2578, // Norway
  DK: 2208, // Denmark
};

const LANGUAGE_CODES: Record<string, string> = {
  SE: "sv",
  NO: "no",
  DK: "da",
};

function getAuth(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error("DataForSEO not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.");
  }
  return Buffer.from(`${login}:${password}`).toString("base64");
}

export function isDataForSeoConfigured(): boolean {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

async function dfsPost<T>(endpoint: string, body: unknown[]): Promise<T> {
  const res = await fetch(`https://api.dataforseo.com/v3${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getAuth()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO error (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data.status_code !== 20000) {
    throw new Error(`DataForSEO API error: ${data.status_message}`);
  }

  return data as T;
}

// ---- Types ----

export interface KeywordVolume {
  keyword: string;
  searchVolume: number | null;
  competition: string | null; // HIGH, MEDIUM, LOW
  competitionIndex: number | null; // 0-100
  cpc: number | null;
  lowBid: number | null;
  highBid: number | null;
  monthlySearches: { year: number; month: number; searchVolume: number }[];
}

export interface KeywordSuggestion extends KeywordVolume {
  // Same fields as KeywordVolume
}

// ---- API Response types ----

interface DfsResponse<T> {
  version: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  tasks_count: number;
  tasks_error: number;
  tasks: Array<{
    id: string;
    status_code: number;
    status_message: string;
    time: string;
    cost: number;
    result_count: number;
    result: T[];
  }>;
}

interface DfsKeywordResult {
  keyword: string;
  spell: string | null;
  search_volume: number | null;
  competition: string | null;
  competition_index: number | null;
  cpc: number | null;
  low_top_of_page_bid: number | null;
  high_top_of_page_bid: number | null;
  monthly_searches: Array<{ year: number; month: number; search_volume: number }> | null;
}

// ---- Public API ----

/**
 * Get search volume + competition for a list of keywords.
 * Cost: ~$0.05 per task (up to 1000 keywords per task).
 */
export async function getSearchVolume(
  keywords: string[],
  market: "SE" | "NO" | "DK" = "SE"
): Promise<{ keywords: KeywordVolume[]; cost: number }> {
  const locationCode = LOCATION_CODES[market];
  const languageCode = LANGUAGE_CODES[market];

  const response = await dfsPost<DfsResponse<DfsKeywordResult>>(
    "/keywords_data/google_ads/search_volume/live",
    [
      {
        keywords: keywords.slice(0, 1000),
        location_code: locationCode,
        language_code: languageCode,
      },
    ]
  );

  const task = response.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO task error: ${task?.status_message || "No task returned"}`);
  }

  const result = (task.result ?? []).map(mapKeywordResult);
  return { keywords: result, cost: response.cost };
}

/**
 * Get keyword suggestions based on seed keywords.
 * Cost: ~$0.05 per task.
 */
export async function getKeywordSuggestions(
  seedKeywords: string[],
  market: "SE" | "NO" | "DK" = "SE"
): Promise<{ suggestions: KeywordSuggestion[]; cost: number }> {
  const locationCode = LOCATION_CODES[market];
  const languageCode = LANGUAGE_CODES[market];

  const response = await dfsPost<DfsResponse<DfsKeywordResult>>(
    "/keywords_data/google_ads/keywords_for_keywords/live",
    [
      {
        keywords: seedKeywords.slice(0, 20),
        location_code: locationCode,
        language_code: languageCode,
        sort_by: "search_volume",
      },
    ]
  );

  const task = response.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO task error: ${task?.status_message || "No task returned"}`);
  }

  const suggestions = (task.result ?? []).map(mapKeywordResult);
  return { suggestions, cost: response.cost };
}

/**
 * Get keyword suggestions for a competitor domain/URL.
 * Cost: ~$0.05 per task.
 */
export async function getKeywordsForSite(
  target: string,
  market: "SE" | "NO" | "DK" = "SE",
  targetType: "site" | "page" = "site"
): Promise<{ suggestions: KeywordSuggestion[]; cost: number }> {
  const locationCode = LOCATION_CODES[market];
  const languageCode = LANGUAGE_CODES[market];

  const response = await dfsPost<DfsResponse<DfsKeywordResult>>(
    "/keywords_data/google_ads/keywords_for_site/live",
    [
      {
        target,
        target_type: targetType,
        location_code: locationCode,
        language_code: languageCode,
        sort_by: "search_volume",
      },
    ]
  );

  const task = response.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO task error: ${task?.status_message || "No task returned"}`);
  }

  const suggestions = (task.result ?? []).map(mapKeywordResult);
  return { suggestions, cost: response.cost };
}

// ---- Helpers ----

function mapKeywordResult(r: DfsKeywordResult): KeywordVolume {
  return {
    keyword: r.keyword,
    searchVolume: r.search_volume,
    competition: r.competition,
    competitionIndex: r.competition_index,
    cpc: r.cpc,
    lowBid: r.low_top_of_page_bid,
    highBid: r.high_top_of_page_bid,
    monthlySearches: (r.monthly_searches ?? []).map((m) => ({
      year: m.year,
      month: m.month,
      searchVolume: m.search_volume,
    })),
  };
}
