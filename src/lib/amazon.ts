/**
 * Amazon review scraper using HTTP fetch + cheerio HTML parsing.
 *
 * Scrapes product reviews from Amazon marketplace pages.
 * No JS rendering needed — Amazon review pages are server-rendered HTML.
 *
 * Reliability: May fail intermittently due to CAPTCHA/anti-bot.
 * When detected, source gets status: "error" and retries next day.
 */

import * as cheerio from "cheerio";
import { createServerSupabase } from "@/lib/supabase-admin";

const REQUEST_DELAY_MS = 3000;
const MAX_REVIEWS_PER_PAGE = 10;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
];

const MARKETPLACE_DOMAINS: Record<string, string> = {
  se: "www.amazon.se",
  de: "www.amazon.de",
  uk: "www.amazon.co.uk",
  us: "www.amazon.com",
  dk: "www.amazon.de", // Denmark uses German Amazon
  no: "www.amazon.se", // Norway uses Swedish Amazon
};

export interface AmazonReview {
  id: string;
  title: string;
  text: string;
  rating: number;
  author: string;
  date: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
}

export interface AmazonProductInfo {
  asin: string;
  title: string;
  averageRating: number;
  totalReviews: number;
}

export interface AmazonScrapeResult {
  reviews: AmazonReview[];
  productInfo: AmazonProductInfo | null;
  pagesScraped: number;
  totalScraped: number;
  blocked: boolean;
}

/**
 * Extract ASIN from Amazon URL or return raw ASIN.
 * Handles formats: full URL, /dp/ASIN, /product-reviews/ASIN, or plain ASIN.
 */
export function extractAsin(input: string): string | null {
  // Already a clean ASIN (10 chars, alphanumeric starting with B0)
  if (/^[A-Z0-9]{10}$/.test(input)) return input;

  // Extract from URL patterns
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/,
    /\/product-reviews\/([A-Z0-9]{10})/,
    /\/gp\/product\/([A-Z0-9]{10})/,
    /\/ASIN\/([A-Z0-9]{10})/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Scrape reviews for an Amazon product.
 *
 * @param asin - Amazon product ASIN (e.g., "B0XXXXXX")
 * @param opts.marketplace - "se", "de", "uk", "us" (default: "se")
 * @param opts.maxPages - Max pages to scrape (default: 5, 10 reviews/page)
 * @param opts.sinceDate - Only return reviews after this date
 */
export async function scrapeAmazonReviews(
  asin: string,
  opts?: {
    marketplace?: string;
    maxPages?: number;
    sinceDate?: Date;
  }
): Promise<AmazonScrapeResult> {
  const marketplace = opts?.marketplace ?? "se";
  const maxPages = opts?.maxPages ?? 5;
  const domain = MARKETPLACE_DOMAINS[marketplace] ?? MARKETPLACE_DOMAINS.se;

  const reviews: AmazonReview[] = [];
  let productInfo: AmazonProductInfo | null = null;
  let pagesScraped = 0;
  let blocked = false;

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }

    const url = `https://${domain}/product-reviews/${asin}?pageNumber=${page}&sortBy=recent&reviewerType=all_reviews`;
    const html = await fetchAmazonPage(url);

    if (!html) {
      blocked = true;
      break;
    }

    // Detect CAPTCHA
    if (
      html.includes("captcha") ||
      html.includes("Type the characters you see") ||
      html.includes("Robot Check")
    ) {
      console.warn("Amazon CAPTCHA detected");
      blocked = true;
      break;
    }

    const $ = cheerio.load(html);
    pagesScraped++;

    // Extract product info from first page
    if (!productInfo) {
      const titleEl = $("a[data-hook='product-link']").first();
      const avgRatingText = $(
        "span[data-hook='rating-out-of-text']"
      )
        .first()
        .text();
      const totalText = $(
        "div[data-hook='cr-filter-info-review-rating-count']"
      )
        .first()
        .text();

      const avgMatch = avgRatingText.match(/([\d,.]+)/);
      const totalMatch = totalText.match(/([\d,. ]+)/);

      productInfo = {
        asin,
        title: titleEl.text().trim() || asin,
        averageRating: avgMatch
          ? parseFloat(avgMatch[1].replace(",", "."))
          : 0,
        totalReviews: totalMatch
          ? parseInt(totalMatch[1].replace(/[^0-9]/g, ""))
          : 0,
      };
    }

    // Extract reviews
    const reviewElements = $("div[data-hook='review']");
    if (reviewElements.length === 0) break;

    let hitDateLimit = false;
    reviewElements.each((_, el) => {
      if (hitDateLimit) return;

      const $el = $(el);
      const reviewId = $el.attr("id") ?? `amazon_${asin}_${page}_${reviews.length}`;

      // Rating: "X.0 out of 5 stars" or "X,0 av 5 stjärnor" etc.
      const ratingText = $el
        .find("i[data-hook='review-star-rating'] span, i[data-hook='cmps-review-star-rating'] span")
        .first()
        .text();
      const ratingMatch = ratingText.match(/([\d,.]+)/);
      const rating = ratingMatch
        ? parseFloat(ratingMatch[1].replace(",", "."))
        : 0;

      const title = $el
        .find("a[data-hook='review-title'] span:not(.a-letter-space):last, span[data-hook='review-title'] span:last")
        .text()
        .trim();

      const text = $el
        .find("span[data-hook='review-body'] span")
        .first()
        .text()
        .trim();

      const author = $el
        .find("span.a-profile-name")
        .first()
        .text()
        .trim();

      const dateText = $el
        .find("span[data-hook='review-date']")
        .text()
        .trim();

      const verifiedPurchase = $el
        .find("span[data-hook='avp-badge']")
        .length > 0;

      const helpfulText = $el
        .find("span[data-hook='helpful-vote-statement']")
        .text();
      const helpfulMatch = helpfulText.match(/(\d+)/);

      // Skip empty reviews
      if (!text || text.length < 10) return;

      // Basic date parsing — check if we've gone past sinceDate
      if (opts?.sinceDate && dateText) {
        const reviewDate = parseAmazonDate(dateText);
        if (reviewDate && reviewDate < opts.sinceDate) {
          hitDateLimit = true;
          return;
        }
      }

      reviews.push({
        id: reviewId,
        title,
        text,
        rating,
        author: author || "Anonymous",
        date: dateText,
        verifiedPurchase,
        helpfulCount: helpfulMatch ? parseInt(helpfulMatch[1]) : 0,
      });
    });

    if (hitDateLimit) break;

    // If we got fewer reviews than expected, we're probably on the last page
    if (reviewElements.length < MAX_REVIEWS_PER_PAGE) break;
  }

  return {
    reviews,
    productInfo,
    pagesScraped,
    totalScraped: reviews.length,
    blocked,
  };
}

