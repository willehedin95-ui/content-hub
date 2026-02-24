// Shopify integration

export interface ShopifyOrder {
  id: string;
  order_number: number;
  landing_site: string | null;
  total_price: string;
  currency: string;
  created_at: string;
}

export function isShopifyConfigured(): boolean {
  return !!(process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_ACCESS_TOKEN);
}

/**
 * Fetch orders from Shopify since a given ISO date.
 * Handles pagination via Link header.
 */
export async function fetchOrdersSince(sinceISO: string): Promise<ShopifyOrder[]> {
  const storeUrl = process.env.SHOPIFY_STORE_URL?.replace(/\/+$/, "");
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!storeUrl || !token) return [];

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
 * Match orders to page slugs via utm_campaign in landing_site URL.
 * Returns a map: slug → { orders, revenue, currency }
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
      const slug = url.searchParams.get("utm_campaign");
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
