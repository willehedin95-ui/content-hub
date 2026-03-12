// Shopify integration — uses client_credentials OAuth for auto-refreshing tokens

// Exchange rates to USD — fetched live from ECB, cached for 6 hours
const FALLBACK_RATES: Record<string, number> = {
  USD: 1, SEK: 0.095, DKK: 0.14, NOK: 0.093, EUR: 1.08,
};
let cachedRates: Record<string, number> | null = null;
let ratesCachedAt = 0;
const RATES_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchLiveRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      "https://api.frankfurter.dev/v1/latest?base=USD&symbols=SEK,DKK,NOK,EUR",
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return FALLBACK_RATES;
    const data = await res.json();
    // API returns rates FROM USD, we need rates TO USD (inverse)
    const rates: Record<string, number> = { USD: 1 };
    for (const [currency, rate] of Object.entries(data.rates as Record<string, number>)) {
      rates[currency] = 1 / rate;
    }
    return rates;
  } catch {
    return FALLBACK_RATES;
  }
}

/** Get exchange rates (cached for 6h, falls back to hardcoded rates) */
export async function getRatesToUSD(): Promise<Record<string, number>> {
  if (cachedRates && Date.now() - ratesCachedAt < RATES_CACHE_MS) {
    return cachedRates;
  }
  cachedRates = await fetchLiveRates();
  ratesCachedAt = Date.now();
  return cachedRates;
}

/** Synchronous conversion using cached or fallback rates */
export function convertToUSD(amount: number, currency: string): number {
  const rates = cachedRates ?? FALLBACK_RATES;
  return amount * (rates[currency] ?? 1);
}

/** Async conversion that ensures fresh rates are loaded */
export async function convertToUSDAsync(amount: number, currency: string): Promise<number> {
  const rates = await getRatesToUSD();
  return amount * (rates[currency] ?? 1);
}

export interface ShopifyOrder {
  id: string;
  order_number: number;
  landing_site: string | null;
  total_price: string;
  currency: string;
  created_at: string;
}

export function isShopifyConfigured(): boolean {
  return !!(
    process.env.SHOPIFY_STORE_URL &&
    process.env.SHOPIFY_CLIENT_ID &&
    process.env.SHOPIFY_CLIENT_SECRET
  );
}

// In-memory token cache (server-side, lives for the duration of the process)
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function getStoreUrl(): string {
  const raw = process.env.SHOPIFY_STORE_URL?.replace(/\/+$/, "") ?? "";
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

/**
 * Get an access token via client_credentials grant.
 * Caches the token and refreshes when expired (tokens last 24h).
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5-min buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 300_000) {
    return cachedToken;
  }

  const storeUrl = getStoreUrl();
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!storeUrl || !clientId || !clientSecret) {
    throw new Error("Shopify credentials not configured");
  }

  const res = await fetch(`${storeUrl}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ?? 86399) * 1000;
  return cachedToken!;
}

/**
 * Fetch orders from Shopify since a given ISO date.
 * Handles pagination via Link header.
 */
export async function fetchOrdersSince(sinceISO: string): Promise<ShopifyOrder[]> {
  if (!isShopifyConfigured()) return [];

  const storeUrl = getStoreUrl();
  const token = await getAccessToken();

  const allOrders: ShopifyOrder[] = [];
  let nextUrl: string | null =
    `${storeUrl}/admin/api/2024-01/orders.json?status=any&created_at_min=${encodeURIComponent(sinceISO)}&fields=id,order_number,landing_site,total_price,currency,created_at&limit=250`;

  while (nextUrl) {
    const fetchUrl: string = nextUrl;
    const res: Response = await fetch(fetchUrl, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const orders: ShopifyOrder[] = data.orders ?? [];
    allOrders.push(...orders);

    // Pagination via Link header
    const linkHeader = res.headers.get("Link");
    nextUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) nextUrl = nextMatch[1];
    }
  }

  return allOrders;
}

// ---- Extended order data for Meta CAPI ----

export interface ShopifyOrderFull extends ShopifyOrder {
  email: string | null;
  phone: string | null;
  billing_address: {
    first_name: string | null;
    last_name: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country_code: string | null;
  } | null;
  customer: {
    id: string;
    email: string | null;
    phone: string | null;
  } | null;
  browser_ip: string | null;
  client_details: {
    user_agent: string | null;
  } | null;
  line_items: Array<{
    sku: string | null;
    product_id: number;
    quantity: number;
  }>;
}

/**
 * Fetch orders with full detail (for Meta CAPI user data hashing).
 * Separate from fetchOrdersSince to avoid breaking existing consumers.
 */
