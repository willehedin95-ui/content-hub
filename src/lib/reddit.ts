/**
 * Reddit scraper using the public JSON API.
 *
 * Appends .json to Reddit URLs — no auth needed, no npm packages.
 * Rate limit: ~10 requests/min for unauthenticated access.
 * We use 2s delay between requests to stay well within limits.
 *
 * Two modes:
 * 1. Subreddit scraping — fetches recent posts from a subreddit
 * 2. Search — searches Reddit for specific terms (e.g., "collagen supplement")
 */

import { createServerSupabase } from "@/lib/supabase-admin";

const USER_AGENT = "ContentHub Research Bot/1.0 (research intelligence)";
const REQUEST_DELAY_MS = 2000;
const MAX_ITEMS_PER_PAGE = 100;

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  score: number;
  numComments: number;
  createdUtc: number;
  permalink: string;
  isComment: boolean;
}

export interface RedditScrapeResult {
  posts: RedditPost[];
  subredditInfo: { name: string; subscribers: number } | null;
  pagesScraped: number;
  totalScraped: number;
}

/**
 * Scrape posts from a subreddit.
 * @param subreddit - Subreddit name without "r/" prefix (e.g., "SkincareAddiction")
 * @param opts.maxPages - Max pages to fetch (default: 5, each page ~100 posts)
 * @param opts.sinceDate - Only return posts after this date
 * @param opts.searchQuery - If set, search within the subreddit for this query
 */
export async function scrapeSubreddit(
  subreddit: string,
  opts?: {
    maxPages?: number;
    sinceDate?: Date;
    searchQuery?: string;
  }
): Promise<RedditScrapeResult> {
  const maxPages = opts?.maxPages ?? 5;
  const sinceTimestamp = opts?.sinceDate
    ? opts.sinceDate.getTime() / 1000
    : 0;

  const posts: RedditPost[] = [];
  let after: string | null = null;
  let pagesScraped = 0;
  let subredditInfo: { name: string; subscribers: number } | null = null;

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }

    const url = opts?.searchQuery
      ? buildSearchUrl(subreddit, opts.searchQuery, after)
      : buildListingUrl(subreddit, after);

    const response = await fetchRedditJson(url);
    if (!response) break;

    const listing = response.data;
    if (!listing?.children?.length) break;

    pagesScraped++;

    // Extract subreddit info from first response
    if (!subredditInfo && !opts?.searchQuery) {
      subredditInfo = { name: subreddit, subscribers: 0 };
    }

    let hitDateLimit = false;
    for (const child of listing.children) {
      const data = child.data;
      if (!data) continue;

      const createdUtc = data.created_utc ?? 0;

      // Stop if we've gone past the date limit
      if (sinceTimestamp > 0 && createdUtc < sinceTimestamp) {
        hitDateLimit = true;
        break;
      }

      // Skip deleted/removed posts
      if (data.author === "[deleted]" || data.author === "[removed]") continue;

      // Need actual text content (not just links/images)
      const text = data.selftext || data.body || "";
      if (text.length < 20) continue;

      // Skip AutoModerator and bots
      if (data.author === "AutoModerator") continue;

      posts.push({
        id: data.id ?? data.name ?? `reddit_${Date.now()}_${posts.length}`,
        subreddit: data.subreddit ?? subreddit,
        title: data.title ?? "",
        selftext: text,
        author: data.author ?? "Anonymous",
        score: data.score ?? 0,
        numComments: data.num_comments ?? 0,
        createdUtc,
        permalink: data.permalink
          ? `https://reddit.com${data.permalink}`
          : "",
        isComment: child.kind === "t1",
      });
    }

    if (hitDateLimit) break;

    after = listing.after;
    if (!after) break;
  }

  return {
    posts,
    subredditInfo,
    pagesScraped,
    totalScraped: posts.length,
  };
}

/**
 * Search Reddit globally for a query.
 */
export async function searchReddit(
  query: string,
  opts?: { maxPages?: number; sinceDate?: Date }
): Promise<RedditScrapeResult> {
  const maxPages = opts?.maxPages ?? 3;
  const sinceTimestamp = opts?.sinceDate
    ? opts.sinceDate.getTime() / 1000
    : 0;

  const posts: RedditPost[] = [];
  let after: string | null = null;
  let pagesScraped = 0;

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }

    const params = new URLSearchParams({
      q: query,
      sort: "new",
      limit: String(MAX_ITEMS_PER_PAGE),
      t: "month",
      restrict_sr: "false",
      type: "link",
    });
    if (after) params.set("after", after);

    const url = `https://www.reddit.com/search.json?${params}`;
    const response = await fetchRedditJson(url);
    if (!response) break;

    const listing = response.data;
    if (!listing?.children?.length) break;

    pagesScraped++;

    for (const child of listing.children) {
      const data = child.data;
      if (!data) continue;

      const createdUtc = data.created_utc ?? 0;
      if (sinceTimestamp > 0 && createdUtc < sinceTimestamp) continue;
      if (data.author === "[deleted]" || data.author === "AutoModerator")
        continue;

      const text = data.selftext || "";
      if (text.length < 20) continue;

      posts.push({
        id: data.id ?? `reddit_search_${posts.length}`,
        subreddit: data.subreddit ?? "",
        title: data.title ?? "",
        selftext: text,
        author: data.author ?? "Anonymous",
        score: data.score ?? 0,
        numComments: data.num_comments ?? 0,
        createdUtc,
        permalink: data.permalink
          ? `https://reddit.com${data.permalink}`
          : "",
        isComment: false,
      });
    }

    after = listing.after;
    if (!after) break;
  }

  return {
    posts,
    subredditInfo: null,
    pagesScraped,
    totalScraped: posts.length,
  };
}

export async function logScrapeUsage(
  source: string,
  postsScraped: number,
  pagesScraped: number
): Promise<void> {
  try {
    const db = createServerSupabase();
    await db.from("usage_logs").insert({
      type: "reddit_scrape",
      metadata: { source, posts_scraped: postsScraped, pages_scraped: pagesScraped },
    });
  } catch {
    // Non-critical, don't fail the pipeline
  }
}

// --- Internal helpers ---

function buildListingUrl(subreddit: string, after: string | null): string {
  const params = new URLSearchParams({
    sort: "new",
    limit: String(MAX_ITEMS_PER_PAGE),
    t: "month",
  });
  if (after) params.set("after", after);
  return `https://www.reddit.com/r/${subreddit}/new.json?${params}`;
}

function buildSearchUrl(
  subreddit: string,
  query: string,
  after: string | null
): string {
  const params = new URLSearchParams({
    q: query,
    restrict_sr: "on",
    sort: "new",
    limit: String(MAX_ITEMS_PER_PAGE),
    t: "month",
  });
  if (after) params.set("after", after);
  return `https://www.reddit.com/r/${subreddit}/search.json?${params}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchRedditJson(url: string): Promise<any | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (response.status === 429) {
      console.warn("Reddit rate limit hit, stopping");
      return null;
    }

    if (!response.ok) {
      console.error(`Reddit fetch failed: ${response.status} for ${url}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error("Reddit fetch error:", err);
    return null;
  }
}
