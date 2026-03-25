/**
 * Trustpilot review scraper
 *
 * Scrapes reviews from Trustpilot review pages by parsing __NEXT_DATA__ JSON.
 * No API key needed — works with a simple HTTP fetch + User-Agent header.
 *
 * Data structure:
 *   __NEXT_DATA__.props.pageProps.reviews[] — array of review objects
 *   __NEXT_DATA__.props.pageProps.businessUnit — company info
 *   __NEXT_DATA__.props.pageProps.filters.pagination — page info
 *
 * Pagination: ?languages=all&page=N (20 reviews per page)
 */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const REVIEWS_PER_PAGE = 20;
const DELAY_MS = 1200; // 1.2s between requests to be polite

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrustpilotReview {
  id: string;
  text: string;
  title: string | null;
  rating: number; // 1-5
  language: string; // "sv", "da", "no", "en", etc.
  publishedDate: string; // ISO
  experiencedDate: string | null;
  consumerName: string;
  consumerCountryCode: string | null;
  isVerified: boolean;
}

export interface TrustpilotBusinessInfo {
  id: string;
  displayName: string;
  stars: number;
  numberOfReviews: number;
}

interface ScrapeResult {
  reviews: TrustpilotReview[];
  businessInfo: TrustpilotBusinessInfo;
  totalPages: number;
  totalReviews: number;
  pagesScraped: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch a Trustpilot page and extract __NEXT_DATA__ */
async function fetchPageData(
  domain: string,
  page: number
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reviews: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  businessUnit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pagination: any;
} | null> {
  // Page 1 with ?page=1 triggers a 308 redirect that strips query params,
  // losing the languages=all filter. Omit page param for page 1.
  const url =
    page === 1
      ? `https://www.trustpilot.com/review/${domain}?languages=all`
      : `https://www.trustpilot.com/review/${domain}?languages=all&page=${page}`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) {
    console.error(
      `Trustpilot fetch failed: ${res.status} for ${domain} page ${page}`
    );
    return null;
  }

  const html = await res.text();

  // Extract __NEXT_DATA__ JSON blob
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) {
    console.error(`No __NEXT_DATA__ found for ${domain} page ${page}`);
    return null;
  }

  try {
    const data = JSON.parse(match[1]);
    const pageProps = data?.props?.pageProps;
    if (!pageProps) return null;

    return {
      reviews: pageProps.reviews ?? [],
      businessUnit: pageProps.businessUnit ?? {},
      pagination: pageProps.filters?.pagination ?? {},
    };
  } catch (e) {
    console.error(`Failed to parse __NEXT_DATA__ for ${domain}:`, e);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseReview(raw: any): TrustpilotReview {
  return {
    id: raw.id,
    text: raw.text ?? "",
    title: raw.title ?? null,
    rating: raw.rating ?? 0,
    language: raw.language ?? "en",
    publishedDate: raw.dates?.publishedDate ?? raw.dates?.experiencedDate ?? "",
    experiencedDate: raw.dates?.experiencedDate ?? null,
    consumerName: raw.consumer?.displayName ?? "Anonymous",
    consumerCountryCode: raw.consumer?.countryCode ?? null,
    isVerified:
      raw.labels?.verification?.verificationLevel === "verified" ||
      raw.labels?.verification?.isVerified === true,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scrape reviews from a Trustpilot business page.
 *
 * @param domain - The domain as it appears on Trustpilot (e.g. "osloskinlab.se")
 * @param opts.maxPages - Max pages to fetch (default 10, each page = 20 reviews)
 * @param opts.sinceDate - Stop when we hit reviews older than this
 * @returns Scraped reviews + business info
 */
export async function scrapeReviews(
  domain: string,
  opts?: { maxPages?: number; sinceDate?: Date }
): Promise<ScrapeResult> {
  const maxPages = opts?.maxPages ?? 10;
  const sinceDate = opts?.sinceDate;

  const allReviews: TrustpilotReview[] = [];
  let businessInfo: TrustpilotBusinessInfo = {
    id: "",
    displayName: domain,
    stars: 0,
    numberOfReviews: 0,
  };
  let totalPages = 1;
  let totalReviews = 0;
  let pagesScraped = 0;
  let hitOldReview = false;

  for (let page = 1; page <= maxPages && !hitOldReview; page++) {
    if (page > 1) await sleep(DELAY_MS);

    const data = await fetchPageData(domain, page);
    if (!data) break;

    pagesScraped++;

    // Extract business info from first page
    if (page === 1) {
      const bu = data.businessUnit;
      businessInfo = {
        id: bu.id ?? "",
        displayName: bu.displayName ?? domain,
        stars: bu.stars ?? 0,
        numberOfReviews: bu.numberOfReviews ?? 0,
      };
      totalPages = data.pagination.totalPages ?? 1;
      totalReviews = data.pagination.totalCount ?? 0;
    }

    // Stop if we've gone past the actual page count
    if (page > totalPages) break;

    for (const raw of data.reviews) {
      const review = parseReview(raw);

      // Skip empty reviews
      if (!review.text || review.text.trim().length < 10) continue;

      // Stop if we've hit reviews older than sinceDate
      if (sinceDate && review.publishedDate) {
        const reviewDate = new Date(review.publishedDate);
        if (reviewDate < sinceDate) {
          hitOldReview = true;
          break;
        }
      }

      allReviews.push(review);
    }

    // If page had no reviews, stop
    if (data.reviews.length === 0) break;
  }

  return {
    reviews: allReviews,
    businessInfo,
    totalPages: Math.min(totalPages, maxPages),
    totalReviews,
    pagesScraped,
  };
}

/**
 * Get basic business info for a Trustpilot domain.
 * Fetches only the first page to get company metadata.
 */
export async function getBusinessInfo(
  domain: string
): Promise<TrustpilotBusinessInfo | null> {
  const data = await fetchPageData(domain, 1);
  if (!data) return null;

  const bu = data.businessUnit;
  return {
    id: bu.id ?? "",
    displayName: bu.displayName ?? domain,
    stars: bu.stars ?? 0,
    numberOfReviews: bu.numberOfReviews ?? 0,
  };
}

/** Log scrape activity to usage_logs */
export async function logScrapeUsage(
  domain: string,
  reviewsScraped: number,
  pagesScraped: number
): Promise<void> {
  try {
    const { createServerSupabase } = await import("@/lib/supabase-admin");
    const db = createServerSupabase();

    await db.from("usage_logs").insert({
      type: "trustpilot_scrape",
      model: "trustpilot",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      metadata: {
        domain,
        reviews_scraped: reviewsScraped,
        pages_scraped: pagesScraped,
      },
    });
  } catch (e) {
    console.error("Failed to log Trustpilot scrape usage:", e);
  }
}
