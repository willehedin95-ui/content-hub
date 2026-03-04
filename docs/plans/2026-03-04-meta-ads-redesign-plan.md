# Meta Ads Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the unused Performance page with a Meta Ads dashboard, transform the Morning Brief into an AI Actions page, add creative component breakdown and learning phase tracking.

**Architecture:** Two-page split — `/morning-brief` becomes action-first Daily Actions page (restructured UI, same API backend), new `/meta-ads` page replaces `/performance` with KPI cards, campaign table with pause/scale buttons + learning phase badges, and Atria-style creative breakdown (Headlines/Copy/Images tabs). Both pages reuse existing signal engine and Meta API wrapper.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Recharts (sparklines), Supabase (meta_ad_performance table), Meta Marketing API v22.0

**Design doc:** `docs/plans/2026-03-04-meta-ads-redesign-design.md`

---

## Task 1: Sidebar Navigation Update

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:38-56`

**Step 1: Update the nav array**

Replace the `nav` useMemo (lines 38-56) with:

```typescript
const nav: NavEntry[] = useMemo(() => [
  { href: "/", label: "Business Pulse", icon: Activity },
  { href: "/pages", label: "Landing Pages", icon: Layers },
  { href: "/ab-tests", label: "A/B Tests", icon: FlaskConical },
  {
    label: "Ads",
    icon: Megaphone,
    children: [
      { href: "/pipeline", label: "Ad Tracker", icon: Workflow },
      { href: "/brainstorm", label: "Brainstorm", icon: Lightbulb, badge: pipelineBadgeCount > 0 ? pipelineBadgeCount : undefined },
      { href: "/images", label: "Static Ads", icon: Image },
      { href: "/hooks", label: "Hook Bank", icon: Library },
    ],
  },
  { href: "/products", label: "Products", icon: Package },
  { href: "/stock", label: "Inventory", icon: Warehouse },
  { href: "/meta-ads", label: "Meta Ads", icon: BarChart3 },
  { href: "/morning-brief", label: "Daily Actions", icon: Zap },
], [pipelineBadgeCount]);
```

Changes: `/performance` → `/meta-ads`, "Morning Brief" → "Daily Actions", Sun icon → Zap icon.

**Step 2: Update icon import**

The `Zap` icon is already imported (line 6, used for logo). The `Sun` import can be removed.

**Step 3: Verify build**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npm run build`

**Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "refactor: sidebar — rename Morning Brief to Daily Actions, Performance to Meta Ads"
```

---

## Task 2: Delete Performance Page

**Files:**
- Delete: `src/app/performance/` (entire directory)

**Step 1: Delete the performance directory**

```bash
rm -rf src/app/performance/
```

Note: Keep the API routes under `src/app/api/analytics/` — some may be reused by the Meta Ads dashboard or other pages.

**Step 2: Verify build**

Run: `npm run build`

If build fails due to imports referencing performance page components, fix the imports. The page was self-contained so this is unlikely.

**Step 3: Commit**

```bash
git add -u src/app/performance/
git commit -m "refactor: remove unused Performance page (replaced by Meta Ads dashboard)"
```

---

## Task 3: New Meta Ads Dashboard API Route

**Files:**
- Create: `src/app/api/meta-ads/dashboard/route.ts`

This route powers the entire `/meta-ads` dashboard: KPI cards, campaign table with learning phase, and creative breakdown.

**Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "7", 10);
  const country = searchParams.get("country") || "all"; // all, SE, NO, DK

  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  const prevSince = new Date(since);
  prevSince.setDate(prevSince.getDate() - days);
  const prevSinceStr = prevSince.toISOString().split("T")[0];

  // Fetch all daily performance data for both current + previous period
  let query = supabase
    .from("meta_ad_performance")
    .select("*")
    .gte("date", prevSinceStr)
    .order("date", { ascending: true });

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows || rows.length === 0) return NextResponse.json({ kpis: null, campaigns: [], creative_breakdown: { headlines: [], copies: [], images: [] } });

  // Filter by country if specified (match campaign_name prefix like "SE ", "NO ", "DK ")
  const filtered = country === "all" ? rows : rows.filter((r: any) => {
    const name = (r.campaign_name || "").toUpperCase();
    return name.startsWith(country.toUpperCase() + " ") || name.startsWith(country.toUpperCase() + "#");
  });

  // Split into current and previous periods
  const current = filtered.filter((r: any) => r.date >= sinceStr);
  const previous = filtered.filter((r: any) => r.date < sinceStr && r.date >= prevSinceStr);

  // ── KPIs ──
  const sumMetrics = (rows: any[]) => ({
    spend: rows.reduce((s, r) => s + (r.spend || 0), 0),
    revenue: rows.reduce((s, r) => s + (r.purchase_value || 0), 0),
    purchases: rows.reduce((s, r) => s + (r.purchases || 0), 0),
    impressions: rows.reduce((s, r) => s + (r.impressions || 0), 0),
    clicks: rows.reduce((s, r) => s + (r.clicks || 0), 0),
  });

  const cur = sumMetrics(current);
  const prev = sumMetrics(previous);
  const pctChange = (c: number, p: number) => p > 0 ? ((c - p) / p) * 100 : null;

  const kpis = {
    spend: { value: cur.spend, change: pctChange(cur.spend, prev.spend) },
    revenue: { value: cur.revenue, change: pctChange(cur.revenue, prev.revenue) },
    roas: { value: cur.spend > 0 ? cur.revenue / cur.spend : 0, change: null as number | null },
    cpa: { value: cur.purchases > 0 ? cur.spend / cur.purchases : 0, change: null as number | null },
    purchases: { value: cur.purchases, change: pctChange(cur.purchases, prev.purchases) },
    // Sparkline data: daily totals
    sparklines: buildDailySparklines(current),
  };

  // Compute ROAS/CPA change
  const prevRoas = prev.reduce((s, r) => s + (r.spend || 0), 0) > 0
    ? prev.reduce((s, r) => s + (r.purchase_value || 0), 0) / prev.reduce((s, r) => s + (r.spend || 0), 0)
    : 0;
  const prevCpa = prev.reduce((s, r) => s + (r.purchases || 0), 0) > 0
    ? prev.reduce((s, r) => s + (r.spend || 0), 0) / prev.reduce((s, r) => s + (r.purchases || 0), 0)
    : 0;
  kpis.roas.change = pctChange(kpis.roas.value, prevRoas);
  kpis.cpa.change = pctChange(kpis.cpa.value, prevCpa);

  // ── Campaign Table ──
  // Group current period by campaign
  const campaignMap = new Map<string, any>();
  for (const r of current) {
    const key = r.campaign_id || r.campaign_name;
    if (!campaignMap.has(key)) {
      campaignMap.set(key, {
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, frequency_sum: 0, days: 0,
        adset_ids: new Set<string>(),
      });
    }
    const c = campaignMap.get(key);
    c.spend += r.spend || 0;
    c.impressions += r.impressions || 0;
    c.clicks += r.clicks || 0;
    c.purchases += r.purchases || 0;
    c.revenue += r.purchase_value || 0;
    c.frequency_sum += r.frequency || 0;
    c.days += 1;
    if (r.adset_id) c.adset_ids.add(r.adset_id);
  }

  const campaigns = Array.from(campaignMap.values()).map((c) => ({
    campaign_id: c.campaign_id,
    campaign_name: c.campaign_name,
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
    purchases: c.purchases,
    revenue: c.revenue,
    roas: c.spend > 0 ? c.revenue / c.spend : 0,
    cpa: c.purchases > 0 ? c.spend / c.purchases : 0,
    frequency: c.days > 0 ? c.frequency_sum / c.days : 0,
    adset_ids: Array.from(c.adset_ids),
  })).sort((a, b) => b.spend - a.spend);

  // ── Creative Breakdown ──
  // Fetch meta_ads to get headline/copy/image for each ad
  const adIds = [...new Set(current.map((r: any) => r.meta_ad_id).filter(Boolean))];
  let metaAds: any[] = [];
  if (adIds.length > 0) {
    const { data } = await supabase
      .from("meta_ads")
      .select("meta_ad_id, headline, ad_copy, image_url")
      .in("meta_ad_id", adIds);
    metaAds = data || [];
  }

  // Build ad_id → creative component map
  const adCreativeMap = new Map<string, { headline: string; copy: string; image_url: string }>();
  for (const a of metaAds) {
    adCreativeMap.set(a.meta_ad_id, {
      headline: a.headline || "",
      copy: a.ad_copy || "",
      image_url: a.image_url || "",
    });
  }

  // Aggregate performance by each component
  const headlineAgg = new Map<string, { spend: number; revenue: number; purchases: number; impressions: number; clicks: number }>();
  const copyAgg = new Map<string, { spend: number; revenue: number; purchases: number; impressions: number; clicks: number }>();
  const imageAgg = new Map<string, { spend: number; revenue: number; purchases: number; impressions: number; clicks: number; image_url: string }>();

  for (const r of current) {
    const creative = adCreativeMap.get(r.meta_ad_id);
    if (!creative) continue;

    // Headline aggregation
    if (creative.headline) {
      const existing = headlineAgg.get(creative.headline) || { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 };
      existing.spend += r.spend || 0;
      existing.revenue += r.purchase_value || 0;
      existing.purchases += r.purchases || 0;
      existing.impressions += r.impressions || 0;
      existing.clicks += r.clicks || 0;
      headlineAgg.set(creative.headline, existing);
    }

    // Copy aggregation
    if (creative.copy) {
      const existing = copyAgg.get(creative.copy) || { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 };
      existing.spend += r.spend || 0;
      existing.revenue += r.purchase_value || 0;
      existing.purchases += r.purchases || 0;
      existing.impressions += r.impressions || 0;
      existing.clicks += r.clicks || 0;
      copyAgg.set(creative.copy, existing);
    }

    // Image aggregation
    if (creative.image_url) {
      const existing = imageAgg.get(creative.image_url) || { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0, image_url: creative.image_url };
      existing.spend += r.spend || 0;
      existing.revenue += r.purchase_value || 0;
      existing.purchases += r.purchases || 0;
      existing.impressions += r.impressions || 0;
      existing.clicks += r.clicks || 0;
      imageAgg.set(creative.image_url, existing);
    }
  }

  const toBreakdownArray = (map: Map<string, any>, textKey: string) =>
    Array.from(map.entries())
      .map(([text, metrics]) => ({
        [textKey]: text,
        spend: metrics.spend,
        revenue: metrics.revenue,
        roas: metrics.spend > 0 ? metrics.revenue / metrics.spend : 0,
        purchases: metrics.purchases,
        ctr: metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0,
        ...(metrics.image_url ? { image_url: metrics.image_url } : {}),
      }))
      .sort((a, b) => b.roas - a.roas);

  const creative_breakdown = {
    headlines: toBreakdownArray(headlineAgg, "headline"),
    copies: toBreakdownArray(copyAgg, "copy"),
    images: toBreakdownArray(imageAgg, "image_url"),
  };

  return NextResponse.json({ kpis, campaigns, creative_breakdown });
}

function buildDailySparklines(rows: any[]) {
  const dailyMap = new Map<string, { spend: number; revenue: number; roas: number; purchases: number; cpa: number }>();
  for (const r of rows) {
    const existing = dailyMap.get(r.date) || { spend: 0, revenue: 0, roas: 0, purchases: 0, cpa: 0 };
    existing.spend += r.spend || 0;
    existing.revenue += r.purchase_value || 0;
    existing.purchases += r.purchases || 0;
    dailyMap.set(r.date, existing);
  }

  return Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, m]) => ({
      date,
      spend: m.spend,
      revenue: m.revenue,
      roas: m.spend > 0 ? m.revenue / m.spend : 0,
      cpa: m.purchases > 0 ? m.spend / m.purchases : 0,
      purchases: m.purchases,
    }));
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/app/api/meta-ads/dashboard/route.ts
git commit -m "feat: add Meta Ads dashboard API route (KPIs, campaigns, creative breakdown)"
```

