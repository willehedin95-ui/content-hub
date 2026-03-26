/**
 * Apify integration for research scraping.
 *
 * Wraps the Apify REST API v2 to run actors and retrieve results.
 * Used for: Instagram Comments, Facebook Page Comments, TikTok Comments
 *
 * All actors use the synchronous run endpoint for simplicity (results in one call).
 * Falls back to async polling for long-running actors.
 */

import { createServerSupabase } from "@/lib/supabase-admin";

const APIFY_BASE = "https://api.apify.com/v2";

// --- Actor IDs ---
export const APIFY_ACTORS = {
  instagram_comments: "apify/instagram-comment-scraper",
  facebook_comments: "apify/facebook-comments-scraper",
  tiktok_comments: "clockworks/tiktok-comments-scraper",
  amazon_reviews: "web_wanderer/amazon-reviews-extractor",
} as const;

export type ApifyPlatform = keyof typeof APIFY_ACTORS;

/** Normalized output from any Apify scraper */
export interface ApifyReview {
  id: string;
  text: string;
  title: string | null;
  author: string;
  date: string;
  rating: number; // 0 for platforms without ratings
  language: string;
  metadata?: Record<string, unknown>;
}

// --- Run an Apify actor and get results ---

interface ApifyRunResult {
  items: Record<string, unknown>[];
  runId: string;
  status: string;
}

function getToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN env var not set");
  return token;
}

/**
 * Run an Apify actor synchronously (blocks until done, max 5 min).
 * For most comment scrapers, 100-500 items complete well within this.
 */
export async function runActorSync(
  actorId: string,
  input: Record<string, unknown>,
  timeoutSecs = 120
): Promise<ApifyRunResult> {
  const token = getToken();

  // Try sync-get-dataset-items first (single HTTP call)
  const url = `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSecs}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (res.status === 408) {
    // Timeout — fall back to async
    return runActorAsync(actorId, input);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify actor ${actorId} failed: ${res.status} — ${body.slice(0, 300)}`);
  }

  const items = (await res.json()) as Record<string, unknown>[];
  return { items, runId: "sync", status: "SUCCEEDED" };
}

/**
 * Run an Apify actor asynchronously with polling.
 * Used when sync times out (>2 min).
 */
