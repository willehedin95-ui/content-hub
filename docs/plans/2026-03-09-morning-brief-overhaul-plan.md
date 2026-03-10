# Morning Brief Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the morning brief less overwhelming by fixing stale action sync, adding priority tiers, and providing educational card text.

**Architecture:** Backend changes to `/api/morning-brief/route.ts` to filter already-handled ads and assign tiers. Frontend changes to `MorningBriefClient.tsx` to render automation summary + 3-tier layout + enhanced card copy.

**Tech Stack:** Next.js API route, React client component, Supabase queries, existing `auto_paused_ads` and `concept_lifecycle` tables.

---

### Task 1: Backend — Filter out already-handled ads from action cards

**Files:**
- Modify: `src/app/api/morning-brief/route.ts:60-92` (add queries after `db` creation)
- Modify: `src/app/api/morning-brief/route.ts:896-1003` (filter bleeders)

**Step 1: Add queries for auto-paused ads and killed concepts**

After `const db = createServerSupabase();` (line 60) and the performance data fetch, add two queries. Insert this block right before the `// ── Synthesize Action Cards ──` comment at line 864:

```typescript
  // ── Filter: already-handled by automation ──
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo_auto = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Ads auto-paused in the last 7 days (for filtering action cards)
  const { data: autoPausedRows } = await db
    .from("auto_paused_ads")
    .select("meta_ad_id, ad_name, campaign_name, reason, days_bleeding, total_spend, created_at")
    .gte("created_at", sevenDaysAgo_auto)
    .order("created_at", { ascending: false });

  const autoPausedAdIds = new Set((autoPausedRows ?? []).map((r: { meta_ad_id: string }) => r.meta_ad_id));

  // Concepts killed by pipeline (for filtering action cards)
  const { data: killedConcepts } = await db
    .from("concept_lifecycle")
    .select("image_job_market_id, signal, created_at")
    .eq("stage", "killed")
    .gte("created_at", sevenDaysAgo_auto)
    .order("created_at", { ascending: false });

  // Map killed concept IDs to their ad set IDs via meta_campaigns
  const killedMarketIds = new Set((killedConcepts ?? []).map((r: { image_job_market_id: string }) => r.image_job_market_id));
  let killedAdsetIds = new Set<string>();
  if (killedMarketIds.size > 0) {
    const { data: killedCampaigns } = await db
      .from("meta_campaigns")
      .select("adset_id")
      .in("image_job_market_id", [...killedMarketIds])
      .not("adset_id", "is", null);
    killedAdsetIds = new Set((killedCampaigns ?? []).map((r: { adset_id: string }) => r.adset_id));
  }

  // Build automation summary (last 24h for the banner)
  const recentAutoPaused = (autoPausedRows ?? []).filter(
    (r: { created_at: string }) => r.created_at >= oneDayAgo
  );
  const recentKills = (killedConcepts ?? []).filter(
    (r: { created_at: string }) => r.created_at >= oneDayAgo
  );
  const automationSummary = {
    auto_paused_count: recentAutoPaused.length,
    auto_paused_ads: recentAutoPaused.map((r: { ad_name: string | null; campaign_name: string | null; total_spend: number | null; days_bleeding: number | null }) => ({
      ad_name: r.ad_name,
      campaign_name: r.campaign_name,
      total_spend: r.total_spend,
      days_bleeding: r.days_bleeding,
    })),
    daily_savings: recentAutoPaused.reduce((sum: number, r: { total_spend: number | null; days_bleeding: number | null }) => {
      const spend = r.total_spend ?? 0;
      const days = r.days_bleeding ?? 1;
      return sum + (days > 0 ? spend / days : 0);
    }, 0),
    killed_concepts_count: recentKills.length,
    killed_concepts: recentKills.map((r: { image_job_market_id: string; signal: string | null }) => ({
      market_id: r.image_job_market_id,
      signal: r.signal,
    })),
  };
```

