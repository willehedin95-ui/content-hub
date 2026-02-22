import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { getConversionsForTest, isShopifyConfigured } from "@/lib/shopify";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  if (!isShopifyConfigured()) {
    return NextResponse.json(
      { error: "Shopify not configured. Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN." },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // Get the test to find its activation date
  const { data: test, error: tErr } = await db
    .from("ab_tests")
    .select("id, status, created_at, updated_at")
    .eq("id", id)
    .single();

  if (tErr || !test) {
    return NextResponse.json({ error: "A/B test not found" }, { status: 404 });
  }

  // Use test creation date as the start for order search
  const since = test.created_at;

  try {
    const conversions = await getConversionsForTest(id, since);

    if (conversions.length === 0) {
      return NextResponse.json({ synced: 0 });
    }

    // Upsert conversions (ignore duplicates via unique constraint)
    const rows = conversions.map((c) => ({
      test_id: id,
      variant: c.variant,
      shopify_order_id: c.shopifyOrderId,
      revenue: c.revenue,
      currency: c.currency,
    }));

    const { error: insertErr } = await db
      .from("ab_conversions")
      .upsert(rows, { onConflict: "test_id,shopify_order_id", ignoreDuplicates: true });

    if (insertErr) {
      return safeError(insertErr, "Failed to save conversions");
    }

    return NextResponse.json({ synced: conversions.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
