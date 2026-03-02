# Business Pulse Dashboard V2 — Design Document

**Date:** 2026-03-02
**Status:** Approved
**Author:** Claude + William

## Context

After implementing V1 of the Business Pulse dashboard (engine-based layout with Growth, Delivery, and Support sections), user feedback indicated a desire for a more streamlined, metrics-focused interface similar to Triple Whale and Shopify Analytics.

**V1 Feedback:**
- Engine-based layout felt too segmented
- Wanted focus on key performance metrics at a glance
- Desired time period selection (today, yesterday, 7d, 14d, 30d, 90d)
- Wanted visual trend indication (sparklines)
- Needed separate visibility for Meta Ads and Google Ads performance

## Design Overview

### Visual Layout

A clean, card-based dashboard with:
- **Header:** Page title + period selector dropdown (right-aligned)
- **Grid:** 4-column responsive grid of KPI cards
- **Cards:** 8 total KPI cards, each showing:
  - Label (top-left)
  - Large primary value
  - Percentage change indicator (colored: green for positive, red for negative)
  - Sparkline chart (bottom) showing trend over selected period

### Supported Time Periods

Dropdown selector with options:
- Today
- Yesterday
- 7 days (7d)
- 14 days (14d)
- 30 days (30d)
- 90 days (90d)

Period affects both the aggregated values shown and the sparkline visualization.

## KPI Cards

### 1. Revenue
- **Value:** Total Shopify revenue for selected period
- **Change:** Percent change vs. previous equivalent period
- **Sparkline:** Daily revenue over period
- **Source:** Shopify Orders API

### 2. Blended ROAS
- **Value:** Revenue ÷ Total Ad Spend (Meta + Google)
- **Format:** "2.45x" format
- **Change:** Percent change vs. previous period
- **Sparkline:** Daily ROAS over period
- **Source:** Shopify revenue + Meta/Google ad spend

### 3. Klaviyo Revenue
- **Value:** Total revenue attributed to Klaviyo campaigns and flows
- **Change:** Percent change vs. previous period
- **Sparkline:** Daily Klaviyo revenue
- **Source:** Klaviyo Metrics API

### 4. Hydro13 Stock
- **Value:** Days of stock remaining
- **Format:** "14d kvar" (14d left)
- **Subtitle:** Units in stock + daily sell rate
- **Alert:** Visual indicator if < lead_time_days (critical) or < lead_time + reorder_threshold (warning)
- **Sparkline:** Daily stock level over period
- **Source:** Shopify inventory + order history

### 5. Orders
- **Value:** Total order count for period
- **Change:** Percent change vs. previous period
- **Sparkline:** Daily order count
- **Source:** Shopify Orders API

### 6. AOV (Average Order Value)
- **Value:** Revenue ÷ Orders
- **Format:** SEK currency
- **Change:** Percent change vs. previous period
- **Sparkline:** Daily AOV
- **Source:** Shopify Orders API

### 7. Meta Ads
- **Value:** Total Meta ad spend for period
- **Subtitle:** Meta ROAS (Revenue attributed to Meta ÷ Meta spend)
- **Change:** Percent change in spend vs. previous period
- **Sparkline:** Daily Meta spend
- **Source:** Meta Marketing API

### 8. Google Ads
- **Value:** Total Google ad spend for period
- **Subtitle:** Google ROAS (Revenue attributed to Google ÷ Google spend)
- **Change:** Percent change in spend vs. previous period
- **Sparkline:** Daily Google spend
- **Source:** Google Ads API

## Technical Architecture

### API Design

**Centralized Metrics Endpoint:**
```
GET /api/pulse/metrics?period=7d
```

