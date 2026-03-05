# Ad Diagnostics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structural performance classification to the morning brief — detect steady-state mismatches (high CTR + bad conversion = landing page problem, low CTR = creative problem) alongside the existing trend-based fatigue detection.

**Architecture:** New Q10 section in the morning brief API route computes dynamic percentile CTR thresholds from qualifying ads, classifies each ad into a diagnostic bucket, and generates action cards. Results appear in the API response, UI, and Telegram brief.

**Tech Stack:** Next.js API route (TypeScript), existing Supabase `meta_ad_performance` + `pipeline_settings` tables, existing MorningBriefClient React component, existing Telegram brief formatter.

---

### Task 1: Add Percentile Helper + Diagnostic Classification Logic to Morning Brief API

**Files:**
- Modify: `src/app/api/morning-brief/route.ts` (after line ~576, before Q9 Efficiency Scoring)

**Step 1: Add percentile helper function**

Add this helper at the bottom of the file alongside the other helpers (after `isConsecutivelyRising`):

```typescript
/** Compute the Nth percentile of a sorted array of numbers */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}
```

**Step 2: Add Q10 diagnostic classification block**

Insert after the Q8 LP vs Creative Fatigue block (after line ~576) and before Q9 Efficiency Scoring. This block:
1. Aggregates 7-day metrics per ad (total spend, impressions, weighted CTR, purchases, CPA)
2. Filters to qualifying ads (min $10 spend, min 500 impressions)
3. Computes 75th/25th percentile CTR thresholds (fallback to 1.5%/0.8% if <8 ads)
4. Looks up target_cpa per ad via adset→product/market mapping (reuse existing `adsetProductMarket` map + `targetCpaMap`)
5. Classifies each ad into a bucket

```typescript
// ── Q10: Ad Diagnostics — Structural Performance Classification ──
// Detects steady-state mismatches (not just deterioration over time):
// High CTR + bad conversion = landing page problem
// Low CTR = hook/creative problem
interface AdDiagnostic {
  ad_id: string;
  ad_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  bucket: "landing_page_problem" | "creative_problem" | "everything_problem" | "winner";
  ctr_7d: number;
  cpa_7d: number | null; // null if zero purchases
  spend_7d: number;
  purchases_7d: number;
  impressions_7d: number;
  ctr_threshold_high: number;
  ctr_threshold_low: number;
  target_cpa: number | null;
}

const adDiagnostics: AdDiagnostic[] = [];

// Aggregate 7-day metrics per ad
const adAgg = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number; ad_name: string | null; adset_id: string | null; adset_name: string | null; campaign_name: string | null }>();
for (const r of currentRows) {
  const existing = adAgg.get(r.meta_ad_id);
  if (existing) {
    existing.spend += Number(r.spend);
    existing.impressions += Number(r.impressions);
    existing.clicks += Number(r.clicks);
    existing.purchases += Number(r.purchases);
  } else {
    adAgg.set(r.meta_ad_id, {
      spend: Number(r.spend),
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      purchases: Number(r.purchases),
      ad_name: r.ad_name,
      adset_id: r.adset_id,
      adset_name: r.adset_name,
      campaign_name: r.campaign_name,
    });
  }
}

// Filter qualifying ads and compute CTR
const qualifyingAds: Array<{ ad_id: string; ctr: number; cpa: number | null; spend: number; impressions: number; purchases: number; ad_name: string | null; adset_id: string | null; adset_name: string | null; campaign_name: string | null }> = [];
for (const [adId, agg] of adAgg) {
  if (agg.spend < 10 || agg.impressions < 500) continue;
  // Need at least 3 days of data to be meaningful
  const dayCount = currentRows.filter((r) => r.meta_ad_id === adId).length;
  if (dayCount < 3) continue;
  const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
  const cpa = agg.purchases > 0 ? agg.spend / agg.purchases : null;
  qualifyingAds.push({ ad_id: adId, ctr, cpa, spend: agg.spend, impressions: agg.impressions, purchases: agg.purchases, ...agg });
}

// Compute percentile thresholds (or fall back to fixed)
const sortedCtrs = qualifyingAds.map((a) => a.ctr).sort((a, b) => a - b);
const useDynamic = sortedCtrs.length >= 8;
const ctrHigh = useDynamic ? percentile(sortedCtrs, 75) : 1.5;
const ctrLow = useDynamic ? percentile(sortedCtrs, 25) : 0.8;

// Classify each ad
for (const ad of qualifyingAds) {
  const pm = ad.adset_id ? adsetProductMarket.get(ad.adset_id) : null;
  const cpaKey = pm ? `${pm.product}:${pm.market}` : null;
  const adTargetCpa = cpaKey ? (targetCpaMap.get(cpaKey) ?? null) : null;

  // Skip if no target_cpa configured — can't judge conversion quality
  if (adTargetCpa === null) continue;

  const isHighCtr = ad.ctr >= ctrHigh;
  const isLowCtr = ad.ctr <= ctrLow;
  const isBadConversion = ad.cpa === null || ad.cpa > adTargetCpa;
  const isGoodConversion = ad.cpa !== null && ad.cpa <= adTargetCpa;

  let bucket: AdDiagnostic["bucket"];
  if (isHighCtr && isBadConversion) {
    bucket = "landing_page_problem";
  } else if (isLowCtr) {
    bucket = "creative_problem";
  } else if (isHighCtr && isGoodConversion) {
    bucket = "winner"; // already caught by existing winner detection
  } else if (!isHighCtr && !isLowCtr && isBadConversion) {
    bucket = "everything_problem";
  } else {
    continue; // mid CTR + good conversion — nothing to flag
  }

  adDiagnostics.push({
    ad_id: ad.ad_id,
    ad_name: ad.ad_name,
    adset_id: ad.adset_id,
    adset_name: ad.adset_name,
    campaign_name: ad.campaign_name,
    bucket,
    ctr_7d: round(ad.ctr, 2),
    cpa_7d: ad.cpa !== null ? round(ad.cpa, 0) : null,
    spend_7d: round(ad.spend, 0),
    purchases_7d: ad.purchases,
    impressions_7d: ad.impressions,
    ctr_threshold_high: round(ctrHigh, 2),
    ctr_threshold_low: round(ctrLow, 2),
    target_cpa: adTargetCpa,
  });
}
```

