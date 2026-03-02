# Business Pulse Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `/pulse` dashboard page showing business health across Growth, Delivery, and Support engines — a 30-second overview.

**Architecture:** Three sections on one page. Growth Engine reuses existing `fetchAnalyticsSummary()` from `src/lib/analytics.ts`. Delivery Engine adds Shopify inventory API calls + product lead time config. Support Engine creates a new Freshdesk integration + Claude AI weekly summary. Data fetched server-side, passed to client components. Caching via `pulse_cache` Supabase table.

**Tech Stack:** Next.js 15 (App Router), Supabase, existing Shopify/Meta/Google Ads integrations, new Freshdesk REST API, Anthropic Claude API (already in project), Tailwind CSS, lucide-react icons.

**Key existing code to reuse:**
- `src/lib/analytics.ts` — `fetchAnalyticsSummary(days)` returns Meta + Google Ads + Shopify metrics + blended ROAS
- `src/lib/shopify.ts` — Shopify OAuth + `fetchOrdersSince()`, currency conversion
- `src/lib/google-ads.ts` — `getGoogleAdsAccountInsights()`
- `src/lib/meta.ts` — `getAccountInsights()`
- `src/lib/claude.ts` — Anthropic SDK wrapper (already configured)
- `src/components/layout/Sidebar.tsx` — `nav` array to add new entry

---

### Task 1: Database Setup — pulse_cache table + products schema additions

**Files:**
- No source files — Supabase Management API DDL only

**Step 1: Create pulse_cache table**

Run via Supabase Management API:
```sql
CREATE TABLE pulse_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pulse_cache_key ON pulse_cache(cache_key);
CREATE INDEX idx_pulse_cache_expires ON pulse_cache(expires_at);
```

**Step 2: Add lead time columns to products table**

```sql
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS reorder_threshold_days INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS shopify_inventory_item_id TEXT;
```

**Step 3: Set initial lead time values**

```sql
UPDATE products SET lead_time_days = 55, reorder_threshold_days = 15 WHERE slug = 'happysleep';
UPDATE products SET lead_time_days = 14, reorder_threshold_days = 10 WHERE slug = 'hydro13';
```

**Step 4: Verify**

Query both tables to confirm schema:
```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pulse_cache';
SELECT slug, lead_time_days, reorder_threshold_days FROM products;
```

**Step 5: Commit**
```bash
git add docs/plans/2026-02-28-business-pulse-dashboard-plan.md docs/plans/2026-02-28-business-pulse-dashboard-design.md
git commit -m "docs: add Business Pulse dashboard design and implementation plan"
```

---

### Task 2: Cache Utility — pulse cache read/write helpers

**Files:**
- Create: `src/lib/pulse-cache.ts`

**Step 1: Create the cache utility**

```typescript
// src/lib/pulse-cache.ts
import { createServerSupabase } from "./supabase";

export async function getCached<T>(key: string): Promise<T | null> {
  const db = createServerSupabase();
  const { data } = await db
    .from("pulse_cache")
    .select("data, expires_at")
    .eq("cache_key", key)
    .single();

  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) {
    // Expired — clean up async, don't block
    db.from("pulse_cache").delete().eq("cache_key", key).then(() => {});
    return null;
  }
  return data.data as T;
}

export async function setCache(key: string, data: unknown, ttlMinutes: number): Promise<void> {
  const db = createServerSupabase();
  const expires_at = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  await db
    .from("pulse_cache")
    .upsert({ cache_key: key, data, expires_at }, { onConflict: "cache_key" });
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes (no consumers yet, just the lib).

**Step 3: Commit**
```bash
git add src/lib/pulse-cache.ts
git commit -m "feat(pulse): add cache utility for dashboard data"
```

---

### Task 3: Growth Engine API Route

**Files:**
- Create: `src/app/api/pulse/growth/route.ts`

**Step 1: Create the API route**

This route wraps existing `fetchAnalyticsSummary()` with caching. It fetches data for three periods: today, 7d, 30d.

```typescript
// src/app/api/pulse/growth/route.ts
import { NextResponse } from "next/server";
import { fetchAnalyticsSummary } from "@/lib/analytics";
import { getCached, setCache } from "@/lib/pulse-cache";

