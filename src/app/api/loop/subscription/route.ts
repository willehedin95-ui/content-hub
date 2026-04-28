import { NextResponse } from "next/server";
import { readSubscriptionsForCustomer, type LoopSubscription } from "@/lib/loop";

export const runtime = "nodejs";

type AppLine = {
  productTitle: string;
  variantTitle: string;
  quantity: number;
  imageUrl: string | null;
};

type AppSubscription = {
  id: number;
  status: "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED";
  nextBillingDate: string | null;
  totalPrice: number;
  currency: string;
  intervalLabel: string;
  lines: AppLine[];
  shippingCity: string | null;
  shippingZip: string | null;
};

type LookupResponse =
  | { status: "active"; firstName: string | null; subscriptions: AppSubscription[] }
  | { status: "inactive"; firstName: string | null }
  | { status: "not-found" };

const INTERVAL_LABEL: Record<LoopSubscription["billingPolicy"]["interval"], (n: number) => string> = {
  DAY: (n) => (n === 1 ? "Varje dag" : `Var ${n}:e dag`),
  WEEK: (n) => (n === 1 ? "Varje vecka" : `Var ${n}:e vecka`),
  MONTH: (n) => (n === 1 ? "Varje månad" : `Var ${n}:e månad`),
  YEAR: (n) => (n === 1 ? "Varje år" : `Var ${n}:e år`),
};

function shape(sub: LoopSubscription): AppSubscription {
  return {
    id: sub.id,
    status: sub.status,
    nextBillingDate: sub.nextBillingDateEpoch
      ? new Date(sub.nextBillingDateEpoch * 1000).toISOString()
      : null,
    totalPrice: sub.totalLineItemDiscountedPrice,
    currency: sub.currencyCode,
    intervalLabel: INTERVAL_LABEL[sub.billingPolicy.interval](sub.billingPolicy.intervalCount),
    lines: sub.lines.map((l) => ({
      productTitle: l.productTitle,
      variantTitle: l.variantTitle,
      quantity: l.quantity,
      imageUrl: l.variantImage,
    })),
    shippingCity: sub.shippingAddress?.city ?? null,
    shippingZip: sub.shippingAddress?.zip ?? null,
  };
}

export async function POST(request: Request): Promise<NextResponse<LookupResponse | { error: string }>> {
  const expectedKey = process.env.LOOP_LOOKUP_API_KEY;
  if (!expectedKey) {
    console.error("[loop/subscription] LOOP_LOOKUP_API_KEY not set");
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

  let subs: LoopSubscription[];
  try {
    subs = await readSubscriptionsForCustomer(email);
  } catch (err) {
    console.error("[loop/subscription] error:", err);
    return NextResponse.json({ error: "loop api failed" }, { status: 502 });
  }

  if (subs.length === 0) {
    return NextResponse.json<LookupResponse>({ status: "not-found" });
  }

  const active = subs.filter((s) => s.status === "ACTIVE" || s.status === "PAUSED");
  const firstName = subs[0]?.shippingAddress?.firstName ?? null;

  if (active.length === 0) {
    return NextResponse.json<LookupResponse>({ status: "inactive", firstName });
  }

  return NextResponse.json<LookupResponse>({
    status: "active",
    firstName,
    subscriptions: active.map(shape),
  });
}