export async function runActorAsync(
  actorId: string,
  input: Record<string, unknown>
): Promise<ApifyRunResult> {
  const token = getToken();

  // Start the run
  const startRes = await fetch(
    `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  if (!startRes.ok) {
    throw new Error(`Failed to start Apify actor ${actorId}: ${startRes.status}`);
  }

  const runData = (await startRes.json()) as { data: { id: string; defaultDatasetId: string } };
  const runId = runData.data.id;
  const datasetId = runData.data.defaultDatasetId;

  // Poll for completion (max 4 minutes)
  const maxPolls = 48; // 48 × 5s = 240s
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetch(
      `${APIFY_BASE}/actor-runs/${runId}?token=${token}`
    );
    const statusData = (await statusRes.json()) as { data: { status: string } };
    const status = statusData.data.status;

    if (status === "SUCCEEDED") {
      // Fetch results
      const itemsRes = await fetch(
        `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json&limit=1000`
      );
      const items = (await itemsRes.json()) as Record<string, unknown>[];
      return { items, runId, status };
    }

    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      throw new Error(`Apify run ${runId} ended with status: ${status}`);
    }
  }

  throw new Error(`Apify run ${runId} timed out after polling`);
}

// --- Platform-specific scrapers ---

export async function scrapeInstagramComments(
  postUrls: string[],
  opts?: { maxComments?: number }
): Promise<{ reviews: ApifyReview[]; totalScraped: number }> {
  const result = await runActorSync(APIFY_ACTORS.instagram_comments, {
    directUrls: postUrls,
    resultsLimit: opts?.maxComments ?? 200,
  });

  const reviews: ApifyReview[] = result.items.map((item, i) => ({
    id: String(item.id ?? `ig_${i}`),
    text: String(item.text ?? ""),
    title: null,
    author: String(item.ownerUsername ?? item.owner_username ?? "unknown"),
    date:
      String(item.timestamp ?? item.created_at ?? new Date().toISOString()),
    rating: 0,
    language: detectLanguage(String(item.text ?? "")),
    metadata: {
      likes: item.likesCount ?? item.likes_count ?? 0,
      replies: item.repliesCount ?? item.replies_count ?? 0,
      platform: "instagram",
    },
  }));

  return { reviews: reviews.filter((r) => r.text.length >= 10), totalScraped: reviews.length };
}

export async function scrapeFacebookComments(
  postUrls: string[],
  opts?: { maxComments?: number }
): Promise<{ reviews: ApifyReview[]; totalScraped: number }> {
  const result = await runActorSync(APIFY_ACTORS.facebook_comments, {
    startUrls: postUrls.map((url) => ({ url })),
    resultsLimit: opts?.maxComments ?? 200,
    includeNestedComments: true,
  });

  const reviews: ApifyReview[] = result.items.map((item, i) => ({
    id: String(item.id ?? `fb_${i}`),
    text: String(item.commentText ?? item.text ?? ""),
    title: null,
    author: String(item.authorName ?? item.author_name ?? "unknown"),
    date: item.timestamp
      ? typeof item.timestamp === "number"
        ? new Date(item.timestamp as number).toISOString()
        : String(item.timestamp)
      : new Date().toISOString(),
    rating: 0,
    language: detectLanguage(String(item.commentText ?? item.text ?? "")),
    metadata: {
      likes: item.likesCount ?? item.likes_count ?? 0,
      reactions: item.reactionsCount ?? item.reactions_count ?? 0,
      platform: "facebook",
    },
  }));

  return { reviews: reviews.filter((r) => r.text.length >= 10), totalScraped: reviews.length };
}

export async function scrapeTikTokComments(
  videoUrls: string[],
  opts?: { maxComments?: number }
): Promise<{ reviews: ApifyReview[]; totalScraped: number }> {
  const result = await runActorSync(APIFY_ACTORS.tiktok_comments, {
    postURLs: videoUrls,
    commentsPerPost: opts?.maxComments ?? 200,
  });

  const reviews: ApifyReview[] = result.items.map((item, i) => {
    const user = (item.user as Record<string, unknown>) ?? {};
    return {
      id: String(item.cid ?? `tt_${i}`),
      text: String(item.text ?? ""),
      title: null,
      author: String(user.uniqueId ?? user.unique_id ?? "unknown"),
      date: item.createTime
        ? new Date((item.createTime as number) * 1000).toISOString()
        : new Date().toISOString(),
      rating: 0,
      language: detectLanguage(String(item.text ?? "")),
      metadata: {
        likes: item.diggCount ?? item.digg_count ?? 0,
        replies: item.replyCount ?? item.reply_count ?? 0,
        platform: "tiktok",
      },
    };
  });

  return { reviews: reviews.filter((r) => r.text.length >= 10), totalScraped: reviews.length };
}

// --- Amazon Reviews (via Apify — Amazon blocks HTTP scraping) ---

const AMAZON_MARKETPLACE_URLS: Record<string, string> = {
  se: "https://www.amazon.se/dp/",
  de: "https://www.amazon.de/dp/",
  uk: "https://www.amazon.co.uk/dp/",
  us: "https://www.amazon.com/dp/",
  dk: "https://www.amazon.de/dp/", // Denmark uses German Amazon
  no: "https://www.amazon.se/dp/", // Norway uses Swedish Amazon
};

export async function scrapeAmazonReviewsViaApify(
  asin: string,
  opts?: { marketplace?: string; maxReviews?: number }
): Promise<{
  reviews: ApifyReview[];
  totalScraped: number;
  productInfo: { asin: string; title: string; totalReviews: number } | null;
}> {
  const marketplace = opts?.marketplace ?? "us";
  const baseUrl = AMAZON_MARKETPLACE_URLS[marketplace] ?? AMAZON_MARKETPLACE_URLS.us;
  const productUrl = `${baseUrl}${asin}`;

  // web_wanderer actor uses "products" array input
  const result = await runActorSync(
    APIFY_ACTORS.amazon_reviews,
    {
      products: [productUrl],
      maxReviews: opts?.maxReviews ?? 50,
      sort: "recent",
    },
    180 // 3 min timeout for Amazon
  );

  let productInfo: { asin: string; title: string; totalReviews: number } | null = null;

  const reviews: ApifyReview[] = result.items.map((item, i) => {
    // Extract product info from first item (web_wanderer fields)
    if (!productInfo && item.productTitle) {
      const summary = (item.ratingSummary ?? {}) as Record<string, number>;
      const totalFromSummary = Object.values(summary).reduce((a, b) => a + (b || 0), 0);
      productInfo = {
        asin: String(item.productAsin ?? asin),
        title: String(item.productTitle ?? asin),
        totalReviews: totalFromSummary || 0,
      };
    }

    return {
      id: String(item.reviewId ?? `amz_${i}`),
      text: String(item.reviewText ?? item.reviewDescription ?? ""),
      title: String(item.reviewTitle ?? ""),
      author: String(item.profileName ?? item.userId ?? "Anonymous"),
      date: String(item.reviewDate ?? item.date ?? new Date().toISOString()),
      rating: Number(item.rating ?? item.ratingScore ?? 0),
      language: item.language
        ? String(item.language)
        : detectLanguage(String(item.reviewText ?? item.reviewDescription ?? "")),
      metadata: {
        verified: item.isVerified === true || String(item.reviewedIn ?? "").includes("Verified"),
        vine: item.isAmazonVine === true,
        helpful: Number(item.helpfulVoteCount ?? item.reviewReaction ?? 0),
        variant: String(item.variant ?? ""),
        platform: "amazon",
        marketplace,
      },
    };
  });

  return {
    reviews: reviews.filter((r) => r.text.length >= 10),
    totalScraped: reviews.length,
    productInfo,
  };
}

// --- Usage logging ---

export async function logApifyUsage(
  actorId: string,
  platform: string,
  itemsScraped: number
): Promise<void> {
  try {
    const db = createServerSupabase();
    await db.from("usage_logs").insert({
      type: "apify_scrape",
      metadata: {
        actor_id: actorId,
        platform,
        items_scraped: itemsScraped,
      },
    });
  } catch {
    // Non-critical
  }
}

// --- Helper ---

function detectLanguage(text: string): string {
  const hasSwedish =
    /[åäöÅÄÖ]/.test(text) ||
    /\b(och|att|för|det|har|inte|med|som|kan|man|på|är|var)\b/i.test(text);
  const hasNorwegian =
    /\b(og|det|har|ikke|med|som|kan|på|er|var|etter|veldig)\b/i.test(text) &&
    !hasSwedish;
  const hasDanish =
    /[æøÆØ]/.test(text) ||
    (/\b(og|det|har|ikke|med|som|kan|på|er|var|efter|meget)\b/i.test(text) &&
      !hasSwedish &&
      !hasNorwegian);

  if (hasSwedish) return "sv";
  if (hasNorwegian) return "no";
  if (hasDanish) return "da";
  return "en";
}