**Step 2: Filter bleeders before generating cards**

In the bleeder card generation loop (line 898), filter out auto-paused ads:

```typescript
  // Filter out already auto-paused bleeders
  const activeBleeders = bleeders.filter(
    (b) => !autoPausedAdIds.has(b.ad_id)
  );

  const bleedersByAdset = new Map<string, typeof activeBleeders>();
  for (const b of activeBleeders) {
```

Also filter out ads belonging to killed concepts. After each card push in the bleeder loop, add a check — or more simply, add an ad-set-level filter. Right after the `bleedersByAdset` map is built, add:

```typescript
  // Remove ad sets that belong to killed concepts
  for (const [key] of bleedersByAdset) {
    if (!key.startsWith("solo_") && killedAdsetIds.has(key)) {
      bleedersByAdset.delete(key);
    }
  }
```

**Step 3: Filter fatigue/diagnostic cards for killed concepts**

In the fatigue signal loop (line 1149), skip ads in killed ad sets:

```typescript
  for (const f of fatigueSignals.critical) {
    if (f.adset_id && killedAdsetIds.has(f.adset_id)) continue;
    if (autoPausedAdIds.has(f.ad_id)) continue;
```

In the ad diagnostics loop (line 1247):

```typescript
  for (const diag of adDiagnostics) {
    if (diag.bucket === "winner") continue;
    if (diag.adset_id && killedAdsetIds.has(diag.adset_id)) continue;
    if (autoPausedAdIds.has(diag.ad_id)) continue;
```

**Step 4: Add `automationSummary` to API response**

In the response JSON (line 1369), add:

```typescript
  return NextResponse.json({
    generated_at: new Date().toISOString(),
    data_date: latestDate,
    automation_summary: automationSummary,
    pipeline_thresholds: { ... },
    // ...rest unchanged
  });
```

**Step 5: Verify**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors related to morning-brief route.

**Step 6: Commit**

```bash
git add src/app/api/morning-brief/route.ts
git commit -m "fix: filter out auto-paused ads and killed concepts from morning brief action cards"
```

---

### Task 2: Backend — Assign tier and educational text to each card

**Files:**
- Modify: `src/app/api/morning-brief/route.ts:865-886` (ActionCard interface)
- Modify: `src/app/api/morning-brief/route.ts:1326-1327` (after sort, assign tiers)

**Step 1: Extend ActionCard interface with tier and education fields**

Add to the ActionCard interface (line 865):

```typescript
  interface ActionCard {
    id: string;
    type: "pause" | "scale" | "refresh" | "budget" | "landing_page" | "save_copy" | "info";
    tier: "do_now" | "review_today" | "fyi";
    category: string;
    title: string;
    why: string;
    guidance: string;
    expected_impact: string;
    what_happens: string;
    cost_of_inaction: string;
    action_data: Record<string, unknown> | null;
    priority: number;
    // ...rest unchanged
  }
```

**Step 2: Add educational text templates**

After the `actionCards.sort(...)` at line 1327, add tier assignment and educational text:

