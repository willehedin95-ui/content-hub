/**
 * Loop Subscriptions Admin API client.
 *
 * Used by the Hydro13 iOS app to fetch a customer's subscription details
 * read-only. All actions (skip, pause, cancel) happen on get-renew.com.
 *
 * Auth: x-loop-token header (NOT Bearer). Token bound to the Renew Shopify
 * store, scoped read-only on customers + subscriptions.
 *
 * Docs: https://developer.loopwork.co/reference/overview
 */

const BASE = "https://api.loopsubscriptions.com/admin/2023-10";

function token(): string {
  const t = process.env.LOOP_ADMIN_API_TOKEN;
  if (!t) throw new Error("LOOP_ADMIN_API_TOKEN not set");
  return t;
}

type LoopResponse<T> = {
  success: boolean;
  message: string;
  code: string;
  data: T;
};

export type LoopSubscription = {
  id: number;
  shopifyId: number;
  status: "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED";
  nextBillingDateEpoch: number | null;
  totalLineItemDiscountedPrice: number;
  currencyCode: string;
  pausedAt: string | null;
  cancelledAt: string | null;
  billingPolicy: {
    interval: "DAY" | "WEEK" | "MONTH" | "YEAR";
    intervalCount: number;
  };
  customer: {
    id: number;
    shopifyId: number;
    email: string;
  };
  lines: Array<{
    productTitle: string;
    variantTitle: string;
    quantity: number;
    discountedPrice: number;
    variantImage: string | null;
  }>;
  shippingAddress: {
    firstName: string | null;
    lastName: string | null;
    address1: string | null;
    city: string | null;
    zip: string | null;
    countryCode: string | null;
  } | null;
};

/**
 * Fetch all subscriptions for a customer (any status). Email or shopifyId both work.
 * Returns empty array if customer has no subscriptions or doesn't exist in Loop.
 */
export async function readSubscriptionsForCustomer(
  customerIdentifier: string
): Promise<LoopSubscription[]> {
  const url = `${BASE}/customer/${encodeURIComponent(customerIdentifier)}/subscription`;
  const res = await fetch(url, {
    headers: { "x-loop-token": token(), accept: "application/json" },
    cache: "no-store",
    // Fetch timeout (audit 2026-07-07, P3)
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Loop API ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as LoopResponse<LoopSubscription[] | null>;
  if (!json.success) throw new Error(`Loop API: ${json.message}`);
  return json.data ?? [];
}
