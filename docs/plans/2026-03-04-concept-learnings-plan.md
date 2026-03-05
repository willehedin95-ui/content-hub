# Concept Learnings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-generate structured learning records when concepts are killed or promoted, surface patterns in a Learnings page, and inject learnings into brainstorm prompts so the AI avoids repeating failures.

**Architecture:** New `concept_learnings` table stores denormalized CASH DNA + metrics + AI-generated takeaway per concept outcome. `generateConceptLearning()` replaces `generateKillHypothesis()` in pipeline.ts. `buildLearningsContext()` in brainstorm.ts aggregates learnings into prompt context. New `/learnings` page with filterable cards + pattern summary.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres), Anthropic Claude Haiku 4.5, Tailwind CSS, Lucide icons, sonner toasts.

---

### Task 1: Database Migration — Create `concept_learnings` Table

**Files:**
- Create: `supabase/migrations/20260304_concept_learnings.sql`

**Step 1: Write the migration SQL file**

```sql
-- Concept Learnings: structured learning records from ad testing outcomes
CREATE TABLE concept_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_job_market_id UUID REFERENCES image_job_markets(id) ON DELETE SET NULL,
  image_job_id UUID REFERENCES image_jobs(id) ON DELETE SET NULL,
  product TEXT NOT NULL,
  market TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('winner', 'loser')),
  angle TEXT,
  awareness_level TEXT,
  style TEXT,
  concept_type TEXT,
  days_tested INTEGER,
  total_spend NUMERIC,
  impressions INTEGER,
  clicks INTEGER,
  ctr NUMERIC,
  conversions INTEGER,
  cpa NUMERIC,
  roas NUMERIC,
  hypothesis_tested TEXT,
  takeaway TEXT,
  tags TEXT[] DEFAULT '{}',
  signal TEXT,
  concept_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_concept_learnings_product ON concept_learnings(product);
CREATE INDEX idx_concept_learnings_market ON concept_learnings(product, market);
CREATE INDEX idx_concept_learnings_outcome ON concept_learnings(outcome);
CREATE INDEX idx_concept_learnings_angle ON concept_learnings(angle);
```

**Step 2: Run the migration via Supabase Management API**

Run:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "<the SQL above>"}'
```

Expected: Table created, no errors.

**Step 3: Verify the table exists**

Run:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''concept_learnings'\'' ORDER BY ordinal_position;"}'
```

Expected: All columns listed.

**Step 4: Commit**

```bash
git add supabase/migrations/20260304_concept_learnings.sql
git commit -m "feat: add concept_learnings table for creative testing feedback loop"
```

---

### Task 2: Replace `generateKillHypothesis()` with `generateConceptLearning()`

**Files:**
- Modify: `src/lib/pipeline.ts:1231-1286` (replace `generateKillHypothesis`)

**Step 1: Replace the function**

Find the existing `generateKillHypothesis` function at line 1233 and replace it entirely with `generateConceptLearning()`. The new function:

- Accepts all the same params as before PLUS `cashDna`, `outcome`, and `originalHypothesis`
- Returns `{ hypothesis, takeaway, tags }` instead of just a string
- Uses a richer prompt that analyzes the CASH DNA variables

```typescript
// ── AI learning generation for concept outcomes ────────────────

interface ConceptLearningInput {
  name: string;
  conceptNumber: number | null;
  product: string | null;
  market: string;
  outcome: "winner" | "loser";
  daysTested: number;
  totalSpend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa: number;
  roas: number | null;
  revenue: number;
  targetCpa: number | null;
  targetRoas: number | null;
  currency: string;
  signal: string;
  cashDna: CashDna | null;
  originalHypothesis: string | null;
}

interface ConceptLearningResult {
  hypothesis: string;
  takeaway: string;
  tags: string[];
}

async function generateConceptLearning(
  opts: ConceptLearningInput
): Promise<ConceptLearningResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      hypothesis: "AI analysis unavailable (no API key configured).",
      takeaway: "",
      tags: [],
    };
  }

  const client = new Anthropic({ apiKey });

  const cashDnaSection = opts.cashDna
    ? `
