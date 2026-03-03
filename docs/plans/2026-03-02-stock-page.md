# Stock Management Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `/stock` page showing real-time inventory for COLLAGEN-MARINE-12500 from Shelfless, daily sales velocity from Shopify, and reorder intelligence.

**Architecture:** Rewrite `src/lib/shelfless.ts` to use HTTP Basic Auth at `rest.dreamlogistics.se`. Create a new `GET /api/stock` endpoint that combines Shelfless stock + Shopify sell rates into a single cached response. Build a client-side `/stock` page with 3 cards (overview, velocity, reorder intelligence). Add sidebar nav entry.

**Tech Stack:** Next.js App Router, Supabase (caching via `pulse_cache`), Tailwind CSS, Lucide icons, Shelfless REST API, Shopify REST API.

---

### Task 1: Rewrite Shelfless API client for HTTP Basic Auth

**Files:**
- Modify: `src/lib/shelfless.ts` (complete rewrite)
- Modify: `.env.local` (add new env vars)

**Step 1: Add env vars to `.env.local`**

Add these two lines (replacing the old `SHELFLESS_CLIENT_ID`, `SHELFLESS_CLIENT_SECRET`, `SHELFLESS_TOKEN_URL` if they exist):

```
SHELFLESS_USERNAME=swedishbalance
SHELFLESS_PASSWORD=*ukixoYibrA5$?L
```

**Step 2: Rewrite `src/lib/shelfless.ts`**

Replace the entire file with:

```typescript
const SHELFLESS_API_BASE = "https://rest.dreamlogistics.se";
const SHELFLESS_TIMEOUT_MS = 15_000;
const COLLAGEN_SKU = "COLLAGEN-MARINE-12500";

export interface ShelflessProduct {
  productNumber: string;
  externalId: string;
  physicalQuantity: number;
  quantityOnDeliveries: number;
  quantityFromUncompletedIncomingDeliveries: number;
  returnQuantity: number;
  disposableQuantity: number;
}

interface ShelflessStockResponse {
  page: number;
  itemsPerPage: number;
  nextPage: string | null;
  previousPage: string | null;
  products: ShelflessProduct[];
}

export interface StockData {
  disposable: number;
  physical: number;
  onDeliveries: number;
  incomingDeliveries: number;
  returns: number;
}

function getAuthHeader(): string {
  const username = process.env.SHELFLESS_USERNAME;
  const password = process.env.SHELFLESS_PASSWORD;
  if (!username || !password) {
    throw new Error("SHELFLESS_USERNAME and SHELFLESS_PASSWORD must be set");
  }
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

export function isShelflessConfigured(): boolean {
  return !!(process.env.SHELFLESS_USERNAME && process.env.SHELFLESS_PASSWORD);
}

/**
 * Fetch stock data for COLLAGEN-MARINE-12500 from Shelfless (DreamLogistics).
 * Returns disposable (sellable), physical, on-deliveries, incoming, and return quantities.
 */
export async function fetchStock(): Promise<StockData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHELFLESS_TIMEOUT_MS);

  try {
    const sku = encodeURIComponent(`[${COLLAGEN_SKU}]`);
    const res = await fetch(
      `${SHELFLESS_API_BASE}/api/v1/stock?productNumbers=${sku}`,
      {
        headers: { Authorization: getAuthHeader() },
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Shelfless API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data: ShelflessStockResponse = await res.json();
    const product = data.products.find((p) => p.productNumber === COLLAGEN_SKU);

    if (!product) {
      console.warn(`Shelfless: SKU ${COLLAGEN_SKU} not found`);
      return { disposable: 0, physical: 0, onDeliveries: 0, incomingDeliveries: 0, returns: 0 };
    }

    return {
      disposable: product.disposableQuantity,
      physical: product.physicalQuantity,
      onDeliveries: product.quantityOnDeliveries,
      incomingDeliveries: product.quantityFromUncompletedIncomingDeliveries,
      returns: product.returnQuantity,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Legacy wrapper: returns disposable quantity only.
 * Used by existing Pulse metrics endpoint.
 */
export async function fetchHydro13Stock(): Promise<number> {
  if (!isShelflessConfigured()) {
    console.warn("Shelfless not configured — returning 0 stock");
    return 0;
  }
  try {
    const stock = await fetchStock();
    return stock.disposable;
  } catch (error) {
    console.error("Failed to fetch stock from Shelfless:", error);
    return 0;
  }
}
```

**Step 3: Verify the existing Pulse metrics endpoint still works**

Run: `npm run build`
Expected: No build errors. `fetchHydro13Stock` is still exported with the same signature so existing callers are unaffected.

**Step 4: Commit**

```bash
git add src/lib/shelfless.ts .env.local
git commit -m "refactor: rewrite shelfless.ts for HTTP Basic Auth (DreamLogistics API)"
```

