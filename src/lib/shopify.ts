// Shopify integration — uses client_credentials OAuth for auto-refreshing tokens

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
    throw new Error(`Shopify token exchange failed (${res.status}): ${text}`);
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
      throw new Error(`Shopify API error (${res.status}): ${text}`);
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
  _testId: string,
  _since: string
): Promise<Array<{ variant: string; shopifyOrderId: string; revenue: number; currency: string }>> {
  // TODO: Implement Shopify order lookup for A/B test variants
  return [];
}
