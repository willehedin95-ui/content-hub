// Shopify integration — stub until fully implemented

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

export async function fetchOrdersSince(_sinceISO: string): Promise<ShopifyOrder[]> {
  // TODO: Implement Shopify order fetch
  return [];
}

export async function getConversionsForTest(
  _testId: string,
  _since: string
): Promise<Array<{ variant: string; shopifyOrderId: string; revenue: number; currency: string }>> {
  // TODO: Implement Shopify order lookup
  return [];
}