```typescript
  // ── Assign tiers ──
  // do_now: priority 1 cards (bleeders, unprofitable fatigue) — max 3
  // review_today: priority 2-3 cards (scale, refresh, diagnostics, landing page)
  // fyi: priority 4+ cards (save copy, budget rebalance, info)
  let doNowCount = 0;
  for (const card of actionCards) {
    if (card.type === "info") {
      card.tier = "fyi";
    } else if (card.priority <= 1 && doNowCount < 3) {
      card.tier = "do_now";
      doNowCount++;
    } else if (card.priority <= 1 && doNowCount >= 3) {
      // Overflow critical items go to review_today
      card.tier = "review_today";
    } else if (card.priority <= 3) {
      card.tier = "review_today";
    } else {
      card.tier = "fyi";
    }

    // ── Educational text per card type ──
    switch (card.type) {
      case "pause":
        card.what_happens = card.action_data?.action === "pause_adset"
          ? "The entire ad set stops spending immediately. The budget Meta was using for this ad set gets redistributed to your other active ad sets. You can always turn it back on later from Meta Ads Manager."
          : "This ad stops spending immediately. Meta will redistribute its share of the budget to the other ads in the same ad set. You can always turn it back on later.";
        card.cost_of_inaction = card.expected_impact.includes("kr/day")
          ? `${card.expected_impact.replace("Save ", "")} continues to be spent with very low chance of converting.`
          : "Money continues to be spent on an underperforming ad instead of your winners.";
        break;
      case "scale":
        card.what_happens = "Increases this campaign's daily budget by 20%. Meta's algorithm needs about 2 days to adjust to the new budget. Watch the CPA for 3 days after scaling — if it rises too much, you can reduce the budget back.";
        card.cost_of_inaction = "This proven winner keeps running at the current budget. No harm in waiting, but you're leaving potential sales on the table.";
        break;
      case "refresh":
        card.what_happens = "Opens the concept iteration tool where you can generate new ad variations with fresh visuals but the same winning angle. The current ads keep running while you create new ones.";
        card.cost_of_inaction = "The ad continues to fatigue — performance will gradually decline as the audience gets tired of seeing the same creative. Acting sooner preserves the concept's momentum.";
        break;
      case "budget":
        card.what_happens = "Moves budget from your underperforming campaigns to your best-performing ones. Your total daily spend stays the same — it just gets distributed smarter. No ads are paused.";
        card.cost_of_inaction = "Budget stays allocated based on old performance. Inefficient campaigns keep getting the same spend even though better ones could use it.";
        break;
      case "landing_page":
        card.what_happens = "Opens the landing pages section where you can review and swap the landing page for this ad. The ad keeps running — only the destination URL changes.";
        card.cost_of_inaction = "People keep clicking your ad but not buying. You're paying for clicks that don't convert — wasted ad spend.";
        break;
      case "save_copy":
        card.what_happens = "Saves this winning ad copy to your Copy Bank so you can reuse it on future concepts without re-translating. The ad keeps running as-is.";
        card.cost_of_inaction = "No immediate cost — but you might lose track of what copy worked well if this ad eventually gets paused.";
        break;
      default:
        card.what_happens = "";
        card.cost_of_inaction = "";
    }
  }
```

**Step 3: Make sure all card pushes include the new fields with defaults**

Add defaults to avoid type errors. Before each `actionCards.push(...)` call, the new fields need to be present. The simplest approach: after the sort/tier block above, the fields are already set. For the `push` calls themselves, add placeholder values that get overwritten:

Actually, since we're setting `tier`, `what_happens`, and `cost_of_inaction` in a post-processing loop (after all cards are pushed), we can just initialize them with defaults when pushing. Add to each push call:
```typescript
tier: "review_today" as const,  // overwritten in post-processing
what_happens: "",                // overwritten in post-processing
cost_of_inaction: "",            // overwritten in post-processing
```

Or more cleanly — after the existing `actionCards.sort(...)` call, the post-processing loop handles everything. TypeScript won't complain as long as the interface marks these as optional or we do a cast. Simplest: mark them optional in the interface:

```typescript
    tier?: "do_now" | "review_today" | "fyi";
    what_happens?: string;
    cost_of_inaction?: string;
```

**Step 4: Verify**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors.

**Step 5: Commit**

```bash
git add src/app/api/morning-brief/route.ts
git commit -m "feat: assign priority tiers and educational text to morning brief action cards"
```

---

### Task 3: Frontend — Add automation summary banner

**Files:**
- Modify: `src/app/morning-brief/MorningBriefClient.tsx:265-292` (MorningBriefData interface)
- Modify: `src/app/morning-brief/MorningBriefClient.tsx:543-567` (render after header)

**Step 1: Update MorningBriefData interface**

Add to the interface (around line 265):