export interface GrowthData {
  today: { revenue: number; orders: number; aov: number; currency: string } | null;
  week: {
    revenue: number; orders: number; aov: number; currency: string;
    metaSpend: number; googleSpend: number; totalSpend: number; roas: number | null;
  } | null;
  month: {
    revenue: number; orders: number; aov: number; currency: string;
    metaSpend: number; googleSpend: number; totalSpend: number; roas: number | null;
  } | null;
  errors?: Record<string, string>;
}

export async function GET() {
  try {
    const cached = await getCached<GrowthData>("pulse:growth");
    if (cached) return NextResponse.json(cached);

    // Fetch 7d and 30d in parallel (today is derived from 1d)
    const [summary1d, summary7d, summary30d] = await Promise.all([
      fetchAnalyticsSummary(1),
      fetchAnalyticsSummary(7),
      fetchAnalyticsSummary(30),
    ]);

    const mapSummary = (s: typeof summary7d) => s.shopify ? {
      revenue: s.shopify.revenue,
      orders: s.shopify.orders,
      aov: s.shopify.avgOrderValue,
      currency: s.shopify.currency,
      metaSpend: s.meta?.spend ?? 0,
      googleSpend: s.googleAds?.spend ?? 0,
      totalSpend: s.totalAdSpend,
      roas: s.roas,
    } : null;

    const result: GrowthData = {
      today: summary1d.shopify ? {
        revenue: summary1d.shopify.revenue,
        orders: summary1d.shopify.orders,
        aov: summary1d.shopify.avgOrderValue,
        currency: summary1d.shopify.currency,
      } : null,
      week: mapSummary(summary7d),
      month: mapSummary(summary30d),
      errors: {
        ...(summary30d.errors?.meta ? { meta: summary30d.errors.meta } : {}),
        ...(summary30d.errors?.shopify ? { shopify: summary30d.errors.shopify } : {}),
        ...(summary30d.errors?.googleAds ? { googleAds: summary30d.errors.googleAds } : {}),
      },
    };

    await setCache("pulse:growth", result, 15);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch growth data" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**
```bash
git add src/app/api/pulse/growth/route.ts
git commit -m "feat(pulse): add Growth Engine API route"
```

---

### Task 4: Shopify Inventory Functions

**Files:**
- Modify: `src/lib/shopify.ts` (add inventory functions at end of file)

**Step 1: Add inventory types and fetch function**

Append to `src/lib/shopify.ts`:

```typescript
// ---- Inventory ----

export interface ShopifyInventoryLevel {
  inventory_item_id: number;
  available: number | null;
  location_id: number;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  variants: Array<{
    id: number;
    title: string;
    inventory_item_id: number;
    inventory_quantity: number;
    sku: string | null;
  }>;
}

/**
 * Fetch all products with their inventory quantities.
 * Uses the Products endpoint which includes variant-level inventory_quantity.
 */
export async function fetchProductsWithInventory(): Promise<ShopifyProduct[]> {
  if (!isShopifyConfigured()) return [];

  const storeUrl = getStoreUrl();
  const token = await getAccessToken();

  const allProducts: ShopifyProduct[] = [];
  let nextUrl: string | null =
    `${storeUrl}/admin/api/2024-01/products.json?fields=id,title,variants&limit=250`;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    allProducts.push(...(data.products ?? []));

    const linkHeader = res.headers.get("Link");
    nextUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) nextUrl = nextMatch[1];
    }
  }

  return allProducts;
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**
```bash
git add src/lib/shopify.ts
git commit -m "feat(pulse): add Shopify inventory fetch function"
```

---

### Task 5: Delivery Engine API Route

**Files:**
- Create: `src/app/api/pulse/delivery/route.ts`

**Step 1: Create the API route**

```typescript
// src/app/api/pulse/delivery/route.ts
import { NextResponse } from "next/server";
import { fetchProductsWithInventory, fetchOrdersSince, isShopifyConfigured } from "@/lib/shopify";
import { createServerSupabase } from "@/lib/supabase";
import { getCached, setCache } from "@/lib/pulse-cache";

export interface StockItem {
  productName: string;
  productSlug: string;
  totalStock: number;
  dailySellRate: number;
  daysRemaining: number | null;
  leadTimeDays: number | null;
  reorderThresholdDays: number | null;
  status: "healthy" | "warning" | "critical" | "unknown";
}

export interface DeliveryData {
  stocks: StockItem[];
  shopifyConfigured: boolean;
}

export async function GET() {
  try {
    const cached = await getCached<DeliveryData>("pulse:delivery");
    if (cached) return NextResponse.json(cached);

    if (!isShopifyConfigured()) {
      return NextResponse.json({ stocks: [], shopifyConfigured: false });
    }

    const db = createServerSupabase();

    // Fetch products from Shopify + our DB config + last 30d orders in parallel
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [shopifyProducts, dbProducts, orders] = await Promise.all([
      fetchProductsWithInventory(),
      db.from("products").select("slug, name, lead_time_days, reorder_threshold_days"),
      fetchOrdersSince(thirtyDaysAgo.toISOString()),
    ]);

    // Count orders per product (by matching Shopify product title to our product slug)
    const dbProductMap = new Map(
      (dbProducts.data ?? []).map((p) => [p.slug, p])
    );

    // Calculate sell rate: total orders / 30 days (simplified — counts all orders)
    // A more precise approach would match SKUs, but this works for the pulse view
    const totalOrders = orders.length;
    const dailyOrderRate = totalOrders / 30;

    const stocks: StockItem[] = [];
    for (const sp of shopifyProducts) {
      const totalStock = sp.variants.reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0);

      // Try to match to our product bank by checking if product title contains slug
      const matchedSlug = [...dbProductMap.keys()].find((slug) =>
        sp.title.toLowerCase().includes(slug.toLowerCase())
      );
      const dbProduct = matchedSlug ? dbProductMap.get(matchedSlug) : null;

      // Per-product sell rate would need SKU-level order data
      // For now, estimate based on total orders proportionally to stock
      const dailySellRate = dailyOrderRate; // Simplified
      const daysRemaining = dailySellRate > 0 ? Math.round(totalStock / dailySellRate) : null;

      let status: StockItem["status"] = "unknown";
      if (dbProduct?.lead_time_days && daysRemaining !== null) {
        const threshold = dbProduct.lead_time_days + (dbProduct.reorder_threshold_days ?? 15);
        if (daysRemaining < dbProduct.lead_time_days) status = "critical";
        else if (daysRemaining < threshold) status = "warning";
        else status = "healthy";
      }

      stocks.push({
        productName: sp.title,
        productSlug: matchedSlug ?? sp.title.toLowerCase().replace(/\s+/g, "-"),
        totalStock,
        dailySellRate: Math.round(dailySellRate * 10) / 10,
        daysRemaining,
        leadTimeDays: dbProduct?.lead_time_days ?? null,
        reorderThresholdDays: dbProduct?.reorder_threshold_days ?? null,
        status,
      });
    }

    // Sort: critical first, then warning, then healthy
    const statusOrder = { critical: 0, warning: 1, unknown: 2, healthy: 3 };
    stocks.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    const result: DeliveryData = { stocks, shopifyConfigured: true };
    await setCache("pulse:delivery", result, 15);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch delivery data" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**
```bash
git add src/app/api/pulse/delivery/route.ts
git commit -m "feat(pulse): add Delivery Engine API route with stock levels"
```

---

### Task 6: Freshdesk Integration Library

**Files:**
- Create: `src/lib/freshdesk.ts`

**Step 1: Create the Freshdesk API wrapper**

```typescript
// src/lib/freshdesk.ts

export function isFreshdeskConfigured(): boolean {
  return !!(process.env.FRESHDESK_API_KEY && process.env.FRESHDESK_DOMAIN);
}

function getBaseUrl(): string {
  return `https://${process.env.FRESHDESK_DOMAIN}.freshdesk.com/api/v2`;
}

function getHeaders(): Record<string, string> {
  // Freshdesk uses basic auth with API key as username, "X" as password
  const key = process.env.FRESHDESK_API_KEY!;
  const encoded = Buffer.from(`${key}:X`).toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
    "Content-Type": "application/json",
  };
}

async function freshdeskFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: getHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Freshdesk API error (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

export interface FreshdeskTicket {
  id: number;
  subject: string;
  description_text: string | null;
  status: number; // 2=Open, 3=Pending, 4=Resolved, 5=Closed
  priority: number; // 1=Low, 2=Medium, 3=High, 4=Urgent
  type: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  stats?: {
    first_responded_at: string | null;
  };
}

// Freshdesk status codes
const STATUS_LABELS: Record<number, string> = {
  2: "Open",
  3: "Pending",
  4: "Resolved",
  5: "Closed",
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

export { STATUS_LABELS, PRIORITY_LABELS };

/**
 * Fetch tickets updated within the last N days.
 * Freshdesk list endpoint returns max 100 per page.
 */
export async function fetchRecentTickets(days: number): Promise<FreshdeskTicket[]> {
  if (!isFreshdeskConfigured()) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  // Use updated_since filter + include stats for first response time
  const allTickets: FreshdeskTicket[] = [];
  let page = 1;
  const maxPages = 5; // Safety limit

  while (page <= maxPages) {
    const tickets = await freshdeskFetch<FreshdeskTicket[]>(
      `/tickets?updated_since=${sinceStr}&include=stats&per_page=100&page=${page}`
    );
    allTickets.push(...tickets);
    if (tickets.length < 100) break;
    page++;
  }

  return allTickets;
}

/**
 * Fetch only currently open/pending tickets.
 */
export async function fetchOpenTickets(): Promise<FreshdeskTicket[]> {
  if (!isFreshdeskConfigured()) return [];

  // Freshdesk filter: status is Open(2) or Pending(3)
  const [open, pending] = await Promise.all([
    freshdeskFetch<FreshdeskTicket[]>(`/tickets?filter=open&include=stats&per_page=100`),
    freshdeskFetch<FreshdeskTicket[]>(`/tickets?filter=pending&include=stats&per_page=100`),
  ]);

  return [...open, ...pending];
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**
```bash
git add src/lib/freshdesk.ts
git commit -m "feat(pulse): add Freshdesk API integration library"
```

---

### Task 7: Support Engine API Route

**Files:**
- Create: `src/app/api/pulse/support/route.ts`

**Step 1: Create the API route**

```typescript
// src/app/api/pulse/support/route.ts
import { NextResponse } from "next/server";
import { fetchOpenTickets, fetchRecentTickets, isFreshdeskConfigured, PRIORITY_LABELS } from "@/lib/freshdesk";
import { getCached, setCache } from "@/lib/pulse-cache";

export interface SupportData {
  freshdeskConfigured: boolean;
  openTickets: {
    total: number;
    byPriority: Record<string, number>;
  };
  responseTime: {
    avgHours: number | null;
    trend: "up" | "down" | "stable" | null;
  };
  weekSummary: {
    resolved: number;
    created: number;
  };
}

export async function GET() {
  try {
    if (!isFreshdeskConfigured()) {
      return NextResponse.json({ freshdeskConfigured: false, openTickets: { total: 0, byPriority: {} }, responseTime: { avgHours: null, trend: null }, weekSummary: { resolved: 0, created: 0 } });
    }

    const cached = await getCached<SupportData>("pulse:support");
    if (cached) return NextResponse.json(cached);

    const [openTickets, recentTickets] = await Promise.all([
      fetchOpenTickets(),
      fetchRecentTickets(14), // 14 days for trend comparison
    ]);

    // Open tickets by priority
    const byPriority: Record<string, number> = {};
    for (const t of openTickets) {
      const label = PRIORITY_LABELS[t.priority] || "Unknown";
      byPriority[label] = (byPriority[label] || 0) + 1;
    }

    // Average first response time (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const thisWeekTickets = recentTickets.filter(
      (t) => new Date(t.created_at) >= sevenDaysAgo
    );
    const lastWeekTickets = recentTickets.filter(
      (t) => new Date(t.created_at) >= fourteenDaysAgo && new Date(t.created_at) < sevenDaysAgo
    );

    function avgResponseHours(tickets: typeof recentTickets): number | null {
      const responseTimes = tickets
        .filter((t) => t.stats?.first_responded_at)
        .map((t) => {
          const created = new Date(t.created_at).getTime();
          const responded = new Date(t.stats!.first_responded_at!).getTime();
          return (responded - created) / (1000 * 60 * 60);
        });
      if (responseTimes.length === 0) return null;
      return Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10;
    }

    const thisWeekAvg = avgResponseHours(thisWeekTickets);
    const lastWeekAvg = avgResponseHours(lastWeekTickets);

    let trend: SupportData["responseTime"]["trend"] = null;
    if (thisWeekAvg !== null && lastWeekAvg !== null) {
      const diff = thisWeekAvg - lastWeekAvg;
      if (diff > 0.5) trend = "up"; // Slower (bad)
      else if (diff < -0.5) trend = "down"; // Faster (good)
      else trend = "stable";
    }

    // Week summary
    const resolved = thisWeekTickets.filter((t) => t.status === 4 || t.status === 5).length;
    const created = thisWeekTickets.length;

    const result: SupportData = {
      freshdeskConfigured: true,
      openTickets: { total: openTickets.length, byPriority },
      responseTime: { avgHours: thisWeekAvg, trend },
      weekSummary: { resolved, created },
    };

    await setCache("pulse:support", result, 60);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch support data" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**
```bash
git add src/app/api/pulse/support/route.ts
git commit -m "feat(pulse): add Support Engine API route"
```

---

### Task 8: AI Weekly Summary API Route

**Files:**
- Create: `src/app/api/pulse/support/summary/route.ts`

**Step 1: Create the AI summary route**

```typescript
// src/app/api/pulse/support/summary/route.ts
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchRecentTickets, isFreshdeskConfigured, STATUS_LABELS, PRIORITY_LABELS } from "@/lib/freshdesk";
import { getCached, setCache } from "@/lib/pulse-cache";

export interface SupportSummaryData {
  summary: string;
  generatedAt: string;
}

export async function POST() {
  try {
    if (!isFreshdeskConfigured()) {
      return NextResponse.json({ error: "Freshdesk not configured" }, { status: 400 });
    }

    // Check cache first (24h TTL, but POST allows force-refresh via skip param)
    const cached = await getCached<SupportSummaryData>("pulse:support-summary");
    if (cached) return NextResponse.json(cached);

    const tickets = await fetchRecentTickets(7);

    if (tickets.length === 0) {
      const result: SupportSummaryData = {
        summary: "Inga ärenden den senaste veckan.",
        generatedAt: new Date().toISOString(),
      };
      await setCache("pulse:support-summary", result, 60 * 24);
      return NextResponse.json(result);
    }

    // Prepare ticket data for Claude
    const ticketSummaries = tickets.map((t) => ({
      subject: t.subject,
      status: STATUS_LABELS[t.status] || "Unknown",
      priority: PRIORITY_LABELS[t.priority] || "Unknown",
      tags: t.tags,
      created: t.created_at.slice(0, 10),
    }));

    const resolved = tickets.filter((t) => t.status === 4 || t.status === 5).length;
    const open = tickets.filter((t) => t.status === 2 || t.status === 3).length;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Du är en business analyst för ett DTC e-handelsföretag (Swedish Balance) som säljer sömnprodukter (HappySleep kudde, Wira silk örngott) och kosttillskott (Hydro13 marine collagen) i Sverige, Norge och Danmark.

Här är kundtjänstens ärenden från senaste 7 dagarna:

Totalt: ${tickets.length} ärenden (${resolved} lösta, ${open} öppna)

Ärenden:
${JSON.stringify(ticketSummaries, null, 2)}

Skriv en kort sammanfattning (max 4 meningar) på svenska. Inkludera:
1. Antal ärenden och hur många som lösts
2. De 2-3 vanligaste problemkategorierna (t.ex. "var är mitt paket", returer, produktkvalitet)
3. Om du ser något anmärkningsvärt mönster eller trend, nämn det

Var konkret och specifik. Inga floskler.`,
        },
      ],
    });

    const summary =
      msg.content[0].type === "text" ? msg.content[0].text : "Kunde inte generera sammanfattning.";

    const result: SupportSummaryData = {
      summary,
      generatedAt: new Date().toISOString(),
    };

    await setCache("pulse:support-summary", result, 60 * 24);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate summary" },
      { status: 500 }
    );
  }
}

// Also support GET for cache-only reads
export async function GET() {
  const cached = await getCached<SupportSummaryData>("pulse:support-summary");
  if (cached) return NextResponse.json(cached);
  return NextResponse.json({ summary: null, generatedAt: null });
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**
```bash
git add src/app/api/pulse/support/summary/route.ts
git commit -m "feat(pulse): add AI weekly support summary route"
```

---

### Task 9: Reusable MetricCard Component

**Files:**
- Create: `src/components/pulse/MetricCard.tsx`

**Step 1: Create the component**

```tsx
// src/components/pulse/MetricCard.tsx
"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "stable" | null;
  trendLabel?: string;
  trendPositive?: "up" | "down"; // Which direction is "good"? Default: "up"
  icon?: React.ReactNode;
}

export default function MetricCard({
  label,
  value,
  subtitle,
  trend,
  trendLabel,
  trendPositive = "up",
  icon,
}: MetricCardProps) {
  const isGood =
    trend === null || trend === undefined
      ? null
      : trend === "stable"
        ? null
        : trend === trendPositive;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {(subtitle || trend) && (
        <div className="flex items-center gap-1.5 mt-1">
          {trend && trend !== "stable" && (
            <span className={isGood ? "text-green-600" : "text-red-600"}>
              {trend === "up" ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
            </span>
          )}
          {trend === "stable" && (
            <Minus className="w-4 h-4 text-gray-400" />
          )}
          <span className="text-sm text-gray-500">
            {trendLabel || subtitle}
          </span>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**
```bash
git add src/components/pulse/MetricCard.tsx
git commit -m "feat(pulse): add reusable MetricCard component"
```

---

### Task 10: Growth Engine UI Component

**Files:**
- Create: `src/components/pulse/GrowthEngine.tsx`

**Step 1: Create the component**

```tsx
// src/components/pulse/GrowthEngine.tsx
"use client";

import { useEffect, useState } from "react";
import { TrendingUp, AlertCircle } from "lucide-react";
import MetricCard from "./MetricCard";
import type { GrowthData } from "@/app/api/pulse/growth/route";

function formatSEK(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M kr`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}k kr`;
  return `${Math.round(amount)} kr`;
}

function formatNumber(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

export default function GrowthEngine() {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pulse/growth")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          Growth Engine
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-20 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          Growth Engine
        </h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const w = data?.week;
  const m = data?.month;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-green-600" />
        Growth Engine
      </h2>

      {data?.errors && Object.keys(data.errors).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          {Object.entries(data.errors).map(([k, v]) => (
            <div key={k}>{k}: {v}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Revenue (7d)"
          value={w ? formatSEK(w.revenue) : "—"}
          subtitle={m ? `30d: ${formatSEK(m.revenue)}` : undefined}
        />
        <MetricCard
          label="Ad Spend & ROAS (7d)"
          value={w ? `${formatSEK(w.totalSpend)} · ${w.roas !== null ? w.roas.toFixed(2) + "x" : "—"}` : "—"}
          subtitle={
            w
              ? `Meta: ${formatSEK(w.metaSpend)} · Google: ${formatSEK(w.googleSpend)}`
              : undefined
          }
        />
        <MetricCard
          label="Orders (7d)"
          value={w ? formatNumber(w.orders) : "—"}
          subtitle={w ? `AOV: ${Math.round(w.aov)} kr` : undefined}
        />
      </div>

      {data?.today && (
        <div className="text-sm text-gray-500 mt-1">
          Idag: {formatSEK(data.today.revenue)} · {data.today.orders} ordrar
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**
```bash
git add src/components/pulse/GrowthEngine.tsx
git commit -m "feat(pulse): add Growth Engine UI component"
```

---

### Task 11: Delivery Engine UI Component

**Files:**
- Create: `src/components/pulse/DeliveryEngine.tsx`

**Step 1: Create the component**

```tsx
// src/components/pulse/DeliveryEngine.tsx
"use client";

import { useEffect, useState } from "react";
import { Truck, AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";
import type { DeliveryData, StockItem } from "@/app/api/pulse/delivery/route";

const statusConfig = {
  critical: { color: "text-red-600", bg: "bg-red-100", icon: AlertCircle, label: "Kritisk" },
  warning: { color: "text-amber-600", bg: "bg-amber-100", icon: AlertTriangle, label: "Varning" },
  healthy: { color: "text-green-600", bg: "bg-green-100", icon: CheckCircle, label: "OK" },
  unknown: { color: "text-gray-400", bg: "bg-gray-100", icon: null, label: "?" },
};

function StockRow({ item }: { item: StockItem }) {
  const config = statusConfig[item.status];
  const StatusIcon = config.icon;

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          {StatusIcon && <StatusIcon className={`w-4 h-4 ${config.color}`} />}
          <span className="font-medium text-gray-900">{item.productName}</span>
        </div>
      </td>
      <td className="py-3 pr-4 text-right text-gray-700">
        {item.totalStock.toLocaleString()}
      </td>
      <td className="py-3 pr-4 text-right text-gray-700">
        {item.daysRemaining !== null ? `${item.daysRemaining}d` : "—"}
      </td>
      <td className="py-3 text-right">
        {item.status !== "unknown" && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
            {config.label}
          </span>
        )}
      </td>
    </tr>
  );
}

export default function DeliveryEngine() {
  const [data, setData] = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pulse/delivery")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" />
          Delivery Engine
        </h2>
        <div className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-40 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data?.shopifyConfigured) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" />
          Delivery Engine
        </h2>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
          Shopify-integration ej konfigurerad. Lägg till SHOPIFY_STORE_URL, SHOPIFY_CLIENT_ID och SHOPIFY_CLIENT_SECRET i miljövariabler.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" />
          Delivery Engine
        </h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const criticalCount = data.stocks.filter((s) => s.status === "critical").length;
  const warningCount = data.stocks.filter((s) => s.status === "warning").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" />
          Delivery Engine
        </h2>
        {(criticalCount > 0 || warningCount > 0) && (
          <div className="flex items-center gap-2 text-sm">
            {criticalCount > 0 && (
              <span className="text-red-600 font-medium">{criticalCount} kritisk</span>
            )}
            {warningCount > 0 && (
              <span className="text-amber-600 font-medium">{warningCount} varning</span>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3">Produkt</th>
              <th className="px-5 py-3 text-right">Lager</th>
              <th className="px-5 py-3 text-right">Dagar kvar</th>
              <th className="px-5 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="px-5">
            {data.stocks.map((item) => (
              <StockRow key={item.productSlug} item={item} />
            ))}
            {data.stocks.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                  Inga produkter hittades i Shopify
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**
```bash
git add src/components/pulse/DeliveryEngine.tsx
git commit -m "feat(pulse): add Delivery Engine UI component with stock table"
```

---

### Task 12: Support Engine UI Component

**Files:**
- Create: `src/components/pulse/SupportEngine.tsx`

**Step 1: Create the component**

```tsx
// src/components/pulse/SupportEngine.tsx
"use client";

import { useEffect, useState } from "react";
import { Headphones, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import MetricCard from "./MetricCard";
import type { SupportData } from "@/app/api/pulse/support/route";
import type { SupportSummaryData } from "@/app/api/pulse/support/summary/route";

export default function SupportEngine() {
  const [data, setData] = useState<SupportData | null>(null);
  const [summary, setSummary] = useState<SupportSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/pulse/support").then((r) => r.json()),
      fetch("/api/pulse/support/summary").then((r) => r.json()),
    ])
      .then(([supportData, summaryData]) => {
        if (supportData.error) setError(supportData.error);
        else setData(supportData);
        if (summaryData.summary) setSummary(summaryData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const generateSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/pulse/support/summary", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSummary(data);
    } catch (e) {
      // Don't override main error, just log
      console.error("Failed to generate summary:", e);
    } finally {
      setSummaryLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Headphones className="w-5 h-5 text-purple-600" />
          Support Engine
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-20 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data?.freshdeskConfigured) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Headphones className="w-5 h-5 text-purple-600" />
          Support Engine
        </h2>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
          Freshdesk-integration ej konfigurerad. Lägg till FRESHDESK_API_KEY och FRESHDESK_DOMAIN i miljövariabler.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Headphones className="w-5 h-5 text-purple-600" />
          Support Engine
        </h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Headphones className="w-5 h-5 text-purple-600" />
        Support Engine
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Öppna ärenden"
          value={String(data.openTickets.total)}
          subtitle={
            Object.entries(data.openTickets.byPriority)
              .map(([k, v]) => `${v} ${k.toLowerCase()}`)
              .join(", ") || undefined
          }
        />
        <MetricCard
          label="Svarstid (snitt 7d)"
          value={
            data.responseTime.avgHours !== null
              ? data.responseTime.avgHours < 1
                ? `${Math.round(data.responseTime.avgHours * 60)}min`
                : `${data.responseTime.avgHours.toFixed(1)}h`
              : "—"
          }
          trend={data.responseTime.trend}
          trendPositive="down"
          trendLabel={data.responseTime.trend === "up" ? "Långsammare" : data.responseTime.trend === "down" ? "Snabbare" : "Stabilt"}
        />
        <MetricCard
          label="Denna vecka"
          value={`${data.weekSummary.resolved} lösta`}
          subtitle={`${data.weekSummary.created} nya ärenden`}
        />
      </div>

      {/* AI Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-medium text-gray-700">AI-veckosummering</span>
          </div>
          <button
            onClick={generateSummary}
            disabled={summaryLoading}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${summaryLoading ? "animate-spin" : ""}`} />
            {summaryLoading ? "Genererar..." : "Uppdatera"}
          </button>
        </div>
        {summary?.summary ? (
          <p className="text-sm text-gray-700 leading-relaxed">{summary.summary}</p>
        ) : (
          <p className="text-sm text-gray-400">
            {summaryLoading
              ? "Analyserar ärenden med AI..."
              : "Ingen summering genererad. Klicka Uppdatera för att generera."}
          </p>
        )}
        {summary?.generatedAt && (
          <p className="text-xs text-gray-400 mt-2">
            Genererad: {new Date(summary.generatedAt).toLocaleString("sv-SE")}
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**
```bash
git add src/components/pulse/SupportEngine.tsx
git commit -m "feat(pulse): add Support Engine UI component with AI summary"
```

---

### Task 13: Pulse Page + Sidebar Entry

**Files:**
- Create: `src/app/pulse/page.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Create the page**

```tsx
// src/app/pulse/page.tsx
import GrowthEngine from "@/components/pulse/GrowthEngine";
import DeliveryEngine from "@/components/pulse/DeliveryEngine";
import SupportEngine from "@/components/pulse/SupportEngine";

export const dynamic = "force-dynamic";

export default function PulsePage() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Business Pulse</h1>
        <p className="text-sm text-gray-500 mt-1">
          30-sekunders hälsokoll — Growth, Delivery, Support
        </p>
      </div>

      <GrowthEngine />
      <DeliveryEngine />
      <SupportEngine />
    </div>
  );
}
```

**Step 2: Add sidebar entry**

In `src/components/layout/Sidebar.tsx`, add import for Activity icon and add nav entry:

Add `Activity` to the lucide-react import:
```typescript
import { Layers, Settings, Zap, Image, FlaskConical, LogOut, Package, BarChart3, LayoutDashboard, Eye, Lightbulb, ChevronDown, Megaphone, Bookmark, Workflow, Activity } from "lucide-react";
```

Add to the `nav` array, right after the Dashboard entry (index 1):
```typescript
{ href: "/pulse", label: "Business Pulse", icon: Activity },
```

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**
```bash
git add src/app/pulse/page.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(pulse): add Pulse page and sidebar entry"
```

---

### Task 14: Manual Test — Run Dev Server and Verify

**Step 1: Check for running dev servers**

Run: `lsof -i :3000`

Kill any existing server if found.

**Step 2: Start dev server**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npm run dev`

**Step 3: Open browser and verify**

Navigate to `http://localhost:3000/pulse`

Check:
- Page loads without errors
- Growth Engine shows data (or graceful "not configured" message)
- Delivery Engine shows Shopify inventory (or graceful "not configured" message)
- Support Engine shows Freshdesk data (or graceful "not configured" message)
- Sidebar shows "Business Pulse" with Activity icon
- Layout matches Content Hub's existing design language

**Step 4: Stop dev server**

---

### Task 15: Environment Variable Setup Help

This is a reference task — provide the user instructions for configuring any unconfigured integrations:

**Freshdesk:**
1. Go to Freshdesk → Profile → API Key
2. Add to `.env.local`:
   ```
   FRESHDESK_API_KEY=your_api_key_here
   FRESHDESK_DOMAIN=your_subdomain
   ```

**Shopify** (if not already configured):
1. Go to Shopify Admin → Settings → Apps → Develop Apps
2. Create a custom app with `read_products`, `read_orders`, `read_inventory` scopes
3. Add to `.env.local`:
   ```
   SHOPIFY_STORE_URL=your-store.myshopify.com
   SHOPIFY_CLIENT_ID=your_client_id
   SHOPIFY_CLIENT_SECRET=your_client_secret
   ```

**Google Ads** (if not already configured):
1. Apply for Google Ads API developer token at Google Ads → Tools → API Center
2. Add env vars as listed in `src/lib/google-ads.ts`

No commit needed — env vars are in `.env.local` (gitignored).