CASH DNA:
- Angle: ${opts.cashDna.angle ?? "unknown"}
- Awareness Level: ${opts.cashDna.awareness_level ?? "unknown"}
- Style: ${opts.cashDna.style ?? "unknown"}
- Concept Type: ${opts.cashDna.concept_type ?? "unknown"}
- Copy Blocks: ${opts.cashDna.copy_blocks?.join(", ") || "none"}`
    : "CASH DNA: Not available";

  const hypothesisSection = opts.originalHypothesis
    ? `Original Hypothesis: "${opts.originalHypothesis}"`
    : "No original hypothesis recorded.";

  const prompt = `You are a performance marketing analyst reviewing ad test results to extract learnings.

Concept: "${opts.name}"${opts.conceptNumber ? ` (#${opts.conceptNumber})` : ""}
Product: ${opts.product || "unknown"}
Market: ${opts.market}
Outcome: ${opts.outcome.toUpperCase()}

${cashDnaSection}

${hypothesisSection}

Performance:
- Days tested: ${opts.daysTested}
- Total spend: ${opts.totalSpend.toFixed(0)} ${opts.currency}
- Impressions: ${opts.impressions.toLocaleString()}
- Clicks: ${opts.clicks.toLocaleString()}
- CTR: ${opts.ctr.toFixed(2)}%
- Conversions: ${opts.conversions}
- CPA: ${opts.conversions > 0 ? `${opts.cpa.toFixed(0)} ${opts.currency}` : "N/A (no conversions)"}${opts.targetCpa ? ` (target: ${opts.targetCpa.toFixed(0)} ${opts.currency})` : ""}
- ROAS: ${opts.roas !== null ? `${opts.roas.toFixed(2)}x` : "N/A"}${opts.targetRoas ? ` (target: ${opts.targetRoas.toFixed(2)}x)` : ""}
- Revenue: ${opts.revenue.toFixed(0)} ${opts.currency}
- Signal: ${opts.signal}

Return a JSON object with exactly these fields:
{
  "hypothesis": "2-3 sentences explaining why this concept ${opts.outcome === "winner" ? "succeeded" : "underperformed"}. Be specific about which CASH DNA variables (angle, awareness level, style) likely contributed to the outcome.",
  "takeaway": "2-3 sentences describing the reusable learning. Frame it as: 'We learned that [variable combination] [does/doesn't] work for [product] in [market] because [reason].' Focus on what to do differently or repeat next time.",
  "tags": ["2-5 lowercase keywords describing the key variables and themes, e.g. 'fear', 'native-style', 'problem-aware', 'sleep-quality', 'no-conversions'"]
}

Return ONLY the JSON, no markdown fences or extra text.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text);
    return {
      hypothesis: parsed.hypothesis ?? "No hypothesis generated.",
      takeaway: parsed.takeaway ?? "",
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch (err) {
    console.error("[Learning] Claude API error:", err);
    return {
      hypothesis: "AI analysis failed to generate.",
      takeaway: "",
      tags: [],
    };
  }
}
```

**Step 2: Verify the code compiles**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No errors related to pipeline.ts.

**Step 3: Commit**

```bash
git add src/lib/pipeline.ts
git commit -m "feat: replace generateKillHypothesis with generateConceptLearning"
```

---

### Task 3: Add `insertConceptLearning()` helper and wire into `killConcept()`

**Files:**
- Modify: `src/lib/pipeline.ts:1290-1407` (update `killConcept` function)

**Step 1: Add the helper function**

Add this right after `generateConceptLearning()`:

```typescript
async function insertConceptLearning(opts: {
  imageJobMarketId: string;
  imageJobId: string;
  product: string;
  market: string;
  outcome: "winner" | "loser";
  cashDna: CashDna | null;
  conceptName: string;
  daysTested: number;
  totalSpend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa: number;
  roas: number | null;
  signal: string;
  hypothesisTested: string | null;
  takeaway: string;
  tags: string[];
}): Promise<void> {
  const db = createServerSupabase();
  await db.from("concept_learnings").insert({
    image_job_market_id: opts.imageJobMarketId,
    image_job_id: opts.imageJobId,
    product: opts.product,
    market: opts.market,
    outcome: opts.outcome,
    angle: opts.cashDna?.angle ?? null,
    awareness_level: opts.cashDna?.awareness_level ?? null,
    style: opts.cashDna?.style ?? null,
    concept_type: opts.cashDna?.concept_type ?? null,
    days_tested: opts.daysTested,
    total_spend: opts.totalSpend,
    impressions: opts.impressions,
    clicks: opts.clicks,
    ctr: opts.ctr,
    conversions: opts.conversions,
    cpa: opts.cpa,
    roas: opts.roas,
    hypothesis_tested: opts.hypothesisTested,
    takeaway: opts.takeaway || null,
    tags: opts.tags,
    signal: opts.signal,
    concept_name: opts.conceptName,
  });
}
```

**Step 2: Update `killConcept()` to fetch `cash_dna` and insert learning**

In the `killConcept()` function (line ~1329), change the image_jobs select to also fetch `cash_dna` and `hypothesis` (from `pipeline_concepts`):

Change:
```typescript
    const { data: jobInfo } = await db
      .from("image_jobs")
      .select("name, product, concept_number")
      .eq("id", market.image_job_id)
      .single();