```typescript
interface MorningBriefData {
  generated_at: string;
  data_date: string;
  automation_summary?: {
    auto_paused_count: number;
    auto_paused_ads: Array<{
      ad_name: string | null;
      campaign_name: string | null;
      total_spend: number | null;
      days_bleeding: number | null;
    }>;
    daily_savings: number;
    killed_concepts_count: number;
    killed_concepts: Array<{
      market_id: string;
      signal: string | null;
    }>;
  };
  pipeline_thresholds?: { ... };
  // ...rest unchanged
}
```

Also update the ActionCard interface (line 172) to include the new fields:

```typescript
interface ActionCard {
  id: string;
  type: "pause" | "scale" | "refresh" | "budget" | "landing_page" | "save_copy";
  tier?: "do_now" | "review_today" | "fyi";
  // ...existing fields...
  what_happens?: string;
  cost_of_inaction?: string;
}
```

**Step 2: Add AutomationSummary component**

Add this component before the `MorningBriefClient` function (around line 334):

```typescript
function AutomationSummary({ summary }: { summary: NonNullable<MorningBriefData["automation_summary"]> }) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = summary.auto_paused_count > 0 || summary.killed_concepts_count > 0;
  if (!hasContent) return null;

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-5 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-sm text-emerald-800">
            <span className="font-medium">While you were away</span>
            {" — "}
            {[
              summary.auto_paused_count > 0 && `Auto-paused ${summary.auto_paused_count} bleeding ad${summary.auto_paused_count !== 1 ? "s" : ""}${summary.daily_savings > 0 ? ` (saved ~${Math.round(summary.daily_savings)} kr/day)` : ""}`,
              summary.killed_concepts_count > 0 && `Killed ${summary.killed_concepts_count} concept${summary.killed_concepts_count !== 1 ? "s" : ""}`,
            ].filter(Boolean).join(". ")}
          </span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-emerald-600 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-emerald-200 space-y-1.5">
          {summary.auto_paused_ads.map((ad, i) => (
            <div key={i} className="text-xs text-emerald-700 flex items-center gap-2">
              <Ban className="w-3 h-3 shrink-0" />
              <span>
                Paused &ldquo;{ad.ad_name || "unnamed"}&rdquo;
                {ad.campaign_name && <span className="text-emerald-600"> ({ad.campaign_name})</span>}
                {ad.days_bleeding && <span> — {ad.days_bleeding}d bleeding</span>}
                {ad.total_spend && <span>, {Math.round(ad.total_spend)} kr wasted</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Render the banner**

In the main component JSX, right after the KPI strip (after line 604), add:

```typescript
      {/* Automation summary */}
      {data.automation_summary && (
        <AutomationSummary summary={data.automation_summary} />
      )}