**Response Format:**
```typescript
{
  period: "7d",
  startDate: "2026-02-23T00:00:00Z",
  endDate: "2026-03-02T00:00:00Z",

  metrics: {
    revenue: {
      current: 125000,
      previous: 110000,
      changePercent: 13.6,
      timeseries: [
        { date: "2026-02-23", value: 15000 },
        { date: "2026-02-24", value: 18000 },
        // ... daily values
      ]
    },
    blendedRoas: { /* same structure */ },
    klaviyoRevenue: { /* same structure */ },
    hydro13Stock: {
      current: 14, // days remaining
      units: 420,
      sellRate: 30,
      status: "healthy" | "warning" | "critical",
      timeseries: [ /* daily stock levels */ ]
    },
    orders: { /* same structure */ },
    aov: { /* same structure */ },
    metaAds: {
      spend: { /* current, previous, change, timeseries */ },
      roas: { /* current, previous, change, timeseries */ }
    },
    googleAds: {
      spend: { /* current, previous, change, timeseries */ },
      roas: { /* current, previous, change, timeseries */ }
    }
  }
}
```

**Caching Strategy:**
- Reuse existing `pulse_cache` table
- Cache key pattern: `pulse:metrics:{period}`
- TTL: 15 minutes for all periods except "today" (5 minutes)
- Cache invalidation on period change

### New Integrations

**Klaviyo Metrics API:**
- New file: `src/lib/klaviyo.ts`
- Environment variable: `KLAVIYO_API_KEY`
- Endpoints:
  - Campaign performance metrics
  - Flow revenue attribution
- Aggregate campaign + flow revenue for selected period

### Component Structure

**New Components:**

1. **`src/components/pulse/KpiCard.tsx`**
   - Props: `label`, `value`, `changePercent`, `sparklineData`, `subtitle?`, `status?`
   - Handles formatting, color-coding, sparkline rendering
   - Responsive layout

2. **`src/components/pulse/PeriodSelector.tsx`**
   - Dropdown with 6 period options
   - Controlled component (value + onChange)
   - Styled to match existing Content Hub design

**Modified Components:**

3. **`src/app/pulse/page.tsx`**
   - Simplified layout: header + grid of 8 KpiCard components
   - Period state management
   - Single API call to `/api/pulse/metrics`
   - Loading states for all cards simultaneously

**Removed Components:**
- `src/components/pulse/GrowthEngine.tsx`
- `src/components/pulse/DeliveryEngine.tsx`
- `src/components/pulse/SupportEngine.tsx`
- `src/components/pulse/MetricCard.tsx` (old version)

### Charting Library

**Recharts** for sparklines:
- Lightweight, React-native
- `<LineChart>` with minimal config
- Responsive container
- No axes, labels, or grid (clean sparkline aesthetic)
- Smooth curves with `type="monotone"`

Install:
```bash
npm install recharts
```

### Data Sources Summary

| KPI | Primary API | Secondary API |
|-----|-------------|---------------|
| Revenue | Shopify Orders | — |
| Blended ROAS | Shopify Orders | Meta + Google Ads |
| Klaviyo Revenue | Klaviyo Metrics | — |
| Hydro13 Stock | Shopify Inventory | Shopify Orders (sell rate) |
| Orders | Shopify Orders | — |
| AOV | Shopify Orders | — |
| Meta Ads | Meta Marketing API | Shopify Orders (attribution) |
| Google Ads | Google Ads API | Shopify Orders (attribution) |

### Error Handling

**Graceful Degradation:**
- If Meta API fails: Show "Not configured" or last cached value
- If Google API fails: Show "Not configured" or last cached value
- If Klaviyo API fails: Show "Not available"
- If Shopify fails: Show error state for entire dashboard

**Loading States:**
- All 8 cards show skeleton loaders simultaneously
- Period selector disabled during loading
- Error banner above cards if critical API fails

## Implementation Notes

- Reuse existing Shopify, Meta, and Google Ads utilities from `src/lib/`
- Maintain existing `pulse_cache` table structure
- Keep Swedish language for UI (labels, tooltips)
- Mobile responsive: 1 column on mobile, 2 on tablet, 4 on desktop
- Period selector persists in URL query params for shareable links

## Success Criteria

- All 8 KPIs display correctly with accurate data
- Period selector changes all metrics and sparklines
- Sparklines render smoothly without performance issues
- Page loads in < 2 seconds with cached data
- Mobile layout is fully functional
- Error states are handled gracefully
- Design matches Triple Whale aesthetic reference