export async function fetchOrdersFullSince(sinceISO: string): Promise<ShopifyOrderFull[]> {
  if (!isShopifyConfigured()) return [];

  const storeUrl = getStoreUrl();
  const token = await getAccessToken();

  const allOrders: ShopifyOrderFull[] = [];
  let nextUrl: string | null =
    `${storeUrl}/admin/api/2024-01/orders.json?status=any&created_at_min=${encodeURIComponent(sinceISO)}&fields=id,order_number,landing_site,total_price,currency,created_at,email,phone,billing_address,customer,browser_ip,client_details,line_items&limit=250`;

  while (nextUrl) {
    const fetchUrl: string = nextUrl;
    const res: Response = await fetch(fetchUrl, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const orders: ShopifyOrderFull[] = data.orders ?? [];
    allOrders.push(...orders);

    const linkHeader = res.headers.get("Link");
    nextUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) nextUrl = nextMatch[1];
    }
  }

  return allOrders;
}

/**
 * Match orders to page slugs from landing_site URL.
 * Checks in order:
 * 1. utm_term — page slug when visitor came from Meta ads (utm_source=meta)
 * 2. utm_campaign — page slug for direct/organic visitors (utm_source=page)
 * Returns a map: slug → { orders, revenue, currency, sources: { meta, page, other } }
 */
export async function getOrdersByPage(
  sinceISO: string
): Promise<Map<string, { orders: number; revenue: number; currency: string }>> {
  const orders = await fetchOrdersSince(sinceISO);
  const map = new Map<string, { orders: number; revenue: number; currency: string }>();

  for (const order of orders) {
    if (!order.landing_site) continue;
    try {
      const url = new URL(order.landing_site, "https://placeholder.com");
      const source = url.searchParams.get("utm_source") || "";

      // Determine page slug based on UTM scheme
      let slug: string | null = null;
      if (source === "meta" || source === "facebook") {
        // Meta ad traffic: page slug is in utm_term
        slug = url.searchParams.get("utm_term");
      }
      if (!slug) {
        // Direct/organic: page slug is in utm_campaign
        slug = url.searchParams.get("utm_campaign");
      }
      if (!slug) {
        // Fallback: extract from path for fbclid/gclid visitors (no UTM params)
        if (url.searchParams.has("fbclid") || url.searchParams.has("gclid")) {
          const pathSlug = url.pathname.replace(/^\/|\/$/g, "");
          if (pathSlug) slug = pathSlug;
        }
      }
      if (!slug) continue;

      const existing = map.get(slug) ?? { orders: 0, revenue: 0, currency: order.currency };
      existing.orders += 1;
      existing.revenue += parseFloat(order.total_price) || 0;
      map.set(slug, existing);
    } catch {
      // Skip malformed URLs
    }
  }

  return map;
}

export async function getConversionsForTest(
  testId: string,
  since: string,
  workspaceId?: string
): Promise<Array<{ variant: string; shopifyOrderId: string; revenue: number; currency: string }>> {
  const { createServerSupabase } = await import("./supabase");
  const db = createServerSupabase();

  // Get the AB test slug — paths are always /{slug}/a/ and /{slug}/b/
  let query = db.from("ab_tests").select("slug").eq("id", testId);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data: test } = await query.single();

  if (!test?.slug) return [];

  const controlPath = `/${test.slug}/a`;
  const variantPath = `/${test.slug}/b`;

  // Fetch orders and match landing_site path to variant
  const orders = await fetchOrdersSince(since);
  const conversions: Array<{ variant: string; shopifyOrderId: string; revenue: number; currency: string }> = [];

  for (const order of orders) {
    if (!order.landing_site) continue;
    try {
      const url = new URL(order.landing_site, "https://placeholder.com");
      const orderPath = url.pathname.replace(/\/$/, "");

      let variant: string | null = null;
      if (orderPath === controlPath) variant = "a";
      else if (orderPath === variantPath) variant = "b";

      // Also check UTM params as fallback (utm_campaign=testId, utm_content=a|b)
      if (!variant) {
        const utmCampaign = url.searchParams.get("utm_campaign");
        const utmContent = url.searchParams.get("utm_content");
        if (utmCampaign === testId && (utmContent === "a" || utmContent === "b")) {
          variant = utmContent;
        }
      }

      if (variant) {
        conversions.push({
          variant,
          shopifyOrderId: order.id,
          revenue: parseFloat(order.total_price) || 0,
          currency: order.currency,
        });
      }
    } catch {
      // Skip malformed URLs
    }
  }

  return conversions;
}

// ---- Inventory ----

export interface ShopifyProduct {
  id: number;
  title: string;
  variants: Array<{
    id: number;
    title: string;
    inventory_item_id: number;
    inventory_quantity: number;
    sku: string | null;
  }>;
}

export async function fetchProductsWithInventory(): Promise<ShopifyProduct[]> {
  if (!isShopifyConfigured()) return [];

  const storeUrl = getStoreUrl();
  const token = await getAccessToken();

  const allProducts: ShopifyProduct[] = [];
  let nextUrl: string | null =
    `${storeUrl}/admin/api/2024-01/products.json?fields=id,title,variants&limit=250`;

  while (nextUrl) {
    const fetchUrl: string = nextUrl;
    const res: Response = await fetch(fetchUrl, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    allProducts.push(...(data.products ?? []));

    const linkHeader = res.headers.get("Link");
    nextUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) nextUrl = nextMatch[1];
    }
  }

  return allProducts;
}