```

**Step 4: Verify**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors.

**Step 5: Commit**

```bash
git add src/app/morning-brief/MorningBriefClient.tsx
git commit -m "feat: add automation summary banner to morning brief"
```

---

### Task 4: Frontend — Render action cards in 3 tiers

**Files:**
- Modify: `src/app/morning-brief/MorningBriefClient.tsx:606-774` (replace flat card list)

**Step 1: Add TierSection component**

Add before `MorningBriefClient`:

```typescript
function TierSection({
  tier,
  title,
  subtitle,
  cards,
  accentColor,
  defaultOpen,
  actionState,
  handledCards,
  onApply,
  onDismiss,
}: {
  tier: string;
  title: string;
  subtitle: string;
  cards: ActionCard[];
  accentColor: "red" | "amber" | "gray";
  defaultOpen: boolean;
  actionState: { loading: string | null; results: Record<string, { ok: boolean; message: string }> };
  handledCards: Record<string, string>;
  onApply: (card: ActionCard) => void;
  onDismiss: (cardId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const visibleCards = cards.filter((c) => !handledCards[c.id]);

  if (visibleCards.length === 0) return null;

  const colorMap = {
    red: {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-800",
      badge: "bg-red-100 text-red-700",
      dot: "bg-red-500",
    },
    amber: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-800",
      badge: "bg-amber-100 text-amber-700",
      dot: "bg-amber-500",
    },
    gray: {
      bg: "bg-gray-50",
      border: "border-gray-200",
      text: "text-gray-700",
      badge: "bg-gray-200 text-gray-600",
      dot: "bg-gray-400",
    },
  };
  const colors = colorMap[accentColor];

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn("w-full flex items-center justify-between px-3 py-2 rounded-lg", colors.bg)}
      >
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full", colors.dot)} />
          <span className={cn("text-sm font-semibold", colors.text)}>{title}</span>
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", colors.badge)}>
            {visibleCards.length}
          </span>
          <span className="text-xs text-gray-500">{subtitle}</span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {visibleCards.map((card) => (
            <ActionCardComponent
              key={card.id}
              card={card}
              actionState={actionState}
              onApply={onApply}
              onDismiss={onDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Extract ActionCardComponent from existing inline JSX**

Extract lines 630-769 (the card rendering) into a standalone component. The card should now show `why` always visible (already is), plus `what_happens` and `cost_of_inaction`:

```typescript
function ActionCardComponent({
  card,
  actionState,
  onApply,
  onDismiss,
}: {
  card: ActionCard;
  actionState: { loading: string | null; results: Record<string, { ok: boolean; message: string }> };
  onApply: (card: ActionCard) => void;
  onDismiss: (cardId: string) => void;
}) {
  const config = ACTION_CONFIG[card.type] ?? ACTION_CONFIG.pause;
  const result = actionState.results[card.id];
  const isLoading = actionState.loading === card.id;
  const TypeIcon = config.Icon;

  return (
    <div
      className={cn(
        "bg-white border border-gray-200 rounded-lg overflow-hidden",
        config.borderColor
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-4 p-4">
        {/* Type icon */}
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", config.iconBg)}>
          <TypeIcon className={cn("w-5 h-5", config.iconColor)} />
        </div>

        {/* Ad image */}
        {card.image_url && (
          <img src={card.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-200" />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
          <p className="text-xs text-gray-600 mt-1">{card.why}</p>

          {/* Educational sections */}
          {card.what_happens && !result && (
            <div className="mt-2 text-xs text-gray-500 space-y-1.5">
              <div>
                <span className="font-medium text-gray-700">What happens when you click: </span>
                {card.what_happens}
              </div>
              {card.cost_of_inaction && (
                <div>
                  <span className="font-medium text-gray-700">Doing nothing costs: </span>
                  {card.cost_of_inaction}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {card.campaign_name && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 truncate max-w-[200px]">
                {card.campaign_name}
              </span>
            )}
            {card.days_running != null && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                {card.days_running}d running
              </span>
            )}
            {card.adset_roas != null && card.adset_roas > 0 && (
              <span className={cn(
                "text-[11px] px-2 py-0.5 rounded-full font-medium",
                card.adset_roas >= (card.be_roas ?? 1.5) ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              )}>
                {card.adset_roas}x ROAS
              </span>
            )}
            {typeof card.action_data?.market === "string" && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">
                {card.action_data.market}
              </span>
            )}
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", config.tagColor)}>
              {card.category}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {result ? (
            <span className={cn("text-xs font-medium px-3 py-2 rounded-md", result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
              {result.ok ? (<><CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />Done</>) : result.message}
            </span>
          ) : (
            <>
              <button
                onClick={() => onDismiss(card.id)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
              {card.action_data && (
                <button
                  onClick={() => onApply(card)}
                  disabled={!!actionState.loading}
                  className={cn("px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 whitespace-nowrap", config.buttonColor)}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (card.button_label || config.buttonLabel)}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Replace the flat card list in the main component**

Replace the entire section from line 606-774 (the `{/* 3. Action Cards */}` section) with:

```typescript
      {/* 3. Action Cards — Priority Tiers */}
      <section className="space-y-4">
        {visibleActions.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <p className="text-green-800 font-semibold text-lg">All clear</p>
            <p className="text-green-700 text-sm mt-1">
              No actions needed today. Your campaigns are running well.
            </p>
          </div>
        ) : (
          <>
            <TierSection
              tier="do_now"
              title="Do Now"
              subtitle="Actively losing money"
              cards={visibleActions.filter((c) => c.tier === "do_now")}
              accentColor="red"
              defaultOpen={true}
              actionState={actionState}
              handledCards={handledCards}
              onApply={handleApply}
              onDismiss={(cardId) => logAction(cardId, "dismissed")}
            />
            <TierSection
              tier="review_today"
              title="Review Today"
              subtitle="Worth looking at, no rush"
              cards={visibleActions.filter((c) => c.tier === "review_today")}
              accentColor="amber"
              defaultOpen={true}
              actionState={actionState}
              handledCards={handledCards}
              onApply={handleApply}
              onDismiss={(cardId) => logAction(cardId, "dismissed")}
            />
            <TierSection
              tier="fyi"
              title="FYI"
              subtitle="Nice to know"
              cards={visibleActions.filter((c) => c.tier === "fyi" || !c.tier)}
              accentColor="gray"
              defaultOpen={false}
              actionState={actionState}
              handledCards={handledCards}
              onApply={handleApply}
              onDismiss={(cardId) => logAction(cardId, "dismissed")}
            />
          </>
        )}
      </section>
```

**Step 4: Update the header count to be more useful**

Replace the old header (line 608-612) — it's now part of the tier headers, so remove the standalone "X actions today" text. Instead, add a compact summary line after the page title:

In the header section (line 546-567), after the subtitle `<p>` tag, add:

```typescript
          <p className="text-xs text-gray-400 mt-0.5">
            {visibleActions.filter(c => c.tier === "do_now").length > 0
              ? `${visibleActions.filter(c => c.tier === "do_now").length} critical`
              : "No critical actions"
            }
            {" · "}
            {visibleActions.filter(c => c.tier === "review_today").length} to review
            {" · "}
            {visibleActions.filter(c => c.tier === "fyi" || !c.tier).length} FYI
          </p>
```

But only render this when `data` is loaded and `visibleActions` is defined — make sure it's inside the right conditional.

**Step 5: Remove the old expandable guidance `<details>` block**

Since educational text is now inline on every card (via `what_happens` / `cost_of_inaction`), the old "Why should I do this?" toggle is no longer needed. It's been replaced by the inline text in `ActionCardComponent`. The old `<details>` block with `card.guidance` is removed.

**Step 6: Verify**

Run: `cd "/Users/williamhedin/Claude Code/content-hub" && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors.

**Step 7: Commit**

```bash
git add src/app/morning-brief/MorningBriefClient.tsx
git commit -m "feat: render morning brief actions in priority tiers with educational text"
```

---

### Task 5: Manual test in browser

**Step 1: Start dev server**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npm run dev
```

**Step 2: Open morning brief**

Navigate to `http://localhost:3000/morning-brief` and verify:
- Automation summary banner appears (if there were recent auto-paused ads)
- Actions are split into Do Now / Review Today / FYI tiers
- FYI section is collapsed by default
- Each card shows "What happens when you click" and "Doing nothing costs" text
- Stale/already-killed ads do NOT appear in the action list
- "All clear" shows when all cards are dismissed

**Step 3: Test card actions**

- Try dismissing a card — it should disappear
- Try applying a card — verify it works and shows "Done"
- Refresh the page — dismissed/applied cards should stay hidden

**Step 4: Commit any fixes**

If any adjustments needed, fix and commit.

---

### Task 6: Final commit and push

**Step 1: Review all changes**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && git diff --stat main
```

**Step 2: Push to main**

```bash
git push origin main
```

Report the commit hash and summary to the user.