---

## Task 4: Learning Phase API

**Files:**
- Create: `src/app/api/meta-ads/learning-phase/route.ts`

Fetches learning phase status for all active ad sets from Meta API.

**Step 1: Create the route**

```typescript
import { NextResponse } from "next/server";

export const maxDuration = 15;

const META_TOKEN = process.env.META_SYSTEM_USER_TOKEN!;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!;

export async function GET() {
  try {
    // Fetch active ad sets with learning phase info
    const url = new URL(`https://graph.facebook.com/v22.0/act_${AD_ACCOUNT_ID}/adsets`);
    url.searchParams.set("fields", "id,name,effective_status,status,campaign_id,daily_budget,issues_info");
    url.searchParams.set("filtering", JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "LEARNING_LIMITED"] }]));
    url.searchParams.set("limit", "200");
    url.searchParams.set("access_token", META_TOKEN);

    const res = await fetch(url.toString());
    const json = await res.json();

    if (json.error) {
      return NextResponse.json({ error: json.error.message }, { status: 500 });
    }

    const adsets = (json.data || []).map((adset: any) => {
      // Determine learning phase from issues_info or effective_status
      let learning_phase: "active" | "learning" | "learning_limited" | "unknown" = "unknown";

      if (adset.effective_status === "ACTIVE") {
        // Check issues_info for learning phase details
        const hasLearningLimited = adset.issues_info?.some((issue: any) =>
          issue.level === "LEARNING_LIMITED" || issue.error_code === 1487924
        );
        if (hasLearningLimited) {
          learning_phase = "learning_limited";
        } else {
          learning_phase = "active"; // Exited learning successfully
        }
      } else if (adset.effective_status === "LEARNING_LIMITED") {
        learning_phase = "learning_limited";
      } else {
        learning_phase = "learning";
      }

      return {
        adset_id: adset.id,
        adset_name: adset.name,
        campaign_id: adset.campaign_id,
        effective_status: adset.effective_status,
        learning_phase,
        daily_budget: adset.daily_budget ? parseFloat(adset.daily_budget) / 100 : null,
      };
    });

    return NextResponse.json({ adsets });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/app/api/meta-ads/learning-phase/route.ts