export async function logScrapeUsage(
  asin: string,
  reviewsScraped: number,
  pagesScraped: number
): Promise<void> {
  try {
    const db = createServerSupabase();
    await db.from("usage_logs").insert({
      type: "amazon_scrape",
      metadata: {
        asin,
        reviews_scraped: reviewsScraped,
        pages_scraped: pagesScraped,
      },
    });
  } catch {
    // Non-critical
  }
}

// --- Internal helpers ---

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchAmazonPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.error(`Amazon fetch failed: ${response.status} for ${url}`);
      return null;
    }

    return await response.text();
  } catch (err) {
    console.error("Amazon fetch error:", err);
    return null;
  }
}

/**
 * Parse Amazon date strings (multiple locales).
 * Examples: "den 15 mars 2026", "15. März 2026", "March 15, 2026"
 */
function parseAmazonDate(dateText: string): Date | null {
  try {
    // Try standard Date.parse first
    const d = new Date(dateText);
    if (!isNaN(d.getTime())) return d;

    // Swedish: "den 15 mars 2026"
    const svMatch = dateText.match(
      /(\d{1,2})\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(\d{4})/i
    );
    if (svMatch) {
      const svMonths: Record<string, number> = {
        januari: 0, februari: 1, mars: 2, april: 3, maj: 4, juni: 5,
        juli: 6, augusti: 7, september: 8, oktober: 9, november: 10, december: 11,
      };
      return new Date(
        parseInt(svMatch[3]),
        svMonths[svMatch[2].toLowerCase()] ?? 0,
        parseInt(svMatch[1])
      );
    }

    // German: "15. März 2026"
    const deMatch = dateText.match(
      /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i
    );
    if (deMatch) {
      const deMonths: Record<string, number> = {
        januar: 0, februar: 1, "märz": 2, april: 3, mai: 4, juni: 5,
        juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
      };
      return new Date(
        parseInt(deMatch[3]),
        deMonths[deMatch[2].toLowerCase()] ?? 0,
        parseInt(deMatch[1])
      );
    }

    return null;
  } catch {
    return null;
  }
}