```

To:
```typescript
    const { data: jobInfo } = await db
      .from("image_jobs")
      .select("name, product, concept_number, cash_dna, pipeline_concept_id")
      .eq("id", market.image_job_id)
      .single();

    // Fetch original hypothesis from pipeline_concepts if available
    let originalHypothesis: string | null = null;
    if (jobInfo?.pipeline_concept_id) {
      const { data: pipelineConcept } = await db
        .from("pipeline_concepts")
        .select("hypothesis")
        .eq("id", jobInfo.pipeline_concept_id)
        .single();
      originalHypothesis = pipelineConcept?.hypothesis ?? null;
    }
```

Then replace the `generateKillHypothesis` call (line ~1368) with `generateConceptLearning`:

```typescript
    const learningResult = await generateConceptLearning({
      name: jobInfo?.name ?? "Unknown",
      conceptNumber: jobInfo?.concept_number ?? null,
      product: jobInfo?.product ?? null,
      market: market.market,
      outcome: "loser",
      daysTested: daysBetween(market.created_at, now),
      totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr,
      conversions: totalConversions,
      cpa,
      roas,
      revenue: totalRevenue,
      targetCpa,
      targetRoas,
      currency,
      signal: "manual_kill",
      cashDna: (jobInfo?.cash_dna as CashDna | null) ?? null,
      originalHypothesis,
    });

    hypothesis = learningResult.hypothesis;

    // Insert structured learning record
    await insertConceptLearning({
      imageJobMarketId: imageJobMarketId,
      imageJobId: market.image_job_id,
      product: jobInfo?.product ?? "unknown",
      market: market.market,
      outcome: "loser",
      cashDna: (jobInfo?.cash_dna as CashDna | null) ?? null,
      conceptName: jobInfo?.name ?? "Unknown",
      daysTested: daysBetween(market.created_at, now),
      totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr,
      conversions: totalConversions,
      cpa,
      roas,
      signal: "manual_kill",
      hypothesisTested: originalHypothesis,
      takeaway: learningResult.takeaway,
      tags: learningResult.tags,
    });
```

**Step 3: Verify compilation**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No type errors.

**Step 4: Commit**

```bash
git add src/lib/pipeline.ts
git commit -m "feat: insert concept_learnings on manual kill"
```

---

### Task 4: Wire learning generation into `detectStageTransitions()`

**Files:**
- Modify: `src/lib/pipeline.ts:229-405` (the detectStageTransitions function)

**Step 1: Add `cash_dna` and `pipeline_concept_id` to the image_jobs query**

At line ~232, change:
```typescript
    .select("id, product, name, concept_number")
```
To:
```typescript
    .select("id, product, name, concept_number, cash_dna, pipeline_concept_id")
```

Update the `jobInfoMap` type and population to include the new fields:
```typescript
  const jobInfoMap = new Map<string, {
    product: string | null;
    name: string;
    conceptNumber: number | null;
    cashDna: CashDna | null;
    pipelineConceptId: string | null;
  }>();
  for (const j of jobData ?? []) {
    jobInfoMap.set(j.id, {
      product: j.product ?? null,
      name: j.name ?? "Unknown",
      conceptNumber: j.concept_number ?? null,
      cashDna: (j.cash_dna as CashDna | null) ?? null,
      pipelineConceptId: j.pipeline_concept_id ?? null,
    });
  }