git commit -m "feat: add learning phase API route (fetches ad set status from Meta)"
```

---

## Task 5: Meta Ads Dashboard Page + Client Component

**Files:**
- Create: `src/app/meta-ads/page.tsx`
- Create: `src/app/meta-ads/MetaAdsDashboardClient.tsx`

This is the main UI — KPI cards, campaign table with learning phase badges and action buttons, creative breakdown tabs.

**Step 1: Create the server page wrapper**

`src/app/meta-ads/page.tsx`:

```typescript
import MetaAdsDashboardClient from "./MetaAdsDashboardClient";

export default function MetaAdsPage() {
  return (
    <div className="p-8">
      <MetaAdsDashboardClient />
    </div>
  );
}
```

**Step 2: Create the client component**

`src/app/meta-ads/MetaAdsDashboardClient.tsx` — This is a large component. Structure:

**A. Types** — Define dashboard data shape matching API response.

**B. State** — `data`, `loading`, `error`, `period` (7/14/30), `country` (all/SE/NO/DK), `learningPhase` map, `sortField`, `sortDir`, `activeBreakdownTab` (headlines/copy/images), `minSpend` filter, `actionState`.

**C. Data fetching** — On mount + period/country change, fetch `/api/meta-ads/dashboard?days={}&country={}` and `/api/meta-ads/learning-phase`.

**D. KPI Cards row** — Reuse `KpiCard` from `@/components/pulse/KpiCard`. 5 cards in a grid: Spend, Revenue, ROAS, CPA, Purchases.

**E. Campaign Table** — Sortable table with columns: Name, Learning Phase badge, Spend, Impressions, Clicks, CTR, CPC, Purchases, Revenue, ROAS, CPA, Frequency. Per-row actions: Pause/Resume button (calls `/api/morning-brief/actions` with `pause_ad` action), Scale +20% button (calls `scale_winner` action), external link to Meta.

**F. Creative Breakdown** — Three tabs (Headlines/Copy/Images). Each shows cards in a grid with text + metrics. Filter by min spend. Sort by ROAS desc.

**G. Action handlers** — Reuse existing `/api/morning-brief/actions` endpoint for pause/scale actions.

The full component code (~600 lines) should follow the patterns used in `MorningBriefClient.tsx` for state management, action handling, and Tailwind styling. Key patterns to match:
- `formatCurrency()` helper for kr formatting
- `formatRoas()` helper for ROAS display
- Action state tracking with `{ loading: string | null; results: Record<string, { ok: boolean; message: string }> }`
- Color-coded ROAS: red `< 1`, amber `1-2`, green `>= 2`
- Loading skeleton with `animate-pulse` divs
- Error state with retry button

For the learning phase badges, use:
```tsx
function LearningBadge({ phase }: { phase: string }) {
  if (phase === "active") return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">● Active</span>;
  if (phase === "learning") return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">● Learning</span>;
  if (phase === "learning_limited") return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">● Limited</span>;
  return null;
}
```

For the creative breakdown tabs:
```tsx
const BREAKDOWN_TABS = [
  { id: "headlines" as const, label: "Headlines" },
  { id: "copies" as const, label: "Copy" },
  { id: "images" as const, label: "Images" },
];
```

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Test locally**

Run dev server, navigate to `/meta-ads`, verify:
- KPI cards load with data
- Campaign table is sortable
- Pause/Scale buttons work (test with a single ad)
- Creative breakdown tabs show grouped data
- Learning phase badges appear

**Step 5: Commit**

```bash
git add src/app/meta-ads/
git commit -m "feat: Meta Ads dashboard — KPIs, campaign table, creative breakdown, learning phase"
```

---

## Task 6: Transform Morning Brief → Daily Actions

**Files:**
- Modify: `src/app/api/morning-brief/route.ts` (add action card generation)
- Rewrite: `src/app/morning-brief/MorningBriefClient.tsx`

This is the biggest UI change. The existing API route already computes all the signals — we add a new section that synthesizes them into action cards. The client component gets restructured: actions first, data second (collapsible).

**Step 1: Add action card generation to the API route**

At the end of the GET handler in `src/app/api/morning-brief/route.ts` (before the `return NextResponse.json(...)`), add logic to synthesize signals into action cards:

```typescript
// ── Synthesize AI Action Cards ──
interface ActionCard {
  id: string;
  type: "pause" | "scale" | "refresh" | "budget" | "landing_page" | "learning_limited";
  category: string; // "Budget" | "Creative" | "Audience"
  title: string;
  why: string;
  expected_impact: string;
  action_data: any; // Data needed to execute the action
  priority: number; // 1 = highest
}

