const SHELFLESS_API_BASE = "https://api.shelfless.io";
const SHELFLESS_TIMEOUT_MS = 30_000;
const HYDRO13_SKU = "COLLAGEN-MARINE-12500";

// In-memory token cache
interface TokenCache {
  access_token: string;
  expires_at: number; // timestamp in milliseconds
}

let tokenCache: TokenCache | null = null;

export function isShelflessConfigured(): boolean {
  return !!(
    process.env.SHELFLESS_CLIENT_ID &&
    process.env.SHELFLESS_CLIENT_SECRET &&
    process.env.SHELFLESS_TOKEN_URL
  );
}

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (tokenCache && tokenCache.expires_at > Date.now() + 60_000) {
    return tokenCache.access_token;
  }

  const clientId = process.env.SHELFLESS_CLIENT_ID;
  const clientSecret = process.env.SHELFLESS_CLIENT_SECRET;
  const tokenUrl = process.env.SHELFLESS_TOKEN_URL;

  if (!clientId || !clientSecret || !tokenUrl) {
    throw new Error("Shelfless OAuth2 credentials not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHELFLESS_TIMEOUT_MS);

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Shelfless OAuth2 error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();

    if (!data.access_token || !data.expires_in) {
      throw new Error("Invalid OAuth2 response from Shelfless");
    }

    // Cache the token (expires_in is in seconds)
    tokenCache = {
      access_token: data.access_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };

    return tokenCache.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

async function shelflessFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${SHELFLESS_API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHELFLESS_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

interface ShelflessArticle {
  sku: string;
  available_quantity: number;
  physical_quantity: number;
  reserved_quantity: number;
  blocked_quantity?: number;
  safety_stock?: number;
}

interface ShelflessArticleResponse {
  meta: { next_page?: string };
  data: ShelflessArticle[];
}

/**
 * Fetches Hydro13 stock from Shelfless API.
 * Returns available_quantity (sellable stock = physical - reserved - blocked - safety).
 * Returns 0 if not configured or on error.
 */
export async function fetchHydro13Stock(): Promise<number> {
  if (!isShelflessConfigured()) {
    console.warn("Shelfless not configured — returning 0 stock");
    return 0;
  }

  try {
    // Query with total=true to get aggregate across all warehouses
    const params = new URLSearchParams({
      total: "true",
    });

    // SKU is passed as JSON array in the query string
    const skuParam = encodeURIComponent(JSON.stringify([HYDRO13_SKU]));
    const path = `/article?${params.toString()}&sku=${skuParam}`;

    const res = await shelflessFetch(path);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`Shelfless API error (${res.status}):`, text.slice(0, 200));
      return 0;
    }

    const data: ShelflessArticleResponse = await res.json();

    // Find the Hydro13 article in the response
    const article = data.data.find((a) => a.sku === HYDRO13_SKU);

    if (!article) {
      console.warn(`Shelfless: SKU ${HYDRO13_SKU} not found in response`);
      return 0;
    }

    return article.available_quantity ?? 0;
  } catch (error) {
    console.error("Failed to fetch Hydro13 stock from Shelfless:", error);
    return 0;
  }
}