```

**Step 2: Batch-fetch original hypotheses from pipeline_concepts**

After the jobInfoMap population, add:
```typescript
  // Fetch original hypotheses from pipeline_concepts
  const pipelineConceptIds = [...jobInfoMap.values()]
    .map((j) => j.pipelineConceptId)
    .filter(Boolean) as string[];
  const hypothesisMap = new Map<string, string>();
  if (pipelineConceptIds.length > 0) {
    const { data: pcData } = await db
      .from("pipeline_concepts")
      .select("id, hypothesis")
      .in("id", pipelineConceptIds);
    for (const pc of pcData ?? []) {
      if (pc.hypothesis) hypothesisMap.set(pc.id, pc.hypothesis);
    }
  }
```

**Step 3: Extend the transition block to generate learnings for both kills and winners**

At line ~350 (the `if (newStage === "killed")` block), replace the entire block with one that handles both killed and active:

```typescript
      // Generate AI learning for terminal outcomes (killed or active)
      let hypothesis: string | null = null;
      if (newStage === "killed" || newStage === "active") {
        try {
          const totalSpend = dailyMetrics.reduce((s, m) => s + m.spend, 0);
          const totalImpressions = dailyMetrics.reduce((s, m) => s + m.impressions, 0);
          const totalClicks = dailyMetrics.reduce((s, m) => s + m.clicks, 0);
          const totalRevenue = dailyMetrics.reduce((s, m) => s + (m.revenue || 0), 0);
          const totalConvs = dailyMetrics.reduce((s, m) => s + m.conversions, 0);

          const settingKey = product ? `${product}:${market.market}` : null;
          const setting = settingKey ? settingsMap.get(settingKey) : null;

          const originalHypothesis = jobInfo.pipelineConceptId
            ? hypothesisMap.get(jobInfo.pipelineConceptId) ?? null
            : null;

          const outcome = newStage === "killed" ? "loser" : "winner";

          const learningResult = await generateConceptLearning({
            name: jobInfo.name,
            conceptNumber: jobInfo.conceptNumber,
            product,
            market: market.market,
            outcome,
            daysTested: daysSincePush,
            totalSpend,
            impressions: totalImpressions,
            clicks: totalClicks,
            ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
            conversions: totalConvs,
            cpa,
            roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
            revenue: totalRevenue,
            targetCpa,
            targetRoas: setting?.target_roas ?? null,
            currency: setting?.currency ?? "SEK",
            signal: signal ?? "auto",
            cashDna: jobInfo.cashDna,
            originalHypothesis,
          });

          hypothesis = learningResult.hypothesis;

          // Insert structured learning record
          await insertConceptLearning({
            imageJobMarketId: marketId,
            imageJobId: market.image_job_id,
            product: product ?? "unknown",
            market: market.market,
            outcome,
            cashDna: jobInfo.cashDna,
            conceptName: jobInfo.name,
            daysTested: daysSincePush,
            totalSpend,
            impressions: totalImpressions,
            clicks: totalClicks,
            ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
            conversions: totalConvs,
            cpa,
            roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
            signal: signal ?? "auto",
            hypothesisTested: originalHypothesis,
            takeaway: learningResult.takeaway,
            tags: learningResult.tags,
          });
        } catch (err) {
          console.error(`[AutoTransition] Learning generation failed for ${marketId}:`, err);
        }
      }
```

**Step 4: Verify compilation**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 5: Commit**

```bash
git add src/lib/pipeline.ts
git commit -m "feat: generate learnings on auto-kill and promotion to active"
```

---

### Task 5: Learnings API Route

**Files:**
- Create: `src/app/api/learnings/route.ts`

**Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const params = req.nextUrl.searchParams;

  const product = params.get("product");
  const market = params.get("market");
  const outcome = params.get("outcome");
  const angle = params.get("angle");
  const awareness = params.get("awareness_level");
  const limit = Number(params.get("limit") ?? "100");

  let query = db
    .from("concept_learnings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (product) query = query.eq("product", product);
  if (market) query = query.eq("market", market);
  if (outcome) query = query.eq("outcome", outcome);
  if (angle) query = query.eq("angle", angle);
  if (awareness) query = query.eq("awareness_level", awareness);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compute pattern summaries
  const learnings = data ?? [];
  const patterns: Record<string, { wins: number; losses: number }> = {};

  for (const l of learnings) {
    if (l.angle) {
      patterns[`angle:${l.angle}`] ??= { wins: 0, losses: 0 };
      patterns[`angle:${l.angle}`][l.outcome === "winner" ? "wins" : "losses"]++;
    }
    if (l.awareness_level) {
      patterns[`awareness:${l.awareness_level}`] ??= { wins: 0, losses: 0 };
      patterns[`awareness:${l.awareness_level}`][l.outcome === "winner" ? "wins" : "losses"]++;
    }
    if (l.style) {
      patterns[`style:${l.style}`] ??= { wins: 0, losses: 0 };
      patterns[`style:${l.style}`][l.outcome === "winner" ? "wins" : "losses"]++;
    }
  }

  return NextResponse.json({ learnings, patterns });
}
```