const actionCards: ActionCard[] = [];

// From bleeders → pause actions
for (const b of bleeders) {
  actionCards.push({
    id: `pause-${b.ad_id}`,
    type: "pause",
    category: "Budget",
    title: `Pause ${b.ad_name || b.adset_name || "underperformer"}`,
    why: `Spent ${b.total_spend.toFixed(0)} kr over ${b.days_bleeding} days with ${b.avg_ctr.toFixed(2)}% CTR — CPA is ${b.avg_cpa.toFixed(0)} kr vs campaign avg of ${b.campaign_avg_cpa.toFixed(0)} kr.`,
    expected_impact: `Save ~${(b.total_spend / b.days_bleeding).toFixed(0)} kr/day, improve campaign ROAS`,
    action_data: { action: "pause_ad", ad_id: b.ad_id, ad_name: b.ad_name, reason: "bleeder" },
    priority: 1,
  });
}

// From consistent winners → scale actions
for (const w of enrichedWinners) {
  actionCards.push({
    id: `scale-${w.ad_id}`,
    type: "scale",
    category: "Budget",
    title: `Scale ${w.ad_name || w.adset_name || "winner"} +20%`,
    why: `Consistent winner for ${w.consistent_days} days — ${w.avg_roas.toFixed(1)}x ROAS, ${w.avg_cpa.toFixed(0)} kr CPA, ${w.avg_ctr.toFixed(2)}% CTR.`,
    expected_impact: `~20% more purchases at similar CPA`,
    action_data: { action: "scale_winner", ad_id: w.ad_id, adset_id: w.adset_id, campaign_id: w.campaign_id },
    priority: 2,
  });
}