**Step 3: Generate action cards from diagnostics**

Insert after the existing "LP vs creative fatigue → landing_page cards" block (after line ~1078) and before the "Budget rebalance" block:

```typescript
// ── Ad diagnostics → action cards ──
for (const diag of adDiagnostics) {
  if (diag.bucket === "winner") continue; // already handled by existing winner detection

  const enrichment = diag.adset_id ? adsetEnrichment.get(diag.adset_id) : null;
  const adLabel = enrichment?.concept_name || diag.ad_name || "unnamed ad";
  const market = diag.adset_id ? adsetProductMarket.get(diag.adset_id)?.market : null;

  if (diag.bucket === "landing_page_problem") {
    // Don't duplicate if Q8 already flagged this ad as landing_page
    const alreadyFlagged = actionCards.some((c) => c.type === "landing_page" && c.action_data.ad_id === diag.ad_id);
    if (alreadyFlagged) continue;

    actionCards.push({
      id: `diag_lp_${diag.ad_id}`,
      type: "landing_page",
      category: "Creative",
      title: `LP problem: "${adLabel}" — ${diag.ctr_7d}% CTR but ${diag.cpa_7d !== null ? diag.cpa_7d + " kr" : "0"} CPA`,
      why: `This ad has above-average CTR (${diag.ctr_7d}% — top 25% of your ads) but ${diag.cpa_7d !== null ? "CPA is " + diag.cpa_7d + " kr (target: " + diag.target_cpa + " kr)" : "zero purchases"} over 7 days with ${diag.spend_7d} kr spent. People click but don't buy — the landing page isn't converting.`,
      guidance: "The ad creative is doing its job — it gets attention and clicks. The problem is what happens after the click. Try a different landing page, or review the current one for offer mismatch, slow load time, or weak CTA.",
      expected_impact: "Lower CPA by improving post-click conversion",
      action_data: { ad_id: diag.ad_id, diagnosis: "structural_lp_problem" },
      priority: 2,
      ad_name: diag.ad_name,
      adset_id: diag.adset_id,
      adset_name: diag.adset_name,
      campaign_name: diag.campaign_name,
      image_job_id: enrichment?.image_job_id ?? null,
      concept_name: enrichment?.concept_name ?? null,
    });
  } else if (diag.bucket === "creative_problem") {
    actionCards.push({
      id: `diag_creative_${diag.ad_id}`,
      type: "refresh",
      category: "Creative",
      title: `Weak hook: "${adLabel}" — only ${diag.ctr_7d}% CTR${market ? ` in ${market}` : ""}`,
      why: `CTR is ${diag.ctr_7d}% — in the bottom 25% of your ads (threshold: ${diag.ctr_threshold_low}%). ${diag.spend_7d} kr spent over 7 days. The hook isn't stopping the scroll.`,
      guidance: "The landing page might be fine — the problem is the ad creative. People aren't clicking. Try a different hook, image style, or opening line. Consider a completely different angle for this product.",
      expected_impact: "Higher CTR → more traffic to a potentially working page",
      action_data: { ad_id: diag.ad_id, image_job_id: enrichment?.image_job_id, diagnosis: "structural_creative_problem" },
      priority: 3,
      ad_name: diag.ad_name,
      adset_id: diag.adset_id,
      adset_name: diag.adset_name,
      campaign_name: diag.campaign_name,
      image_job_id: enrichment?.image_job_id ?? null,
      concept_name: enrichment?.concept_name ?? null,
    });
  }
  // "everything_problem" — no separate action card; these are caught by bleeders
}
```

**Step 4: Add diagnostics to the API response**

In the `return NextResponse.json({ ... })` block, add `ad_diagnostics` to the `signals` object:

```typescript
signals: {
  bleeders,
  consistent_winners: enrichedWinners,
  lp_vs_creative_fatigue: lpFatigueSignals,
  efficiency_scoring: efficiencyWithRecommendation,
  ad_diagnostics: adDiagnostics,
},
```

**Step 5: Commit**

```bash
git add src/app/api/morning-brief/route.ts
git commit -m "feat: add structural ad diagnostics to morning brief API