**Step 2: Verify it compiles**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/app/api/learnings/route.ts
git commit -m "feat: add GET /api/learnings with filters and pattern summary"
```

---

### Task 6: Learnings Page — UI

**Files:**
- Create: `src/app/learnings/page.tsx`

**Step 1: Create the learnings page**

Build a "use client" page following the same pattern as `src/app/hooks/page.tsx`. Components:
- Filter bar at top: Product, Market, Outcome, Angle, Awareness Level dropdowns
- Pattern summary section (only when 5+ learnings) showing win rates by angle/awareness/style as simple stat rows
- Learning cards with: concept name, outcome badge (green/red), product + market, CASH DNA pills, key metrics, takeaway text, tags as chips

Key details:
- Fetch from `/api/learnings` with query params from filters
- Use `BookOpen` icon from lucide-react in the header
- Match the styling of the hooks page (same filter bar pattern, same card styling)
- Empty state: "No learnings yet. Learnings are automatically generated when concepts are killed or promoted."

**Step 2: Verify it compiles and renders**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npm run dev`
Navigate to `http://localhost:3000/learnings`
Expected: Page renders with empty state (no learnings exist yet).

**Step 3: Commit**

```bash
git add src/app/learnings/page.tsx
git commit -m "feat: add /learnings page with filters, patterns, and learning cards"
```

---

### Task 7: Add Learnings to Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:1` (import) and `src/components/layout/Sidebar.tsx:43-52` (nav array)

**Step 1: Add import**

Add `BookOpen` to the lucide-react import at line 6:
```typescript
import { Layers, Settings, Zap, Image, FlaskConical, LogOut, Package, BarChart3, Lightbulb, ChevronDown, Megaphone, Workflow, Activity, Warehouse, Library, BookOpen } from "lucide-react";
```

**Step 2: Add nav item to Ads group**

In the `nav` array (line ~44), add a "Learnings" entry inside the Ads group children array, after Hook Bank:

```typescript
        { href: "/learnings", label: "Learnings", icon: BookOpen },
```

**Step 3: Verify it renders**

Run dev server if not running. Check sidebar shows "Learnings" under Ads group.

**Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: add Learnings nav item to sidebar Ads group"
```

---

### Task 8: Build `buildLearningsContext()` for Brainstorm Injection

**Files:**
- Modify: `src/lib/brainstorm.ts` (add new exported function)

**Step 1: Add `buildLearningsContext()` function**

Add this after the `buildHookInspiration()` function (after line ~476):

```typescript
/**
 * Build learnings context from past concept outcomes for brainstorm prompt injection.
 * Aggregates patterns (win/loss rates by variable) and includes recent takeaways.
 */
