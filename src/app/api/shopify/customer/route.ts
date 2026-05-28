import { NextResponse } from "next/server";
import {
  getShopifyCredsForWorkspace,
  searchCustomerByEmail,
  parseBottleCountFromLineItems,
  type ShopifyCustomerOrder,
} from "@/lib/shopify";
import { readSubscriptionsForCustomer, type LoopSubscription } from "@/lib/loop";

export const runtime = "nodejs";

const HYDRO13_WORKSPACE_ID = "6a18a542-4e8a-4d51-bc56-afd49fd1d9b7";

type AppLastOrder = {
  date: string;
  bottleCount: number;
  variantTitle: string | null;
};

type FoundResponse = {
  status: "found";
  customer: {
    shopifyCustomerId: number;
    firstName: string | null;
    lastName: string | null;
    ordersCount: number;
  };
  lastOrder: AppLastOrder | null;
  isSubscriber: boolean;
  nextBillingDate: string | null;
};

type LookupResponse =
  | FoundResponse
  | { status: "not-found" }
  | { status: "error"; message: string };

function pickLastHydro13Order(
  orders: ShopifyCustomerOrder[]
): { order: ShopifyCustomerOrder; bottleCount: number; variantTitle: string | null } | null {
  for (const o of orders) {
    const bottleCount = parseBottleCountFromLineItems(o.line_items);
    if (bottleCount > 0) {
      const hydroLine = o.line_items.find((li) =>
        li.title?.toLowerCase().includes("hydro13")
      );
      return {
        order: o,
        bottleCount,
        variantTitle: hydroLine?.variant_title ?? null,
      };
    }
  }
  return null;
}

function pickActiveSub(subs: LoopSubscription[]): LoopSubscription | null {
  return subs.find((s) => s.status === "ACTIVE" || s.status === "PAUSED") ?? null;
}

export async function POST(
  request: Request
): Promise<NextResponse<LookupResponse | { error: string }>> {
  const expectedKey = process.env.LOOP_LOOKUP_API_KEY;
  if (!expectedKey) {
    console.error("[shopify/customer] LOOP_LOOKUP_API_KEY not set");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  if (request.headers.get("x-api-key") !== expectedKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let email: string;
  try {
    const body = (await request.json()) as { email?: string };
    if (!body.email || typeof body.email !== "string") {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }
    email = body.email.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const creds = await getShopifyCredsForWorkspace(HYDRO13_WORKSPACE_ID);
  if (!creds) {
    console.error("[shopify/customer] Hydro13 Shopify creds not configured");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  let customer: Awaited<ReturnType<typeof searchCustomerByEmail>>;
  let loopSubs: LoopSubscription[];
  try {
    [customer, loopSubs] = await Promise.all([
      searchCustomerByEmail(email, creds),
      readSubscriptionsForCustomer(email),
    ]);
  } catch (err) {
    console.error("[shopify/customer] lookup error:", err);
    return NextResponse.json<LookupResponse>(
      { status: "error", message: "lookup failed" },
      { status: 502 }
    );
  }

  if (!customer && loopSubs.length === 0) {
    return NextResponse.json<LookupResponse>({ status: "not-found" });
  }

  const hydroOrder = customer ? pickLastHydro13Order(customer.orders) : null;
  const activeSub = pickActiveSub(loopSubs);

  return NextResponse.json<LookupResponse>({
    status: "found",
    customer: {
      shopifyCustomerId: customer?.id ?? 0,
      firstName: customer?.firstName ?? null,
      lastName: customer?.lastName ?? null,
      ordersCount: customer?.ordersCount ?? 0,
    },
    lastOrder: hydroOrder
      ? {
          date: hydroOrder.order.created_at,
          bottleCount: hydroOrder.bottleCount,
          variantTitle: hydroOrder.variantTitle,
        }
      : null,
    isSubscriber: activeSub !== null,
    nextBillingDate: activeSub?.nextBillingDateEpoch
      ? new Date(activeSub.nextBillingDateEpoch * 1000).toISOString()
      : null,
  });
}