// From critical fatigue → creative refresh actions
for (const f of fatigueSignals.critical) {
  actionCards.push({
    id: `refresh-${f.ad_id}`,
    type: "refresh",
    category: "Creative",
    title: `Creative refresh needed: ${f.ad_name || "ad"}`,
    why: f.detail,
    expected_impact: `Restore CTR and reduce CPC by refreshing creative`,
    action_data: { ad_id: f.ad_id },
    priority: 3,
  });
}

// From efficiency scoring → budget rebalance action (single card if big shifts exist)
const bigShifts = efficiencyWithRecommendation.filter((e: any) =>
  Math.abs(e.recommended_budget_share - e.current_budget_share) > 0.05
);
if (bigShifts.length > 0) {
  const increases = bigShifts.filter((e: any) => e.recommendation === "increase");
  const decreases = bigShifts.filter((e: any) => e.recommendation === "decrease");
  actionCards.push({
    id: "budget-rebalance",
    type: "budget",
    category: "Budget",
    title: "Rebalance campaign budgets",
    why: `${increases.length} campaign(s) deserve more budget, ${decreases.length} should be reduced based on efficiency scoring.`,
    expected_impact: "Better ROAS by shifting spend to efficient campaigns",
    action_data: { action: "apply_budget_shifts", shifts: efficiencyWithRecommendation },
    priority: 4,
  });
}

// From LP vs creative fatigue → landing page actions
for (const lp of lpFatigueSignals.filter((l: any) => l.diagnosis === "landing_page")) {
  actionCards.push({
    id: `lp-${lp.ad_id}`,
    type: "landing_page",
    category: "Creative",
    title: `Landing page issue: ${lp.ad_name || "ad"}`,
    why: lp.detail,
    expected_impact: "Improve CPA by updating or swapping landing page",
    action_data: { ad_id: lp.ad_id },
    priority: 3,
  });
}

// Sort by priority
actionCards.sort((a, b) => a.priority - b.priority);
```

Then add `action_cards: actionCards` to the JSON response object.

**Step 2: Rewrite the MorningBriefClient component**

The new layout structure:

```
1. Header — "Good morning" + date + refresh button
2. Compact KPI strip — single row: Spend | ROAS | Purchases | Active ads
3. Action Cards section — grid of cards, each with title/why/impact/Apply+Dismiss
4. Collapsible sections:
   - Campaign Trends (collapsed by default)
   - Winners & Losers (collapsed by default)
   - Recent Actions (collapsed by default)
