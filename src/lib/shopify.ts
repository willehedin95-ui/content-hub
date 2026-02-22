import { withRetry, isTransientError } from "./retry";

const SHOPIFY_API_VERSION = "2024-01";
const SHOPIFY_FETCH_TIMEOUT_MS = 30_000;

function getConfig() {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!storeUrl || !token) {
    throw new Error("SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN must be configured");
  }
  return { storeUrl, token };
}

async function shopifyFetch(path: string): Promise<Response> {
  const { storeUrl, token } = getConfig();
  const url = `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHOPIFY_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "X-Shopify-Access-Token": token },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function shopifyJson<T>(path: string): Promise<T> {
  return withRetry(
    async () => {
      const res = await shopifyFetch(path);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Shopify API error (${res.status}): ${text.slice(0, 200)}`);
      }
      return res.json();
    },
    { isRetryable: isTransientError }
  );
}

export interface ShopifyOrder {
  id: number;
  name: string;
  total_price: string;
  currency: string;
  landing_site: string | null;
  referring_site: string | null;
  created_at: string;
}

interface OrdersResponse {
  orders: ShopifyOrder[];
}

/**
 * Fetch orders created after a given date, paginated.
 * Shopify REST API returns max 250 orders per page.
 */
export async function fetchOrdersSince(since: string): Promise<ShopifyOrder[]> {
  const allOrders: ShopifyOrder[] = [];
  let page = 1;
  const limit = 250;

  // Safety: cap at 20 pages (5000 orders) to avoid runaway loops
  while (page <= 20) {
    const params = new URLSearchParams({
      created_at_min: since,
      limit: String(limit),
      page: String(page),
      status: "any",
      fields: "id,name,total_price,currency,landing_site,referring_site,created_at",
    });

    const data = await shopifyJson<OrdersResponse>(
      `/orders.json?${params.toString()}`
    );

    allOrders.push(...data.orders);

    // If we got fewer than limit, we've reached the last page
    if (data.orders.length < limit) break;
    page++;
  }

  return allOrders;
}

/**
 * Extract AB test attribution from an order's landing_site URL.
 * Looks for utm_campaign={testId} and utm_content={variant}.
 */
export function extractABTestAttribution(
  order: ShopifyOrder
): { testId: string; variant: "a" | "b" } | null {
  const urlStr = order.landing_site;
  if (!urlStr) return null;

  try {
    // landing_site might be a path with query string, or a full URL
    const url = new URL(urlStr, "https://placeholder.com");
    const source = url.searchParams.get("utm_source");
    const campaign = url.searchParams.get("utm_campaign");
    const content = url.searchParams.get("utm_content");

    if (source !== "abtest" || !campaign || !content) return null;
    if (content !== "a" && content !== "b") return null;

    return { testId: campaign, variant: content };
  } catch {
    return null;
  }
}

export interface ABTestConversion {
  testId: string;
  variant: "a" | "b";
  shopifyOrderId: string;
  revenue: number;
  currency: string;
}

/**
 * Get all conversions for a specific AB test from Shopify orders.
 */
export async function getConversionsForTest(
  testId: string,
  since: string
): Promise<ABTestConversion[]> {
  const orders = await fetchOrdersSince(since);
  const conversions: ABTestConversion[] = [];

  for (const order of orders) {
    const attribution = extractABTestAttribution(order);
    if (attribution && attribution.testId === testId) {
      conversions.push({
        testId: attribution.testId,
        variant: attribution.variant,
        shopifyOrderId: String(order.id),
        revenue: parseFloat(order.total_price),
        currency: order.currency,
      });
    }
  }

  return conversions;
}

/**
 * Check if Shopify credentials are configured.
 */
export function isShopifyConfigured(): boolean {
  return !!(process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_ACCESS_TOKEN);
}
