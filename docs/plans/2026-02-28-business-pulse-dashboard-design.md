# Business Pulse Dashboard — Design

**Date**: 2026-02-28
**Inspired by**: Davie Fogarty's systems thinking (three engines: Growth, Delivery, Support)
**Goal**: A single `/pulse` page in Content Hub that gives a 30-second health check of the entire business

## Overview

Content Hub today is strong on the Growth Engine (creative pipeline, translation, publishing, Meta push). But there's zero visibility into Delivery (inventory, fulfillment) and Support (customer service). This dashboard closes that gap.

The design follows Fogarty's principle: one screen, three engines, key metrics only. No drill-down complexity — just the scoreboard.

## Page: `/pulse`

New sidebar item "Business Pulse" with Activity icon (lucide-react), placed near the top of the sidebar.

Three sections, one per engine, each with 2-3 metric cards.

---

## Section 1: Growth Engine

Three cards in a row:

### Revenue Card
- **Data**: Revenue today, last 7 days, last 30 days
- **Source**: Shopify Admin API (Orders endpoint)
- **Display**: Amount in SEK + percentage trend vs previous period (green up / red down arrow)

### Ad Spend & ROAS Card
- **Data**: Total ad spend + blended ROAS for last 7d / 30d
- **Source**: Meta Marketing API (already integrated) + Google Ads API (Phase 2)
- **Display**: Spend per channel, blended ROAS. Google Ads shows "Coming soon" placeholder until API is connected.

### Orders Card
- **Data**: Order count today, 7d, 30d + AOV
- **Source**: Shopify Admin API
- **Display**: Count + AOV in SEK + trend

### Revenue Chart
- Below the cards: simple bar chart showing daily revenue for the last 30 days
- Lightweight — no charting library, just CSS/SVG bars

---

## Section 2: Delivery Engine

Two cards:

### Stock Levels Card
- **Data**: Current inventory per product
- **Source**: Shopify Inventory API
- **Display**: Table/list of products with:
  - Current stock (units)
  - Daily sell rate (calculated from last 30d orders)
  - "Days remaining" = stock / daily rate
  - Color indicator: green (>60d), yellow (30-60d), red (<30d)

### Reorder Alerts Card
- **Data**: Products that need ordering based on lead time
- **Source**: Calculated from stock levels + `lead_time_days` on products table
- **Display**: List of products where days_remaining < lead_time_days + buffer
  - Red = critical (days_remaining < lead_time_days)
  - Yellow = warning (days_remaining < lead_time_days + 15d buffer)
  - Green = healthy

### Product Bank Schema Addition
Add to `products` table:
- `lead_time_days` (integer, nullable) — manufacturing + shipping lead time
- `reorder_threshold_days` (integer, nullable) — extra buffer days
- `shopify_inventory_item_id` (text, nullable) — links to Shopify inventory

Default values based on Master Doc:
- HappySleep: lead_time_days = 55 (40-60d range)
- Wira Pillowcase: lead_time_days = 13 (10-15d range)
- Hydro13: lead_time_days = 14 (local 3PL)

---

## Section 3: Support Engine

Three cards:

### Open Tickets Card
- **Data**: Count of currently open tickets, split by priority
- **Source**: Freshdesk API (`/api/v2/tickets?filter=open`)
- **Display**: Total count with priority breakdown (urgent/high/medium/low)

### Response Time Card
- **Data**: Average first response time over last 7 days
- **Source**: Freshdesk API (ticket stats or calculated from ticket data)
- **Display**: Hours:minutes + trend arrow vs previous 7d

### AI Weekly Summary Card
- **Data**: Claude-generated summary of the week's support tickets
- **Source**: Freshdesk API (fetch week's tickets) → Anthropic Claude API
- **Flow**:
  1. Fetch all tickets created/updated in the last 7 days from Freshdesk
  2. Extract subjects + short descriptions
  3. Send to Claude with prompt: "Summarize this week's customer support tickets for a DTC ecommerce business. Identify top issue categories, notable patterns, and any concerns."
  4. Cache the result in Supabase
- **Display**: Text block with the AI summary. Refresh button to regenerate.
- **Generation frequency**: Once per day (or on-demand). Cached in `pulse_cache`.
- **Example output**:
  > "32 ärenden lösta denna vecka. Vanligaste: 'Var är mitt paket?' (14st), returärenden (8st), kudde-kvalitet (3st). Noterbart: ökning av 'var är mitt paket'-ärenden för NO-ordrar — kan tyda på leveransproblem med YunExpress till Norge."

---

## Technical Architecture

### New API Routes
- `GET /api/pulse/growth` — fetches Shopify revenue/orders + Meta ad spend/ROAS
- `GET /api/pulse/delivery` — fetches Shopify inventory levels, calculates days remaining
- `GET /api/pulse/support` — fetches Freshdesk ticket stats
- `POST /api/pulse/support/summary` — generates AI weekly summary

### Caching Strategy
New table `pulse_cache`:
```sql
CREATE TABLE pulse_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

TTLs:
- Shopify data (revenue, orders, inventory): 15 minutes
- Meta Ads data: 15 minutes
- Freshdesk ticket counts: 1 hour
- AI weekly summary: 24 hours (or until manually refreshed)

### New Environment Variables
- `FRESHDESK_API_KEY` — Freshdesk API key
- `FRESHDESK_DOMAIN` — Freshdesk subdomain (e.g., "swedishbalance")
- `SHOPIFY_ACCESS_TOKEN` — Shopify Admin API access token
- `SHOPIFY_STORE_DOMAIN` — Shopify store domain (e.g., "swedishbalance.myshopify.com")

### New Libraries
- None needed. All APIs are REST-based, using standard `fetch()`.

### New Components
- `src/components/pulse/GrowthEngine.tsx` — Growth section
- `src/components/pulse/DeliveryEngine.tsx` — Delivery section
- `src/components/pulse/SupportEngine.tsx` — Support section
- `src/components/pulse/MetricCard.tsx` — Reusable card component (value, label, trend)
- `src/components/pulse/StockTable.tsx` — Product stock levels table
- `src/components/pulse/RevenueChart.tsx` — Simple bar chart (CSS/SVG)
- `src/app/pulse/page.tsx` — Main page

### Design
- Follows Content Hub's existing light theme: `bg-gray-50` base, `bg-white` cards, `border-gray-200`, `indigo-600` primary
- Each engine section has a header with icon + title
- Trend arrows: green for positive, red for negative
- Stock status: green/yellow/red dots
- Responsive: cards stack on mobile

---

## Implementation Phases

### Phase 1: Foundation + Shopify Integration
- Create `/pulse` page with layout
- Shopify Admin API integration (revenue, orders, inventory)
- Delivery Engine (stock levels, reorder alerts)
- Growth Engine (revenue + orders from Shopify only)
- `pulse_cache` table
- Product Bank schema additions (lead_time_days etc.)

### Phase 2: Freshdesk Integration
- Freshdesk API integration
- Support Engine (open tickets, response time)
- AI weekly summary

### Phase 3: Ad Platform Integration
- Meta Ads spend/ROAS on Growth Engine
- Google Ads API setup + integration (pending API access)
- Blended ROAS calculation

---

## Not In Scope
- Drill-down views (kept lean per Fogarty's MVS principle)
- Historical graphs beyond 30d revenue
- Automated alerts/notifications (could be Phase 4)
- Google Ads API setup guide (handled separately)
