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
const MAX_PAGES_PER_STAR = 10; // Trustpilot caps at 10 pages per filter combo

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

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";

/**
 * Thrown when a page can't be read because Trustpilot is blocking us
 * (Cloudflare challenge, 403, etc). Callers surface this as a source error
 * instead of treating it as "no new reviews" — otherwise a block looks
 * identical to a quiet week and the scraper dies silently.
 */
export class TrustpilotBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustpilotBlockedError";
  }
}

/**
 * Fetch raw HTML for a Trustpilot URL.
 *
 * Trustpilot is behind a Cloudflare challenge that a plain fetch can't pass
 * (returns a 403 "Verifying Connection" page). When FIRECRAWL_API_KEY is set
 * we route through Firecrawl's stealth proxy, which solves the challenge and
 * returns the real HTML. Without a key we fall back to a direct fetch (kept
 * for local dev and in case Trustpilot ever drops the challenge).
 *
 * Returns null on transport failure.
 */
async function getPageHtml(url: string): Promise<string | null> {
  if (FIRECRAWL_API_KEY) {
    try {
      const res = await fetch(FIRECRAWL_SCRAPE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["rawHtml"],
          proxy: "stealth", // 5 credits/page — required to beat Cloudflare
          onlyMainContent: false,
          waitFor: 3000,
        }),
      });
      if (!res.ok) {
        console.error(`Firecrawl scrape failed: ${res.status} for ${url}`);
        return null;
      }
      const json = await res.json();
      if (!json?.success) {
        console.error(`Firecrawl success=false for ${url}`);
        return null;
      }
      return (json.data?.rawHtml as string) ?? null;
    } catch (e) {
      console.error(`Firecrawl request error for ${url}:`, e);
      return null;
    }
  }

  // Legacy direct fetch (blocked by Cloudflare as of ~2026-04).
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    console.error(`Trustpilot fetch failed: ${res.status} for ${url}`);
    return null;
  }
  return res.text();
}

