import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { invalidateCache } from "@/lib/pulse-cache";

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { activeSubscribers, unitsPerSubscriber, subscriptionCycleDays } = body;

    if (typeof activeSubscribers !== "number" || activeSubscribers < 0) {
      return NextResponse.json({ error: "activeSubscribers must be a non-negative number" }, { status: 400 });
    }

    const db = createServerSupabase();
    const workspaceId = await getWorkspaceId();
    const { error } = await db
      .from("products")
      .update({
        active_subscribers: activeSubscribers,
        units_per_subscriber: unitsPerSubscriber ?? 1,
        subscription_cycle_days: subscriptionCycleDays ?? 30,
        subscribers_updated_at: new Date().toISOString(),
      })
      .eq("slug", "hydro13")
      .eq("workspace_id", workspaceId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Bust the stock cache so the next fetch returns fresh data
    await invalidateCache("stock:collagen");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update subscriptions" },
      { status: 500 }
    );
  }
}