Classifies ads into buckets (LP problem, creative problem) using
dynamic percentile CTR thresholds and target CPA from pipeline settings.
Generates action cards for LP swaps and creative refreshes."
```

---

### Task 2: Add Diagnostics Section to Morning Brief UI

**Files:**
- Modify: `src/app/morning-brief/MorningBriefClient.tsx`

**Step 1: Add the AdDiagnostic type**

Add after the existing `LpVsCreativeFatigue` interface (~line 139):

```typescript
interface AdDiagnostic {
  ad_id: string;
  ad_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  bucket: "landing_page_problem" | "creative_problem" | "everything_problem" | "winner";
  ctr_7d: number;
  cpa_7d: number | null;
  spend_7d: number;
  purchases_7d: number;
  impressions_7d: number;
  ctr_threshold_high: number;
  ctr_threshold_low: number;
  target_cpa: number | null;
}
```

**Step 2: Add `ad_diagnostics` to the MorningBriefData interface**

In the `signals` property of `MorningBriefData` (~line 267-272), add:

```typescript
ad_diagnostics: AdDiagnostic[];
```

**Step 3: Add the diagnostics UI section**

Find where the existing LP vs Creative Fatigue section is rendered and add a new section after it. The section should:
- Show a summary line: "X ads diagnosed: Y landing page problems, Z creative problems"
- Show a table/card list with color-coded rows:
  - Purple border for LP problems (matches existing `landing_page` card color)
  - Amber border for creative problems (matches existing `refresh` card color)
  - Gray for everything problems
- Each row shows: ad name, CTR (with badge showing if above/below threshold), CPA vs target, spend, diagnosis
- Show the dynamic thresholds: "High CTR: >{threshold}% (75th percentile) | Low CTR: <{threshold}% (25th percentile)"

Render inside the signals section of the brief. Use the existing pattern of collapsible sections with `ChevronDown`:

```tsx
{/* Ad Diagnostics */}
{data.signals.ad_diagnostics && data.signals.ad_diagnostics.length > 0 && (
  <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
    <button
      onClick={() => setExpandedSections((s) => ({ ...s, diagnostics: !s.diagnostics }))}
      className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100">
          <AlertCircle className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="text-left">
          <h3 className="font-semibold text-gray-900">Ad Diagnostics</h3>
          <p className="text-sm text-gray-500">
            {data.signals.ad_diagnostics.filter((d) => d.bucket === "landing_page_problem").length} LP problems,{" "}
            {data.signals.ad_diagnostics.filter((d) => d.bucket === "creative_problem").length} creative problems
          </p>
        </div>
      </div>
      <ChevronDown className={cn("w-5 h-5 text-gray-400 transition-transform", expandedSections.diagnostics && "rotate-180")} />
    </button>
    {expandedSections.diagnostics && (
      <div className="px-4 pb-4 space-y-3">
        <p className="text-xs text-gray-400">
          High CTR: &ge;{data.signals.ad_diagnostics[0]?.ctr_threshold_high}% (75th pctl) | Low CTR: &le;{data.signals.ad_diagnostics[0]?.ctr_threshold_low}% (25th pctl)
        </p>
        {data.signals.ad_diagnostics
          .filter((d) => d.bucket !== "winner")
          .map((d) => {
            const borderColor =
              d.bucket === "landing_page_problem" ? "border-l-purple-400" :
              d.bucket === "creative_problem" ? "border-l-amber-400" : "border-l-gray-300";
            const label =
              d.bucket === "landing_page_problem" ? "LP Problem" :
              d.bucket === "creative_problem" ? "Weak Hook" : "Needs Rethink";
            const labelColor =
              d.bucket === "landing_page_problem" ? "bg-purple-50 text-purple-700" :
              d.bucket === "creative_problem" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600";
            return (
              <div key={d.ad_id} className={cn("border-l-4 rounded-lg bg-gray-50 p-3", borderColor)}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-gray-900 truncate">{d.ad_name || "Unnamed ad"}</span>
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", labelColor)}>{label}</span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>CTR: <strong className={d.bucket === "landing_page_problem" ? "text-green-600" : d.bucket === "creative_problem" ? "text-red-600" : "text-gray-700"}>{d.ctr_7d}%</strong></span>
                  <span>CPA: <strong className={d.cpa_7d !== null && d.target_cpa !== null && d.cpa_7d > d.target_cpa ? "text-red-600" : "text-gray-700"}>{d.cpa_7d !== null ? `${d.cpa_7d} kr` : "no sales"}</strong>{d.target_cpa ? ` / ${d.target_cpa} kr target` : ""}</span>
                  <span>Spend: {d.spend_7d} kr</span>
                  <span>{d.purchases_7d} purchases</span>
                </div>
              </div>
            );
          })}
      </div>
    )}
  </section>
)}
```

Note: You'll need to add `diagnostics` to the `expandedSections` state object (find where it's initialized and add `diagnostics: true`).

**Step 4: Commit**

```bash
git add src/app/morning-brief/MorningBriefClient.tsx
git commit -m "feat: add ad diagnostics section to morning brief UI