export async function buildLearningsContext(product: string): Promise<string> {
  const { createServerSupabase } = await import("@/lib/supabase");
  const db = createServerSupabase();

  const { data: learnings } = await db
    .from("concept_learnings")
    .select("*")
    .eq("product", product)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!learnings || learnings.length === 0) return "";

  const lines: string[] = [
    "\n---\n",
    "## LEARNINGS FROM PAST AD TESTS",
    "Use these learnings to inform your concept generation. Avoid repeating approaches that have consistently failed. Lean into patterns that have worked.\n",
  ];

  // Aggregate patterns by angle
  const angleStats = new Map<string, { wins: number; losses: number; avgRoas: number; roasCount: number }>();
  const awarenessStats = new Map<string, { wins: number; losses: number }>();
  const styleStats = new Map<string, { wins: number; losses: number }>();

  for (const l of learnings) {
    if (l.angle) {
      const s = angleStats.get(l.angle) ?? { wins: 0, losses: 0, avgRoas: 0, roasCount: 0 };
      if (l.outcome === "winner") {
        s.wins++;
        if (l.roas) { s.avgRoas += l.roas; s.roasCount++; }
      } else {
        s.losses++;
      }
      angleStats.set(l.angle, s);
    }
    if (l.awareness_level) {
      const s = awarenessStats.get(l.awareness_level) ?? { wins: 0, losses: 0 };
      l.outcome === "winner" ? s.wins++ : s.losses++;
      awarenessStats.set(l.awareness_level, s);
    }
    if (l.style) {
      const s = styleStats.get(l.style) ?? { wins: 0, losses: 0 };
      l.outcome === "winner" ? s.wins++ : s.losses++;
      styleStats.set(l.style, s);
    }
  }

  // What works (win rate > 50% with 2+ tests)
  const winners: string[] = [];
  for (const [angle, s] of angleStats) {
    const total = s.wins + s.losses;
    if (total >= 2 && s.wins / total > 0.5) {
      const roasStr = s.roasCount > 0 ? ` (avg ROAS ${(s.avgRoas / s.roasCount).toFixed(1)}x)` : "";
      winners.push(`- **${angle}** angle: ${s.wins}/${total} won${roasStr}`);
    }
  }
  for (const [awareness, s] of awarenessStats) {
    const total = s.wins + s.losses;
    if (total >= 2 && s.wins / total > 0.5) {
      winners.push(`- **${awareness}** awareness: ${s.wins}/${total} won`);
    }
  }

  if (winners.length > 0) {
    lines.push("### What Works");
    lines.push(...winners);
    lines.push("");
  }

  // What doesn't work (win rate < 30% with 2+ tests)
  const losers: string[] = [];
  for (const [angle, s] of angleStats) {
    const total = s.wins + s.losses;
    if (total >= 2 && s.wins / total < 0.3) {
      losers.push(`- **${angle}** angle: ${s.wins}/${total} won — avoid or try different execution`);
    }
  }
  for (const [awareness, s] of awarenessStats) {
    const total = s.wins + s.losses;
    if (total >= 2 && s.wins / total < 0.3) {
      losers.push(`- **${awareness}** awareness: ${s.wins}/${total} won`);
    }
  }

  if (losers.length > 0) {
    lines.push("### What Doesn't Work");
    lines.push(...losers);
    lines.push("");
  }

  // Recent takeaways (last 5 with non-empty takeaways)
  const recentWithTakeaways = learnings.filter((l) => l.takeaway).slice(0, 5);
  if (recentWithTakeaways.length > 0) {
    lines.push("### Recent Takeaways");
    for (const l of recentWithTakeaways) {
      const badge = l.outcome === "winner" ? "WON" : "LOST";
      lines.push(`- "${l.concept_name}" (${l.market}, ${badge}): ${l.takeaway}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

**Step 2: Verify compilation**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/brainstorm.ts
git commit -m "feat: add buildLearningsContext() for brainstorm prompt injection"
```

---

### Task 9: Inject Learnings into Brainstorm Prompts

**Files:**
- Modify: `src/lib/brainstorm.ts:482-532` (buildProductContext)
- Modify: `src/lib/brainstorm.ts:859-869` (buildBrainstormSystemPrompt)
- Modify: `src/app/api/brainstorm/route.ts:120-131`
- Modify: `src/app/api/pipeline/generate/route.ts`

**Step 1: Add `learningsContext` parameter to `buildProductContext()`**

Change the function signature at line ~482:
```typescript
function buildProductContext(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string,
  learningsContext?: string
): string {
```

Before the `hookInspiration` insertion (line ~527), add:
```typescript
  if (learningsContext) {
    parts.push(learningsContext);
  }
```

**Step 2: Thread `learningsContext` through all system prompt builders**

Update `buildBrainstormSystemPrompt` signature at line ~859:
```typescript
export function buildBrainstormSystemPrompt(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  mode: BrainstormMode,
  hookInspiration?: string,
  learningsContext?: string
): string {
```

Each builder function in `SYSTEM_BUILDERS` calls `buildProductContext()`. Update each one to pass `learningsContext` through. The builders all follow the same pattern — they call `buildProductContext(product, productBrief, guidelines, segments, hookInspiration)`. Add `learningsContext` as the last arg.

This means each builder also needs the param. The simplest approach: update each builder to accept `learningsContext` and pass it to `buildProductContext`. Each builder function signature needs to match the new `SystemPromptBuilder` type.

Update the type alias (search for `SystemPromptBuilder` or the SYSTEM_BUILDERS map) to include the new parameter.

**Step 3: Update brainstorm API route**

In `src/app/api/brainstorm/route.ts`, add the import and call:

After line ~121 (after `buildHookInspiration`):
```typescript
  import { buildLearningsContext } from "@/lib/brainstorm";
  // ... (at the appropriate place in the function body)
  const learningsContext = await buildLearningsContext(productSlug);
```

Pass to `buildBrainstormSystemPrompt`:
```typescript
  const systemPrompt = buildBrainstormSystemPrompt(
    product as ProductFull,
    productBrief,
    guidelines,
    segments,
    mode,
    hookInspiration,
    learningsContext
  );
```

**Step 4: Update pipeline generate API route**

In `src/app/api/pipeline/generate/route.ts`, add the same import and call pattern. Find where `buildBrainstormSystemPrompt` is called and add the `learningsContext` parameter.

**Step 5: Verify compilation**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 6: Commit**

```bash
git add src/lib/brainstorm.ts src/app/api/brainstorm/route.ts src/app/api/pipeline/generate/route.ts
git commit -m "feat: inject learnings context into brainstorm and pipeline generate prompts"
```

---

### Task 10: Add Learnings Preview to Brainstorm Page

**Files:**
- Modify: `src/app/brainstorm/page.tsx` or `src/components/brainstorm/BrainstormGenerate.tsx`

**Step 1: Find where the product is selected in BrainstormGenerate**

Read the BrainstormGenerate component to find where the product selector is and where to add a collapsible learnings section.

**Step 2: Add a collapsible learnings preview**

After the product selector and before the generate button, add:
- A collapsible section titled "Learnings for {product}"
- Fetches from `/api/learnings?product={product}&limit=10`
- Shows: pattern summary (angle win rates) and last 5 takeaways
- Collapsed by default, toggle with ChevronDown
- Light styling: `bg-amber-50 border border-amber-200 rounded-lg p-4`

This shows the user exactly what context the AI will see during brainstorming.

**Step 3: Verify it renders**

Navigate to `/brainstorm`, select a product, check the learnings section appears.

**Step 4: Commit**

```bash
git add src/components/brainstorm/BrainstormGenerate.tsx
git commit -m "feat: add learnings preview section to brainstorm page"
```

---

### Task 11: Backfill Script for Existing Concepts

**Files:**
- Create: `scripts/backfill-learnings.ts`

**Step 1: Write the backfill script**

This script queries all concepts in `killed` or `active` stage from `concept_lifecycle`, fetches their metrics and CASH DNA, and generates learnings for each. Run it once after deployment.

```typescript
// Usage: npx tsx scripts/backfill-learnings.ts
// Requires ANTHROPIC_API_KEY and SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in .env

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ... (include generateConceptLearning logic inline or import from pipeline.ts)
// For each killed/active concept:
// 1. Check if learning already exists (skip if so)
// 2. Fetch metrics, cash_dna, hypothesis
// 3. Generate learning via Claude
// 4. Insert into concept_learnings
// 5. Add 1s delay between calls to avoid rate limiting
```

**Step 2: Run the backfill**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsx scripts/backfill-learnings.ts`

Expected: Learnings generated for existing killed/active concepts. Count logged.

**Step 3: Verify data**

Check the learnings page at `/learnings` — should now show historical learnings.

**Step 4: Commit**

```bash
git add scripts/backfill-learnings.ts
git commit -m "feat: add backfill script for historical concept learnings"
```

---

### Task 12: Final Verification

**Step 1: Run TypeScript compilation check**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty`

Expected: No errors.

**Step 2: Test the full flow manually**

1. Open `/learnings` — verify page loads with backfilled data
2. Test filters — product, market, outcome, angle
3. Open `/brainstorm` — verify learnings preview section appears
4. Generate a concept — verify the AI references past learnings in its output
5. If a concept is in "testing" stage, kill it and verify a new learning appears in `/learnings`

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete concept learnings feedback loop system"
```