---

### Task 2: Create stock API endpoint

**Files:**
- Create: `src/app/api/stock/route.ts`

**Step 1: Create the endpoint**

```typescript
// src/app/api/stock/route.ts
import { NextResponse } from "next/server";
import { fetchStock, isShelflessConfigured, StockData } from "@/lib/shelfless";
import { fetchOrdersFullSince, isShopifyConfigured } from "@/lib/shopify";
import { createServerSupabase } from "@/lib/supabase";
import { getCached, setCache } from "@/lib/pulse-cache";

const COLLAGEN_SKU = "COLLAGEN-MARINE-12500";
const CACHE_KEY = "stock:collagen";
const CACHE_TTL = 15; // minutes
const SAFETY_BUFFER_DAYS = 30;

interface SellRates {
  daily7d: number;
  daily30d: number;
  daily90d: number;
  dailyTimeseries: Array<{ date: string; units: number }>;
}

export interface StockResponse {
  stock: StockData;
  sellRates: SellRates;
  daysRemaining: number | null;
  reorderByDate: string | null;
  suggestedOrderQty: number | null;
  status: "healthy" | "warning" | "critical" | "unknown";
  leadTimeDays: number;
  reorderThresholdDays: number;
  updatedAt: string;
}

function countUnitsSold(
  orders: Array<{ line_items: Array<{ sku: string | null; quantity: number }> }>,
  sinceDaysAgo: number
): number {
  const cutoff = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000);
  let total = 0;
  for (const order of orders) {
    const orderDate = new Date((order as unknown as { created_at: string }).created_at);
    if (orderDate < cutoff) continue;
    for (const li of order.line_items) {
      if (li.sku === COLLAGEN_SKU) {
        total += li.quantity;
      }
    }
  }
  return total;
}

function buildDailyTimeseries(
  orders: Array<{
    created_at: string;
    line_items: Array<{ sku: string | null; quantity: number }>;
  }>
): Array<{ date: string; units: number }> {
  const counts: Record<string, number> = {};
  // Initialize last 30 days with 0
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    counts[d.toISOString().slice(0, 10)] = 0;
  }
  for (const order of orders) {
    const date = order.created_at.slice(0, 10);
    if (!(date in counts)) continue;
    for (const li of order.line_items) {
      if (li.sku === COLLAGEN_SKU) {
        counts[date] = (counts[date] || 0) + li.quantity;
      }
    }
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, units]) => ({ date, units }));
}

export async function GET() {
  try {
    const cached = await getCached<StockResponse>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    if (!isShelflessConfigured() || !isShopifyConfigured()) {
      return NextResponse.json({ error: "Stock integrations not configured" }, { status: 503 });
    }

    const db = createServerSupabase();

    // Fetch stock, product config, and 90 days of orders in parallel
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const [stock, productResult, orders] = await Promise.all([
      fetchStock(),
      db.from("products").select("lead_time_days, reorder_threshold_days").eq("slug", "hydro13").single(),
      fetchOrdersFullSince(ninetyDaysAgo),
    ]);

    const leadTimeDays = productResult.data?.lead_time_days ?? 30;
    const reorderThresholdDays = productResult.data?.reorder_threshold_days ?? 14;

    // Calculate sell rates per SKU from line items
    const units7d = countUnitsSold(orders, 7);
    const units30d = countUnitsSold(orders, 30);
    const units90d = countUnitsSold(orders, 90);

    const daily7d = units7d / 7;
    const daily30d = units30d / 30;
    const daily90d = units90d / 90;

    // Use 30-day average as primary rate for forecasting
    const primaryRate = daily30d;

    // Days remaining
    const daysRemaining = primaryRate > 0 ? stock.disposable / primaryRate : null;

    // Reorder by date: today + (daysRemaining - leadTimeDays)
    let reorderByDate: string | null = null;
    if (daysRemaining !== null) {
      const daysUntilReorder = daysRemaining - leadTimeDays;
      const reorderDate = new Date(Date.now() + daysUntilReorder * 24 * 60 * 60 * 1000);
      reorderByDate = reorderDate.toISOString().slice(0, 10);
    }

    // Suggested order quantity: enough to cover lead time + safety buffer
    let suggestedOrderQty: number | null = null;
    if (primaryRate > 0) {
      const needed = primaryRate * (leadTimeDays + SAFETY_BUFFER_DAYS);
      suggestedOrderQty = Math.max(0, Math.ceil(needed - stock.disposable));
    }

    // Status
    let status: StockResponse["status"] = "unknown";
    if (daysRemaining !== null) {
      if (daysRemaining < leadTimeDays) {
        status = "critical";
      } else if (daysRemaining < leadTimeDays + reorderThresholdDays) {
        status = "warning";
      } else {
        status = "healthy";
      }
    }

    const dailyTimeseries = buildDailyTimeseries(orders);

    const result: StockResponse = {
      stock,
      sellRates: { daily7d, daily30d, daily90d, dailyTimeseries },
      daysRemaining,
      reorderByDate,
      suggestedOrderQty,
      status,
      leadTimeDays,
      reorderThresholdDays,
      updatedAt: new Date().toISOString(),
    };

    await setCache(CACHE_KEY, result, CACHE_TTL);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch stock data" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No errors, `/api/stock` appears in build output.

**Step 3: Test manually**

Run dev server and curl: `curl http://localhost:3000/api/stock | jq .`
Expected: JSON with stock data, sell rates, days remaining, status.