/** Fetch a Trustpilot page and extract __NEXT_DATA__ */
async function fetchPageData(
  domain: string,
  page: number,
  stars?: number
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
  const starParam = stars ? `&stars=${stars}` : "";
  const url =
    page === 1
      ? `https://www.trustpilot.com/review/${domain}?languages=all${starParam}`
      : `https://www.trustpilot.com/review/${domain}?languages=all${starParam}&page=${page}`;

  const html = await getPageHtml(url);

  if (html === null) {
    throw new TrustpilotBlockedError(
      `Trustpilot fetch failed for ${domain} page ${page}`
    );
  }

  // Extract __NEXT_DATA__ JSON blob. If it's missing the page is almost
  // always a Cloudflare "Verifying Connection" challenge, not an empty page —
  // surface it as a block so the source gets flagged instead of silently
  // reporting "0 new reviews".
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) {
    throw new TrustpilotBlockedError(
      `No __NEXT_DATA__ for ${domain} page ${page} (likely Cloudflare challenge)`
    );
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

    let data;
    try {
      data = await fetchPageData(domain, page);
    } catch (err) {
      // A block on page 1 means we got nothing — surface it so the source
      // is flagged. On later pages, keep whatever we already collected.
      if (page === 1) throw err;
      break;
    }
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
 * Deep scrape using per-star filtering.
 *
 * Trustpilot caps pagination at 10 pages (200 reviews) per filter combo.
 * By scraping each star level separately (1-5), we get independent 10-page
 * limits — typically 3x more reviews (e.g. 611/787 instead of 200/787).
 *
 * Deduplication is handled by the caller via DB upsert on external_review_id.
 */
export async function scrapeReviewsByStars(
  domain: string,
  opts?: { maxPagesPerStar?: number; sinceDate?: Date }
): Promise<ScrapeResult> {
  const maxPerStar = Math.min(opts?.maxPagesPerStar ?? MAX_PAGES_PER_STAR, MAX_PAGES_PER_STAR);
  const sinceDate = opts?.sinceDate;

  const allReviews: TrustpilotReview[] = [];
  const seenIds = new Set<string>();
  let businessInfo: TrustpilotBusinessInfo = {
    id: "",
    displayName: domain,
    stars: 0,
    numberOfReviews: 0,
  };
  let totalReviews = 0;
  let pagesScraped = 0;

  // Get business info from main page first
  const mainData = await fetchPageData(domain, 1);
  if (mainData) {
    const bu = mainData.businessUnit;
    businessInfo = {
      id: bu.id ?? "",
      displayName: bu.displayName ?? domain,
      stars: bu.stars ?? 0,
      numberOfReviews: bu.numberOfReviews ?? 0,
    };
    totalReviews = mainData.pagination.totalCount ?? 0;
  }

  // Scrape each star level (5 down to 1 — most valuable first)
  for (const star of [5, 4, 3, 2, 1]) {
    let hitOldReview = false;

    for (let page = 1; page <= maxPerStar && !hitOldReview; page++) {
      await sleep(DELAY_MS);

      let data;
      try {
        data = await fetchPageData(domain, page, star);
      } catch {
        // Business info already captured from the main page above; a block
        // mid-deep-scan just stops this star level rather than failing the run.
        break;
      }
      if (!data) break;

      pagesScraped++;

      // Check if Trustpilot returned a login/redirect page (pagination cap hit)
      if (data.reviews.length === 0) break;

      const starTotalPages = data.pagination.totalPages ?? 1;
      if (page > starTotalPages) break;

      for (const raw of data.reviews) {
        const review = parseReview(raw);

        if (!review.text || review.text.trim().length < 10) continue;
        if (seenIds.has(review.id)) continue;

        if (sinceDate && review.publishedDate) {
          const reviewDate = new Date(review.publishedDate);
          if (reviewDate < sinceDate) {
            hitOldReview = true;
            break;
          }
        }

        seenIds.add(review.id);
        allReviews.push(review);
      }
    }
  }

  return {
    reviews: allReviews,
    businessInfo,
    totalPages: pagesScraped,
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
  let data;
  try {
    data = await fetchPageData(domain, 1);
  } catch {
    return null; // Non-critical (SERP stars) — never throw into publish paths.
  }
  if (!data) return null;

  const bu = data.businessUnit;
  return {
    id: bu.id ?? "",
    displayName: bu.displayName ?? domain,
    stars: bu.stars ?? 0,
    numberOfReviews: bu.numberOfReviews ?? 0,
  };
}

/**
 * Cached business info lookup. Returns rating data from trustpilot_cache
 * if it was fetched within `maxAgeHours` (default 24). Otherwise fetches
 * fresh and updates cache. Returns null if fetch fails and no cache exists.
 *
 * Use this from publish-time paths so we don't hammer Trustpilot on every
 * article publish - 1 call per day per domain is plenty for SERP star
 * snippets where small rating changes don't matter day-to-day.
 */
export async function getCachedBusinessInfo(
  domain: string,
  maxAgeHours = 24
): Promise<TrustpilotBusinessInfo | null> {
  try {
    const { createServerSupabase } = await import("@/lib/supabase-admin");
    const db = createServerSupabase();

    // Check cache
    const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
    const { data: cached } = await db
      .from("trustpilot_cache")
      .select("business_id, display_name, stars, review_count, fetched_at")
      .eq("domain", domain)
      .gte("fetched_at", cutoff)
      .maybeSingle();

    if (cached && cached.stars && cached.review_count) {
      return {
        id: (cached.business_id as string) || "",
        displayName: (cached.display_name as string) || domain,
        stars: cached.stars as number,
        numberOfReviews: cached.review_count as number,
      };
    }

    // Fetch fresh
    const fresh = await getBusinessInfo(domain);
    if (!fresh) {
      // Fall back to stale cache if we have one
      const { data: stale } = await db
        .from("trustpilot_cache")
        .select("business_id, display_name, stars, review_count")
        .eq("domain", domain)
        .maybeSingle();
      if (stale && stale.stars) {
        return {
          id: (stale.business_id as string) || "",
          displayName: (stale.display_name as string) || domain,
          stars: stale.stars as number,
          numberOfReviews: (stale.review_count as number) || 0,
        };
      }
      return null;
    }

    // Update cache
    await db.from("trustpilot_cache").upsert(
      {
        domain,
        business_id: fresh.id,
        display_name: fresh.displayName,
        stars: fresh.stars,
        review_count: fresh.numberOfReviews,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "domain" }
    );

    return fresh;
  } catch (err) {
    console.warn(`[trustpilot] getCachedBusinessInfo failed for ${domain}:`, err);
    return null;
  }
}

/**
 * Build Product schema with aggregateRating for SERP star snippets.
 * Only emit when we have real rating data - Google penalizes fabricated
 * aggregateRating heavily.
 */
export function buildProductRatingSchema(opts: {
  productName: string;
  productUrl: string;
  productImage?: string;
  productDescription?: string;
  brandName: string;
  rating: number;
  reviewCount: number;
  reviewUrl?: string;
}): string {
  if (opts.rating < 1 || opts.rating > 5 || opts.reviewCount < 1) {
    return "";
  }
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.productName,
    url: opts.productUrl,
    ...(opts.productImage ? { image: opts.productImage } : {}),
    ...(opts.productDescription ? { description: opts.productDescription } : {}),
    brand: {
      "@type": "Brand",
      name: opts.brandName,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: Math.round(opts.rating * 10) / 10,
      reviewCount: opts.reviewCount,
      bestRating: 5,
      worstRating: 1,
      ...(opts.reviewUrl ? { url: opts.reviewUrl } : {}),
    },
  });
}

/**
 * Should this article get Product+aggregateRating schema? Only commercial-
 * intent articles benefit - Google doesn't grant star rich snippets to
 * informational content even with valid schema.
 */
export function isProductRecommendationArticle(
  category: string | undefined,
  templateId: string
): boolean {
  if (["listicle", "comparison", "buying-guide", "testimonial"].includes(templateId)) {
    return true;
  }
  if (!category) return false;
  return /bäst|bedst|best|test|jämför|jamfor|sammenligning|köpguide|kopguide|kjopeguide|recension|review/i.test(category);
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
