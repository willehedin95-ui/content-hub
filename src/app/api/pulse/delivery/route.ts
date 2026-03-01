import { NextResponse } from "next/server";
import { fetchProductsWithInventory } from "@/lib/shopify";
import { fetchOrdersSince, isShopifyConfigured } from "@/lib/shopify";
import { createServerSupabase } from "@/lib/supabase";
import { getCached, setCache } from "@/lib/pulse-cache";

// ---- Types ----

export interface StockItem {
  shopifyProductId: number;
  shopifyTitle: string;
  slug: string | null;
  totalStock: number;
  dailySellRate: number;
  daysRemaining: number | null;
  leadTimeDays: number | null;
  reorderThresholdDays: number | null;
  status: "critical" | "warning" | "healthy" | "unknown";
}

export interface DeliveryData {
  items: StockItem[];
  updatedAt: string;
}

// ---- Helpers ----

function matchProductSlug(
  shopifyTitle: string,
  dbProducts: Array<{ slug: string; shopify_title_match?: string | null }>
): string | null {
  const titleLower = shopifyTitle.toLowerCase();
  for (const p of dbProducts) {
    // Match by slug appearing in title, or by explicit shopify_title_match
    if (p.shopify_title_match && titleLower.includes(p.shopify_title_match.toLowerCase())) {
      return p.slug;
    }
    if (titleLower.includes(p.slug.toLowerCase())) {
      return p.slug;
    }
  }
  return null;
}

// ---- Route ----

const CACHE_KEY = "pulse:delivery";
const CACHE_TTL = 15; // minutes

export async function GET() {
  try {
    // Check cache first
    const cached = await getCached<DeliveryData>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    if (!isShopifyConfigured()) {
      return NextResponse.json(
        { items: [], updatedAt: new Date().toISOString() } satisfies DeliveryData
      );
    }

    const db = createServerSupabase();

    // Fetch Shopify products, Supabase products, and recent orders in parallel
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [shopifyProducts, dbProductsResult, orders] = await Promise.all([
      fetchProductsWithInventory(),
      db.from("products").select("slug, name, lead_time_days, reorder_threshold_days, shopify_title_match"),
      fetchOrdersSince(thirtyDaysAgo),
    ]);

    const dbProducts = dbProductsResult.data ?? [];

    // Count total orders in the last 30 days (simplified: total orders / 30)
    const totalOrders = orders.length;
    const dailySellRate = totalOrders / 30;

    // Build stock items from Shopify products
    const items: StockItem[] = shopifyProducts.map((sp) => {
      const totalStock = sp.variants.reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0);
      const slug = matchProductSlug(sp.title, dbProducts);
      const dbProduct = slug ? dbProducts.find((p) => p.slug === slug) : null;

      const leadTimeDays = dbProduct?.lead_time_days ?? null;
      const reorderThresholdDays = dbProduct?.reorder_threshold_days ?? null;

      // Calculate days remaining
      const daysRemaining = dailySellRate > 0 ? totalStock / dailySellRate : null;

      // Determine status
      let status: StockItem["status"] = "unknown";
      if (leadTimeDays !== null && daysRemaining !== null) {
        const warningThreshold = leadTimeDays + (reorderThresholdDays ?? 0);
        if (daysRemaining < leadTimeDays) {
          status = "critical";
        } else if (daysRemaining < warningThreshold) {
          status = "warning";
        } else {
          status = "healthy";
        }
      }

      return {
        shopifyProductId: sp.id,
        shopifyTitle: sp.title,
        slug,
        totalStock,
        dailySellRate,
        daysRemaining,
        leadTimeDays,
        reorderThresholdDays,
        status,
      };
    });

    const result: DeliveryData = {
      items,
      updatedAt: new Date().toISOString(),
    };

    // Cache for 15 minutes
    await setCache(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch delivery data" },
      { status: 500 }
    );
  }
}