**Step 4: Commit**

```bash
git add src/app/api/stock/route.ts
git commit -m "feat: add GET /api/stock endpoint with Shelfless + Shopify data"
```

---

### Task 3: Build the stock page UI

**Files:**
- Create: `src/app/stock/page.tsx` (server component, minimal)
- Create: `src/app/stock/StockClient.tsx` (client component, main UI)

**Step 1: Create server component**

```typescript
// src/app/stock/page.tsx
import StockClient from "./StockClient";

export default function StockPage() {
  return <StockClient />;
}
```

**Step 2: Create client component**

Build `src/app/stock/StockClient.tsx` with:

**State & data fetching:**
- Fetch from `/api/stock` on mount + on manual refresh
- Loading state, error state
- Auto-refresh every 5 minutes

**Layout — 3 cards:**

**Card 1: Stock Overview**
- Big number: disposable units
- Days remaining (with color coding: green/amber/red)
- Status badge (Healthy/Warning/Critical)
- Secondary info: physical qty, on deliveries, incoming, returns
- Visual: horizontal bar showing how many days of stock remain relative to lead time + threshold

**Card 2: Sales Velocity**
- 3 rates: 7d, 30d, 90d daily average (highlight 30d as primary)
- Projected monthly burn: `daily30d × 30`
- Mini sparkline of daily units sold (last 30 days) — use a simple div-based bar chart (no chart library needed, just flex divs with height proportional to value)

**Card 3: Reorder Intelligence**
- "Order by" date (bold, red if in the past, amber if within 7 days)
- Suggested order quantity (units)
- Status message:
  - Healthy: "Stock covers {days} days. No action needed."
  - Warning: "Order within {days} days to avoid stockout."
  - Critical: "Order NOW — stockout in {days} days, lead time is {leadTime} days."
- Show calculation breakdown: `{rate}/day × ({leadTime} + {buffer} days) - {current} = {suggested} units`

**Styling:** Match existing content-hub card patterns:
- `bg-white rounded-xl border border-gray-200 p-6`
- Section headers: `text-sm font-medium text-gray-500 uppercase tracking-wide`
- Big numbers: `text-3xl font-bold tabular-nums`
- Status colors: green-600 (healthy), amber-500 (warning), red-600 (critical)

**Step 3: Verify build + visual check**

Run: `npm run dev`
Navigate to `/stock`, verify all 3 cards render with live data.

**Step 4: Commit**

```bash
git add src/app/stock/page.tsx src/app/stock/StockClient.tsx
git commit -m "feat: add /stock page with inventory overview, velocity, and reorder intelligence"
```

---

### Task 4: Add sidebar navigation entry

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add "Inventory" nav item**

In `src/components/layout/Sidebar.tsx`, find the `nav` array (line 38). Add after the "Products" entry (line 55):

```typescript
{ href: "/stock", label: "Inventory", icon: Package },
```

Wait — `Package` is already imported and used by "Products". Use a different icon. Import `Warehouse` from lucide-react instead:

Add `Warehouse` to the import on line 6. Then add the nav entry:

```typescript
{ href: "/stock", label: "Inventory", icon: Warehouse },
```

Place it after Products and before Performance in the nav array.

**Step 2: Verify sidebar**

Run: `npm run dev`
Check sidebar shows "Inventory" link, clicking it navigates to `/stock`.

**Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: add Inventory to sidebar navigation"
```

---

### Task 5: Update Pulse metrics to use new shelfless.ts

**Files:**
- Verify: `src/app/api/pulse/metrics/route.ts` (should still work via `fetchHydro13Stock` wrapper)

**Step 1: Verify Pulse still works**

Run: `npm run dev`
Navigate to `/pulse`, verify the "Hydro13 Lager" card still shows stock data (now pulled via HTTP Basic Auth).

If there are old `SHELFLESS_CLIENT_ID`/`SHELFLESS_CLIENT_SECRET`/`SHELFLESS_TOKEN_URL` env vars in `.env.local`, remove them.

**Step 2: Commit (only if env cleanup needed)**

```bash
git add .env.local
git commit -m "chore: remove old Shelfless OAuth env vars"
```
