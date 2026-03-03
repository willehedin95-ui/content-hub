# Stock Management Page

**Date**: 2026-03-02
**Status**: Approved

## Overview

A dedicated `/stock` page showing real-time inventory for COLLAGEN-MARINE-12500, daily sales velocity, and reorder intelligence. Data from Shelfless (stock levels) + Shopify (sales). Appstle subscriptions added later once the API key is sorted.

## Data Sources

| Source | What | How |
|--------|------|-----|
| **Shelfless** (DreamLogistics) | Current stock: disposable quantity | `GET /api/v1/stock` with Basic Auth at `rest.dreamlogistics.se` |
| **Shopify** | Orders last 30/60/90 days for sell rate | Existing `fetchOrdersSince()` |
| **Appstle** (future) | Active subscription count + next renewal dates | `GET /api/external/v2/subscription-contract-details` |
| **Products table** | `lead_time_days` (30), `reorder_threshold_days` | Existing columns |

## Page Layout

**Header:** "Inventory" with a refresh button and last-updated timestamp.

### Card 1 — Stock Overview (big numbers)
- **Disposable units:** sellable count from Shelfless
- **Days of stock remaining:** `disposable / daily_sell_rate`
- **Status badge:** Healthy / Warning / Critical (based on days vs lead time thresholds)
- **Visual:** progress bar or gauge showing days remaining vs lead time

### Card 2 — Sales Velocity
- **Daily average (7d / 30d / 90d):** e.g. "5.2 units/day (7d)" — see if sales are accelerating or slowing
- **Projected monthly burn:** daily avg x 30
- **Sparkline** of daily orders over last 30 days

### Card 3 — Reorder Intelligence
- **Reorder point:** date when you MUST place an order (stock hits zero minus lead time)
- **"Order by" date:** today + (days_remaining - lead_time_days). If in the past = critical alert
- **Suggested order quantity:** `daily_sell_rate x (lead_time_days + safety_buffer) - current_stock`. Enough to cover lead time + 30 day buffer
- **Status-based messaging:**
  - Healthy: "No action needed. Stock covers X days."
  - Warning: "Order within X days to avoid stockout."
  - Critical: "Order NOW — stockout projected in X days, lead time is 30 days."

### Card 4 — Subscriptions (future, placeholder)
- Active subscription count
- Monthly subscription volume (units)
- Impact on forecast: "X of your Y daily units are recurring"

## Thresholds

Using existing `lead_time_days` and `reorder_threshold_days` from products table:
- **Critical:** days remaining < lead_time_days (can't get stock in time)
- **Warning:** days remaining < lead_time_days + reorder_threshold_days
- **Healthy:** above both thresholds

## API

**`GET /api/stock`** — returns all stock data in one call:
- Shelfless stock (disposable, physical, on deliveries)
- Shopify sell rates (7d, 30d, 90d averages)
- Days remaining, reorder date, suggested quantity
- Status (healthy/warning/critical)
- Cached 15 minutes in `pulse_cache`

## Backend Changes

**`src/lib/shelfless.ts`** — rewrite to use HTTP Basic Auth at `rest.dreamlogistics.se`:
- Base URL: `https://rest.dreamlogistics.se`
- Auth: HTTP Basic (username: `SHELFLESS_USERNAME`, password: `SHELFLESS_PASSWORD`)
- `fetchStock()` → returns disposable quantity for COLLAGEN-MARINE-12500

**Update `.env.local`** — replace old Shelfless OAuth vars with:
```
SHELFLESS_USERNAME=swedishbalance
SHELFLESS_PASSWORD=*ukixoYibrA5$?L
```

## Sidebar

Add "Inventory" with Package icon to the sidebar navigation.

## Out of Scope
- Historical stock level tracking / trends
- Multiple products (just COLLAGEN-MARINE-12500)
- Purchase order creation / supplier integration
- Automated alerts (future: WhatsApp notification)