Shows structural performance classification with color-coded cards
for LP problems (purple) and creative problems (amber)."
```

---

### Task 3: Add Diagnostics to Telegram Brief

**Files:**
- Modify: `src/app/api/cron/morning-brief-telegram/route.ts`

**Step 1: Add diagnostics summary to Telegram message**

Find the `formatBrief` function. After the existing "FATIGUE DIAGNOSIS" section (~line 101-107), add a new section:

```typescript
// Ad diagnostics (structural)
const diagnostics = data.signals.ad_diagnostics;
if (diagnostics && diagnostics.length > 0) {
  const lpProblems = diagnostics.filter((d) => d.bucket === "landing_page_problem");
  const creativeProblems = diagnostics.filter((d) => d.bucket === "creative_problem");

  if (lpProblems.length > 0) {
    lines.push("");
    lines.push("🟣 LANDING PAGE PROBLEMS");
    lines.push(`  High CTR but bad conversion — swap the page, not the ad`);
    for (const d of lpProblems) {
      lines.push(`  • ${d.ad_name || "Unnamed"}: ${d.ctr_7d}% CTR, ${d.cpa_7d !== null ? d.cpa_7d + " kr CPA" : "0 sales"} (target: ${d.target_cpa} kr)`);
    }
  }

  if (creativeProblems.length > 0) {
    lines.push("");
    lines.push("🎨 WEAK HOOKS");
    lines.push(`  Low CTR — need better creative`);
    for (const d of creativeProblems) {
      lines.push(`  • ${d.ad_name || "Unnamed"}: ${d.ctr_7d}% CTR (bottom 25%), ${d.spend_7d} kr spent`);
    }
  }
}
```

**Step 2: Update the BriefResponse type in the Telegram route**

The Telegram route has its own `BriefResponse` interface. Add `ad_diagnostics` to the `signals` property:

```typescript
ad_diagnostics?: Array<{
  ad_name: string | null;
  bucket: string;
  ctr_7d: number;
  cpa_7d: number | null;
  spend_7d: number;
  purchases_7d: number;
  target_cpa: number | null;
}>;
```

**Step 3: Commit**

```bash
git add src/app/api/cron/morning-brief-telegram/route.ts
git commit -m "feat: add ad diagnostics to Telegram morning brief

LP problems highlighted with purple emoji, creative problems with palette.
Focuses on actionable insight: swap the page, not the ad."
```

---

### Task 4: Manual Verification

**Step 1: Start dev server and open morning brief**

```bash
npm run dev
```

Open `http://localhost:3000/morning-brief` and verify:
- The API returns `signals.ad_diagnostics` array
- The diagnostics section renders in the UI
- Action cards appear for LP problems and creative problems
- No duplicate cards between Q8 (trend) and Q10 (structural) for the same ad

**Step 2: Check Telegram formatting**

Inspect the API response at `/api/morning-brief` directly (with auth header) and verify the diagnostics data is present.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish ad diagnostics after manual testing"
```
