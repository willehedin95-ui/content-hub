// Post scraping via Apify — extracts media, text, and metadata from a single post URL

const APIFY_API_BASE = "https://api.apify.com/v2";

// Apify actor IDs for single-post scraping
const INSTAGRAM_ACTOR = "apify/instagram-scraper";
const FACEBOOK_POST_ACTOR = "apify/facebook-posts-scraper";

export interface ScrapedPost {
  media_url: string | null;
  media_type: "image" | "video" | null;
  thumbnail_url: string | null;
  headline: string | null;
  body: string | null;
  destination_url: string | null;
  brand_name: string | null;
  raw_data: Record<string, unknown> | null;
}

function getApifyToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  return token;
}

/** Scrape a single post URL via Apify */
export async function scrapePost(
  url: string,
  platform: "instagram" | "facebook" | "unknown"
): Promise<ScrapedPost> {
  const empty: ScrapedPost = {
    media_url: null,
    media_type: null,
    thumbnail_url: null,
    headline: null,
    body: null,
    destination_url: null,
    brand_name: null,
    raw_data: null,
  };

  try {
    if (platform === "instagram") {
      return await scrapeInstagramPost(url);
    } else if (platform === "facebook") {
      return await scrapeFacebookPost(url);
    } else {
      // Unknown platform — try Instagram first, then Facebook
      try {
        return await scrapeInstagramPost(url);
      } catch {
        try {
          return await scrapeFacebookPost(url);
        } catch {
          return empty;
        }
      }
    }
  } catch (err) {
    console.error(`[Scrape] Failed to scrape ${url}:`, err);
    return empty;
  }
}

async function scrapeInstagramPost(url: string): Promise<ScrapedPost> {
  const token = getApifyToken();

  // Clean URL: remove tracking params like igsh
  const cleanUrl = url.split("?")[0];

  const res = await fetch(
    `${APIFY_API_BASE}/acts/${INSTAGRAM_ACTOR}/runs?waitForFinish=120`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        directUrls: [cleanUrl],
        resultsType: "posts",
        resultsLimit: 1,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify IG scrape failed: ${res.status} ${text}`);
  }

  const runData = await res.json();
  const datasetId = runData.data?.defaultDatasetId;
  if (!datasetId) throw new Error("No dataset from IG scrape");

  const itemsRes = await fetch(
    `${APIFY_API_BASE}/datasets/${datasetId}/items`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!itemsRes.ok) throw new Error("Failed to fetch IG dataset");
  const items = await itemsRes.json();
  const post = Array.isArray(items) ? items[0] : null;
  if (!post) throw new Error("No items in IG dataset");

  // Normalize Instagram post data
  const isVideo = post.type === "Video" || post.videoUrl != null;

  // Instagram often blocks media URLs — displayUrl may be a placeholder
  const displayUrl = post.displayUrl || null;
  const isPlaceholder =
    !displayUrl || displayUrl.includes("null.jpg") || displayUrl.includes("rsrc.php");
  const imageUrl = isPlaceholder ? null : displayUrl;

  return {
    media_url: isVideo ? post.videoUrl || null : imageUrl,
    media_type: isVideo ? "video" : post.type === "Image" ? "image" : null,
    thumbnail_url: imageUrl,
    headline: null,
    body: post.caption || post.alt || null,
    destination_url: post.url || url,
    brand_name: post.ownerUsername || post.ownerFullName || null,
    raw_data: post,
  };
}

async function scrapeFacebookPost(url: string): Promise<ScrapedPost> {
  const token = getApifyToken();
  const res = await fetch(
    `${APIFY_API_BASE}/acts/${FACEBOOK_POST_ACTOR}/runs?waitForFinish=120`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        startUrls: [{ url }],
        resultsLimit: 1,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify FB scrape failed: ${res.status} ${text}`);
  }

  const runData = await res.json();
  const datasetId = runData.data?.defaultDatasetId;
  if (!datasetId) throw new Error("No dataset from FB scrape");

  const itemsRes = await fetch(
    `${APIFY_API_BASE}/datasets/${datasetId}/items`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!itemsRes.ok) throw new Error("Failed to fetch FB dataset");
  const items = await itemsRes.json();
  const post = Array.isArray(items) ? items[0] : null;
  if (!post) throw new Error("No items in FB dataset");

  // Normalize Facebook post data
  const hasVideo = post.videoUrl || post.video;
  const imageUrl =
    post.imageUrl ||
    post.image ||
    post.full_picture ||
    (Array.isArray(post.images) ? post.images[0] : null) ||
    null;

  return {
    media_url: hasVideo ? post.videoUrl || post.video || null : imageUrl,
    media_type: hasVideo ? "video" : imageUrl ? "image" : null,
    thumbnail_url: imageUrl,
    headline: post.title || null,
    body: post.text || post.message || post.postText || null,
    destination_url: post.link || post.url || url,
    brand_name: post.pageName || post.userName || post.name || null,
    raw_data: post,
  };
}
