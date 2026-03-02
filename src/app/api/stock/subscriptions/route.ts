import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { activeSubscribers, unitsPerSubscriber, subscriptionCycleDays } = body;

    if (typeof activeSubscribers !== "number" || activeSubscribers < 0) {
      return NextResponse.json({ error: "activeSubscribers must be a non-negative number" }, { status: 400 });
    }

    const db = createServerSupabase();
    const { error } = await db
      .from("products")
      .update({
        active_subscribers: activeSubscribers,
        units_per_subscriber: unitsPerSubscriber ?? 1,
        subscription_cycle_days: subscriptionCycleDays ?? 30,
        subscribers_updated_at: new Date().toISOString(),
      })
      .eq("slug", "hydro13");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update subscriptions" },
      { status: 500 }
    );
  }
}