```

Key changes from current component:
- Remove the big KPI cards section → replace with compact inline strip
- Remove standalone Bleeders section → folded into action cards
- Remove standalone Winners section → folded into action cards
- Remove standalone Fatigue section → folded into action cards
- Remove Efficiency Scoring table → folded into action cards
- Remove LP vs Creative section → folded into action cards
- Add new `ActionCard` component rendering each action with Apply/Dismiss
- Keep the `actionState` pattern for tracking in-flight actions
- Add `dismissed` state (local, stored in `Set<string>`) to hide dismissed cards
- Wrap remaining detail sections in collapsible `<details>` elements

For each action card type, the Apply button calls the appropriate existing action:
- `pause` → POST `/api/morning-brief/actions` with `{ action: "pause_ad", ...action_data }`
- `scale` → POST `/api/morning-brief/actions` with `{ action: "scale_winner", ...action_data }`
- `budget` → POST `/api/morning-brief/actions` with `{ action: "apply_budget_shifts", ...action_data }`
- `refresh` → Link to brainstorm page (no API call, just navigation)
- `landing_page` → Link to pages list (no API call, just navigation)

Action card component pattern:
```tsx
function ActionCard({ card, onApply, onDismiss, actionState }: {
  card: ActionCardType;
  onApply: (card: ActionCardType) => void;
  onDismiss: (id: string) => void;
  actionState: { loading: string | null; results: Record<string, { ok: boolean; message: string }> };
}) {
  const isLoading = actionState.loading === card.id;
  const result = actionState.results[card.id];
  const categoryColors: Record<string, string> = {
    Budget: "bg-blue-50 text-blue-700",
    Creative: "bg-purple-50 text-purple-700",
    Audience: "bg-orange-50 text-orange-700",
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", categoryColors[card.category] || "bg-gray-50 text-gray-700")}>
          {card.category}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{card.title}</h3>
      <p className="text-sm text-gray-600 mb-2">{card.why}</p>
      <p className="text-xs text-gray-400 mb-4">Expected impact: {card.expected_impact}</p>
      {result ? (
        <div className={cn("text-sm px-3 py-2 rounded-md", result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
          {result.message}
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => onApply(card)} disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50">
            {isLoading ? "Applying..." : "Apply"}
          </button>
          <button onClick={() => onDismiss(card.id)}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Test locally**

Navigate to `/morning-brief`, verify:
- Compact KPI strip shows at top
- Action cards render with correct data from signals
- Apply buttons execute actions successfully
- Dismiss hides cards
- Collapsible sections expand/collapse
- "No actions" empty state shows when everything is healthy

**Step 5: Commit**

```bash
git add src/app/morning-brief/ src/app/api/morning-brief/route.ts
git commit -m "feat: transform Morning Brief into Daily Actions — action cards first, data second"
```

---

## Task 7: Meta Ads MCP Setup

**Files:**
- Create or modify: `.claude/mcp_servers.json` (or equivalent Claude Code MCP config)

**Step 1: Install the MCP server**

Follow setup from https://github.com/pipeboard-co/meta-ads-mcp — the remote option (no local install needed):

Add to Claude Code MCP config:
```json
{
  "meta-ads": {
    "type": "url",
    "url": "https://mcp.pipeboard.co/meta-ads-mcp"
  }
}
```

Or for local install:
```bash
pip install meta-ads-mcp
```

**Step 2: Authenticate with Meta**

Use the existing `META_SYSTEM_USER_TOKEN` to authenticate. The MCP server will use this to query Meta's API.

**Step 3: Verify connection**

Test with a simple query: "List my Meta ad campaigns" — should return campaign data.

**Step 4: No commit needed** (this is local tooling config, not project code)

---

## Task 8: Final Polish + Build Verification

**Files:**
- Various cleanup

**Step 1: Verify all routes work**

- `/` (Business Pulse) — should still work
- `/meta-ads` — new dashboard with data
- `/morning-brief` — new Daily Actions layout
- `/performance` — should 404 (deleted)

**Step 2: Verify sidebar**

- "Meta Ads" appears where "Performance" was
- "Daily Actions" appears where "Morning Brief" was
- Both highlight correctly when active

**Step 3: Full build check**

Run: `npm run build`

Fix any TypeScript errors or unused imports.

**Step 4: Final commit**

```bash
git commit -m "chore: final polish — cleanup unused imports and verify build"
```

---

## Execution Order Summary

| Task | Description | Depends On | Effort |
|------|-------------|------------|--------|
| 1 | Sidebar nav update | — | Small |
| 2 | Delete Performance page | — | Small |
| 3 | Dashboard API route | — | Medium |
| 4 | Learning phase API | — | Small |
| 5 | Dashboard page + UI | 3, 4 | Large |
| 6 | Daily Actions transformation | — | Large |
| 7 | MCP setup | — | Small |
| 8 | Final polish | All | Small |

Tasks 1-4 and 6 can be parallelized. Task 5 depends on 3+4. Task 8 is last.
