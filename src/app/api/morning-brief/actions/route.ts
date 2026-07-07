import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { updateAd, updateCampaign, getCampaignBudget, pauseAdSetAndAds, runWithMetaConfig } from "@/lib/meta";
import { getWorkspaceId } from "@/lib/workspace";
import type { WorkspaceMetaConfig } from "@/types";

const DELAY = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Refuse Meta money-writes when performance data is older than this (A2).
const MAX_DATA_AGE_DAYS = 2;
// Budget-change cooldown per campaign (scale_winner + shifts + increase/reduce).
const COOLDOWN_HOURS = 24;
// Hard cap fallback when the campaign's workspace has no max_campaign_budget_sek.
const DEFAULT_MAX_CAMPAIGN_BUDGET_SEK = 50_000;
// Any of these ad_learnings events counts as a recent budget change for cooldown.
const BUDGET_EVENT_TYPES = [
  "graduated_winner",
  "budget_shifted",
  "budget_increased_for_testing",
  "budget_reduced_for_testing",
];

type MetaCfg = WorkspaceMetaConfig | null;

interface MetaConfigResolver {
  forCampaign(campaignId: string | null | undefined): MetaCfg;
  workspaceIdForCampaign(campaignId: string | null | undefined): string | null;
  accountKeyForCampaign(campaignId: string | null | undefined): Promise<string>;
  maxBudgetSekForCampaign(campaignId: string | null | undefined): number;
  campaignIdForAd(adId: string): Promise<string | null>;
  campaignIdForAdset(adsetId: string): Promise<string | null>;
  forAdset(adsetId: string): Promise<MetaCfg>;
}

/**
 * A3 (2026-07-07): every money-writing Meta call in this route must run inside
 * runWithMetaConfig with the config of the OBJECT's workspace — not whatever
 * env creds happen to be active. Resolution chain:
 * campaign → meta_campaign_mappings.workspace_id → workspaces.meta_config
 * (fallback null = env vars). Ads/ad sets resolve to their campaign first.
 */
async function buildMetaConfigResolver(
  db: ReturnType<typeof createServerSupabase>
): Promise<MetaConfigResolver> {
  const wsConfigs = new Map<string, WorkspaceMetaConfig>();
  const wsSettings = new Map<string, Record<string, unknown>>();
  const { data: wsRows, error: wsErr } = await db
    .from("workspaces")
    .select("id, meta_config, settings");
  if (wsErr) {
    console.error("[morning-brief/actions] workspaces query failed:", wsErr.message);
  }
  for (const ws of wsRows ?? []) {
    if (ws.meta_config) wsConfigs.set(ws.id as string, ws.meta_config as WorkspaceMetaConfig);
    if (ws.settings) wsSettings.set(ws.id as string, ws.settings as Record<string, unknown>);
  }

  const campaignWs = new Map<string, string>();
  const { data: mapRows, error: mapErr } = await db
    .from("meta_campaign_mappings")
    .select("meta_campaign_id, workspace_id");
  if (mapErr) {
    console.error("[morning-brief/actions] meta_campaign_mappings query failed:", mapErr.message);
  }
  for (const m of mapRows ?? []) {
    if (m.meta_campaign_id && m.workspace_id) {
      campaignWs.set(m.meta_campaign_id as string, m.workspace_id as string);
    }
  }

  const workspaceIdForCampaign = (campaignId: string | null | undefined): string | null =>
    campaignId ? campaignWs.get(campaignId) ?? null : null;

  const forCampaign = (campaignId: string | null | undefined): MetaCfg => {
    const wsId = workspaceIdForCampaign(campaignId);
    return (wsId && wsConfigs.get(wsId)) || null;
  };

  // M2 (2026-07-07): same resolution chain as the morning brief's accountForRow —
  // latest synced meta_ad_performance.ad_account_id first (ground truth),
  // then mapping → workspace config, then env fallback. Cached per request.
  const acctCache = new Map<string, string>();
  const accountKeyForCampaign = async (campaignId: string | null | undefined): Promise<string> => {
    const envKey = process.env.META_AD_ACCOUNT_ID ?? "env";
    if (!campaignId) return envKey;
    if (acctCache.has(campaignId)) return acctCache.get(campaignId)!;

    let perfAccount: string | null = null;
    const { data, error } = await db
      .from("meta_ad_performance")
      .select("ad_account_id")
      .eq("campaign_id", campaignId)
      .not("ad_account_id", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      // Column may not exist yet (pre-DDL) — fall through to mapping chain.
      console.error("[morning-brief/actions] ad_account_id lookup failed:", error.message);
    } else {
      perfAccount = (data?.ad_account_id as string | undefined) ?? null;
    }

    const key = perfAccount ?? forCampaign(campaignId)?.ad_account_id ?? envKey;
    acctCache.set(campaignId, key);
    return key;
  };

  const maxBudgetSekForCampaign = (campaignId: string | null | undefined): number => {
    const wsId = workspaceIdForCampaign(campaignId);
    const settings = wsId ? wsSettings.get(wsId) : undefined;
    return Number(settings?.max_campaign_budget_sek ?? DEFAULT_MAX_CAMPAIGN_BUDGET_SEK);
  };

  const campaignIdForAd = async (adId: string): Promise<string | null> => {
    const { data, error } = await db
      .from("meta_ad_performance")
      .select("campaign_id")
      .eq("meta_ad_id", adId)
      .not("campaign_id", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[morning-brief/actions] meta_ad_performance lookup failed:", error.message);
    }
    return (data?.campaign_id as string | undefined) ?? null;
  };

  const campaignIdForAdset = async (adsetId: string): Promise<string | null> => {
    const { data, error } = await db
      .from("meta_adset_performance")
      .select("campaign_id")
      .eq("adset_id", adsetId)
      .not("campaign_id", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[morning-brief/actions] meta_adset_performance lookup failed:", error.message);
    }
    return (data?.campaign_id as string | undefined) ?? null;
  };

  const forAdset = async (adsetId: string): Promise<MetaCfg> => {
    const { data, error } = await db
      .from("meta_campaigns")
      .select("workspace_id")
      .eq("meta_adset_id", adsetId)
      .not("workspace_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[morning-brief/actions] meta_campaigns adset lookup failed:", error.message);
    }
    if (data?.workspace_id) return wsConfigs.get(data.workspace_id as string) ?? null;

    return forCampaign(await campaignIdForAdset(adsetId));
  };

  return {
    forCampaign,
    workspaceIdForCampaign,
    accountKeyForCampaign,
    maxBudgetSekForCampaign,
    campaignIdForAd,
    campaignIdForAdset,
    forAdset,
  };
}

/**
 * A2 + M3 (2026-07-07): per-campaign staleness guard. Checks the freshest
 * performance row for the AFFECTED campaigns (not globally) — a dead account's
 * stale data must not pass just because another account syncs fine. Falls back
 * to the global latest date when no campaign could be resolved.
 * Fail-closed: lookup error or no data → 409.
 */
async function staleness409(
  db: ReturnType<typeof createServerSupabase>,
  campaignIds: Array<string | null | undefined>
): Promise<NextResponse | null> {
  const ids = [...new Set(campaignIds.filter((c): c is string => Boolean(c)))];
  const base = db.from("meta_ad_performance").select("date");
  const filtered = ids.length > 0 ? base.in("campaign_id", ids) : base;
  const { data, error } = await filtered
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[morning-brief/actions] staleness lookup failed:", error.message);
  }
  const latestDataDate = (data?.date as string | undefined) ?? null;
  const dataAgeDays = latestDataDate
    ? Math.floor((Date.now() - new Date(`${latestDataDate}T00:00:00Z`).getTime()) / 86400000)
    : Infinity;
  if (error || dataAgeDays > MAX_DATA_AGE_DAYS) {
    const scope = ids.length > 0 ? "the affected campaign(s)" : "any campaign";
    return NextResponse.json(
      {
        ok: false,
        stale: true,
        data_date: latestDataDate,
        error: error
          ? "Refusing to execute: could not verify performance data freshness."
          : latestDataDate
            ? `Refusing to execute: performance data for ${scope} is stale (latest ${latestDataDate}, ${dataAgeDays} days old, max ${MAX_DATA_AGE_DAYS}). Run ad-performance-sync first.`
            : `Refusing to execute: no performance data for ${scope}. Run ad-performance-sync first.`,
      },
      { status: 409 }
    );
  }
  return null;
}

/**
 * M5 + L3 (2026-07-07): campaigns with ANY recent budget change within the
 * cooldown window — across BOTH systems: manual/UI writes (ad_learnings,
 * all BUDGET_EVENT_TYPES) and autopilot's executed increases (autopilot_actions).
 * Keyed on campaign id WITHOUT workspace filter (Telegram-era rows lack it).
 * Fail-closed: if either query errors, ALL campaigns count as on cooldown.
 */
async function recentBudgetChanges(
  db: ReturnType<typeof createServerSupabase>,
  campaignIds: string[]
): Promise<Set<string>> {
  const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const set = new Set<string>();

  const { data: learnRows, error: learnErr } = await db
    .from("ad_learnings")
    .select("meta_ad_id")
    .in("meta_ad_id", campaignIds)
    .in("event_type", BUDGET_EVENT_TYPES)
    .gte("created_at", cooldownSince);
  if (learnErr) {
    console.error("[morning-brief/actions] ad_learnings cooldown query failed:", learnErr.message);
  }
  for (const r of learnRows ?? []) set.add(r.meta_ad_id as string);

  const { data: autoRows, error: autoErr } = await db
    .from("autopilot_actions")
    .select("target_id")
    .in("target_id", campaignIds)
    .eq("action_type", "increase_budget")
    .eq("success", true)
    .gte("created_at", cooldownSince);
  if (autoErr) {
    console.error("[morning-brief/actions] autopilot_actions cooldown query failed:", autoErr.message);
  }
  for (const r of autoRows ?? []) set.add(r.target_id as string);

  if (learnErr || autoErr) {
    for (const id of campaignIds) set.add(id);
  }
  return set;
}

/**
 * POST /api/morning-brief/actions
 *
 * Actions:
 * - pause_ad: Pause a single ad
 * - pause_bleeders: Pause multiple bleeding ads
 * - scale_winner: Scale a winner's budget +20%
 * - apply_budget_shifts: Apply efficiency-based budget rebalancing (single account)
 */
export async function POST(req: NextRequest) {
  // Auth check — this route is middleware-exempt, so verify session inline
  const { createServerClient } = await import("@supabase/ssr");
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action } = body;
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const resolver = await buildMetaConfigResolver(db);

  try {
    switch (action) {
    case "pause_ad": {
      const { ad_id, ad_name, campaign_name, reason } = body;
      if (!ad_id) {
        return NextResponse.json(
          { error: "ad_id is required" },
          { status: 400 }
        );
      }

      const campaignId = await resolver.campaignIdForAd(ad_id);
      const stale = await staleness409(db, [campaignId]);
      if (stale) return stale;

      const cfg = resolver.forCampaign(campaignId);
      await runWithMetaConfig(cfg, () => updateAd(ad_id, { status: "PAUSED" }));

      // Log to ad_learnings
      await db.from("ad_learnings").insert({
        meta_ad_id: ad_id,
        ad_name: ad_name ?? null,
        campaign_name: campaign_name ?? null,
        event_type: "paused_bleeder",
        detail: reason || "Paused from Morning Brief",
        metrics: {},
        workspace_id: workspaceId,
      });

      return NextResponse.json({ ok: true, paused: ad_id });
    }

    case "pause_bleeders": {
      const { bleeders } = body as {
        bleeders: Array<{
          ad_id: string;
          ad_name?: string;
          adset_id?: string | null;
          campaign_name?: string;
          days_bleeding?: number;
          total_spend?: number;
          avg_ctr?: number;
          avg_cpa?: number;
        }>;
      };
      if (!bleeders?.length) {
        return NextResponse.json(
          { error: "bleeders array is required" },
          { status: 400 }
        );
      }

      // Resolve campaigns first — needed for the per-campaign staleness gate
      const bleederCampaigns = new Map<string, string | null>();
      for (const b of bleeders) {
        bleederCampaigns.set(b.ad_id, await resolver.campaignIdForAd(b.ad_id));
      }
      const stale = await staleness409(db, [...bleederCampaigns.values()]);
      if (stale) return stale;

      const results: Array<{
        ad_id: string;
        status: "paused" | "failed";
        error?: string;
      }> = [];

      for (const b of bleeders) {
        try {
          const cfg = resolver.forCampaign(bleederCampaigns.get(b.ad_id));
          await runWithMetaConfig(cfg, () => updateAd(b.ad_id, { status: "PAUSED" }));
          await sleep(DELAY);

          // Log to auto_paused_ads (adset_id included so zero-spend-alert can correlate)
          await db.from("auto_paused_ads").insert({
            meta_ad_id: b.ad_id,
            adset_id: b.adset_id ?? null,
            ad_name: b.ad_name ?? null,
            campaign_name: b.campaign_name ?? null,
            reason: `Manually paused from Morning Brief: ${b.days_bleeding ?? "?"}d bleeding, ${b.total_spend?.toFixed(0) ?? "?"} spent`,
            days_bleeding: b.days_bleeding ?? null,
            total_spend: b.total_spend ?? null,
          });

          // Log to ad_learnings
          await db.from("ad_learnings").insert({
            meta_ad_id: b.ad_id,
            ad_name: b.ad_name ?? null,
            campaign_name: b.campaign_name ?? null,
            event_type: "paused_bleeder",
            detail: `Paused from Morning Brief: ${b.days_bleeding ?? "?"}d bleeding, ${b.total_spend?.toFixed(0) ?? "?"} spent, CTR ${b.avg_ctr?.toFixed(2) ?? "?"}%`,
            metrics: {
              days_bleeding: b.days_bleeding,
              total_spend: b.total_spend,
              avg_ctr: b.avg_ctr,
              avg_cpa: b.avg_cpa,
            },
            workspace_id: workspaceId,
          });

          results.push({ ad_id: b.ad_id, status: "paused" });
        } catch (err) {
          results.push({
            ad_id: b.ad_id,
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        paused: results.filter((r) => r.status === "paused").length,
        failed: results.filter((r) => r.status === "failed").length,
        results,
      });
    }

    case "scale_winner": {
      const { ad_id, campaign_id, ad_name, campaign_name } = body;
      if (!campaign_id) {
        return NextResponse.json(
          { error: "campaign_id is required" },
          { status: 400 }
        );
      }

      const stale = await staleness409(db, [campaign_id]);
      if (stale) return stale;

      // 2026-04-16: Cooldown check — click-spam protection: 5x clicks = +149%
      // budget with no upper bound. See resilience-audit-2026-04-16.md P1-5.
      // 2026-07-07 (M5/L3): checks ALL budget-change events (not just
      // graduated_winner) across BOTH ad_learnings and autopilot_actions, keyed
      // on campaign id without workspace filter.
      const onCooldown = await recentBudgetChanges(db, [campaign_id]);
      if (onCooldown.has(campaign_id)) {
        return NextResponse.json(
          {
            error: `Campaign budget was already changed within the last ${COOLDOWN_HOURS}h (or the cooldown check was unavailable). Wait before scaling again.`,
          },
          { status: 429 }
        );
      }

      const cfg = resolver.forCampaign(campaign_id);

      // CBO: increase campaign budget by 20%
      const campaignInfo = await runWithMetaConfig(cfg, () => getCampaignBudget(campaign_id));
      const oldBudget = Number(campaignInfo.daily_budget || 0);
      const newBudget = Math.round(oldBudget * 1.2);

      // 2026-04-16: Hard cap from workspace settings to prevent runaway
      // budget growth. Default 50,000 SEK/day — generous, but stops accidental
      // 10x climbs. Settable via workspaces.settings.max_campaign_budget_sek.
      // 2026-07-07: cap is read from the CAMPAIGN's workspace, not the cookie.
      const maxBudgetSek = resolver.maxBudgetSekForCampaign(campaign_id);
      const maxBudgetCents = maxBudgetSek * 100;

      if (newBudget > maxBudgetCents) {
        return NextResponse.json(
          {
            error: `Scaling would exceed max campaign budget (${maxBudgetSek} SEK/day). Current: ${(oldBudget / 100).toFixed(0)}, proposed: ${(newBudget / 100).toFixed(0)}. Raise max in workspace settings if intentional.`,
            current_budget_sek: oldBudget / 100,
            proposed_budget_sek: newBudget / 100,
            max_budget_sek: maxBudgetSek,
          },
          { status: 400 }
        );
      }

      await runWithMetaConfig(cfg, () => updateCampaign(campaign_id, {
        daily_budget: String(newBudget),
      }));

      // Log to ad_learnings (use campaign_id so cooldown check can find it)
      await db.from("ad_learnings").insert({
        meta_ad_id: campaign_id,
        ad_name: ad_name ?? null,
        campaign_name: campaign_name ?? null,
        event_type: "graduated_winner",
        detail: `Campaign budget +20% (${(oldBudget / 100).toFixed(0)} → ${(newBudget / 100).toFixed(0)}/day)`,
        metrics: { old_budget: oldBudget, new_budget: newBudget, triggering_ad_id: ad_id },
        workspace_id: resolver.workspaceIdForCampaign(campaign_id) ?? workspaceId,
      });

      return NextResponse.json({
        ok: true,
        old_budget: oldBudget / 100,
        new_budget: newBudget / 100,
      });
    }

    case "apply_budget_shifts": {
      const { shifts, ad_account_id: expectedAccount } = body as {
        shifts: Array<{
          campaign_id: string;
          campaign_name?: string;
          efficiency_score?: number;
          recommended_budget_share: number;
          recommendation: string;
        }>;
        ad_account_id?: string;
      };
      if (!shifts?.length) {
        return NextResponse.json(
          { error: "shifts array is required" },
          { status: 400 }
        );
      }

      const shiftCampaignIds = shifts.map((s) => s.campaign_id);
      const stale = await staleness409(db, shiftCampaignIds);
      if (stale) return stale;

      // P2 (2026-07-07): shifts may only redistribute budget within ONE ad
      // account. Shares computed across accounts (different currencies) are
      // meaningless and previously moved budget between unrelated accounts.
      const accountKeys = new Set<string>();
      for (const s of shifts) {
        accountKeys.add(await resolver.accountKeyForCampaign(s.campaign_id));
      }
      if (accountKeys.size > 1) {
        return NextResponse.json(
          {
            error: `Refusing to apply shifts: campaigns span ${accountKeys.size} ad accounts. Budget shifts must stay within one account.`,
            accounts: [...accountKeys],
          },
          { status: 400 }
        );
      }
      const resolvedAccount = [...accountKeys][0];

      // M2: validate the card's declared account against our own resolution —
      // a mismatch means the card was generated against different data.
      if (expectedAccount && expectedAccount !== resolvedAccount) {
        return NextResponse.json(
          {
            error: `Account mismatch: action card says ad account ${expectedAccount} but campaigns resolve to ${resolvedAccount}. Regenerate the Morning Brief and try again.`,
            expected: expectedAccount,
            resolved: resolvedAccount,
          },
          { status: 400 }
        );
      }

      // Credentials must actually target the resolved account — otherwise the
      // writes would land in whatever account the env creds point at.
      const cfg = resolver.forCampaign(shifts[0].campaign_id);
      const cfgAccount = cfg?.ad_account_id ?? process.env.META_AD_ACCOUNT_ID ?? "env";
      if (cfgAccount !== resolvedAccount) {
        return NextResponse.json(
          {
            error: `Refusing to apply shifts: no credential mapping targets ad account ${resolvedAccount} (resolved credentials point at ${cfgAccount}).`,
          },
          { status: 400 }
        );
      }

      // M5: same per-campaign cooldown as every other budget write.
      const onCooldown = await recentBudgetChanges(db, shiftCampaignIds);

      // Get current budgets
      let totalBudget = 0;
      const currentBudgets = new Map<string, number>();

      for (const s of shifts) {
        try {
          const info = await runWithMetaConfig(cfg, () => getCampaignBudget(s.campaign_id));
          const budget = Number(info.daily_budget || 0);
          currentBudgets.set(s.campaign_id, budget);
          totalBudget += budget;
          await sleep(DELAY);
        } catch {
          // Skip campaigns that can't be read
        }
      }

      if (totalBudget === 0) {
        return NextResponse.json(
          { error: "No campaign budgets found" },
          { status: 400 }
        );
      }

      const results: Array<{
        campaign_id: string;
        status: "updated" | "skipped" | "failed";
        reason?: string;
        old_budget?: number;
        new_budget?: number;
      }> = [];

      for (const s of shifts) {
        const current = currentBudgets.get(s.campaign_id);
        if (current === undefined) {
          results.push({ campaign_id: s.campaign_id, status: "skipped", reason: "budget unreadable" });
          continue;
        }

        if (onCooldown.has(s.campaign_id)) {
          results.push({
            campaign_id: s.campaign_id,
            status: "skipped",
            reason: `budget changed within ${COOLDOWN_HOURS}h (cooldown)`,
          });
          continue;
        }

        const newBudget = Math.round(
          (s.recommended_budget_share / 100) * totalBudget
        );

        // M5: respect the campaign workspace's hard budget cap here too.
        const maxCents = resolver.maxBudgetSekForCampaign(s.campaign_id) * 100;
        if (newBudget > current && newBudget > maxCents) {
          results.push({
            campaign_id: s.campaign_id,
            status: "skipped",
            reason: `shift would exceed max campaign budget (${maxCents / 100} SEK/day)`,
          });
          continue;
        }

        if (Math.abs(newBudget - current) < 100) {
          // Less than $1 difference, skip
          results.push({ campaign_id: s.campaign_id, status: "skipped", reason: "difference < 1" });
          continue;
        }

        try {
          await runWithMetaConfig(cfg, () => updateCampaign(s.campaign_id, {
            daily_budget: String(newBudget),
          }));
          await sleep(DELAY);

          await db.from("ad_learnings").insert({
            meta_ad_id: s.campaign_id,
            ad_name: s.campaign_name ?? null,
            campaign_name: s.campaign_name ?? null,
            event_type: "budget_shifted",
            detail: `Campaign budget ${s.recommendation}: ${(current / 100).toFixed(0)} → ${(newBudget / 100).toFixed(0)}/day (efficiency: ${s.efficiency_score?.toFixed(1) ?? "?"})`,
            metrics: {
              old_budget: current,
              new_budget: newBudget,
              recommendation: s.recommendation,
              efficiency_score: s.efficiency_score,
            },
            workspace_id: resolver.workspaceIdForCampaign(s.campaign_id) ?? workspaceId,
          });

          results.push({
            campaign_id: s.campaign_id,
            status: "updated",
            old_budget: current / 100,
            new_budget: newBudget / 100,
          });
        } catch {
          results.push({
            campaign_id: s.campaign_id,
            status: "failed",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        updated: results.filter((r) => r.status === "updated").length,
        results,
      });
    }

    case "pause_adset": {
      const { adset_id, adset_name, campaign_name, reason } = body;
      if (!adset_id) {
        return NextResponse.json(
          { error: "adset_id is required" },
          { status: 400 }
        );
      }

      const adsetCampaignId = await resolver.campaignIdForAdset(adset_id);
      const stale = await staleness409(db, [adsetCampaignId]);
      if (stale) return stale;

      const cfg = await resolver.forAdset(adset_id);
      await runWithMetaConfig(cfg, () => pauseAdSetAndAds(adset_id));

      // Log to ad_learnings
      await db.from("ad_learnings").insert({
        meta_ad_id: adset_id,
        ad_name: adset_name ?? null,
        campaign_name: campaign_name ?? null,
        event_type: "paused_adset",
        detail: reason || "Ad set paused from Daily Actions",
        metrics: {},
        workspace_id: workspaceId,
      });

      return NextResponse.json({ ok: true, paused_adset: adset_id });
    }

    case "batch_pause_adsets": {
      const { adset_ids } = body as { adset_ids: string[] };
      if (!adset_ids?.length) {
        return NextResponse.json(
          { error: "adset_ids array is required" },
          { status: 400 }
        );
      }

      // Per-campaign staleness across the whole batch
      const adsetCampaigns = new Map<string, string | null>();
      for (const adsetId of adset_ids) {
        adsetCampaigns.set(adsetId, await resolver.campaignIdForAdset(adsetId));
      }
      const stale = await staleness409(db, [...adsetCampaigns.values()]);
      if (stale) return stale;

      const results: Array<{
        adset_id: string;
        status: "paused" | "failed";
        error?: string;
      }> = [];

      for (const adsetId of adset_ids) {
        try {
          const cfg = await resolver.forAdset(adsetId);
          await runWithMetaConfig(cfg, () => pauseAdSetAndAds(adsetId));
          await sleep(DELAY);

          await db.from("ad_learnings").insert({
            meta_ad_id: adsetId,
            event_type: "paused_adset",
            detail: "Batch killed from Strategy Guide",
            metrics: {},
            workspace_id: workspaceId,
          });

          results.push({ adset_id: adsetId, status: "paused" });
        } catch (err) {
          results.push({
            adset_id: adsetId,
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        paused: results.filter((r) => r.status === "paused").length,
        failed: results.filter((r) => r.status === "failed").length,
        results,
      });
    }

    case "reduce_budget": {
      const { campaign_ids, target_budget, market } = body as {
        campaign_ids: string[];
        target_budget: number; // in cents (Meta format)
        market: string;
      };
      if (!campaign_ids?.length || !target_budget) {
        return NextResponse.json(
          { error: "campaign_ids and target_budget are required" },
          { status: 400 }
        );
      }

      const stale = await staleness409(db, campaign_ids);
      if (stale) return stale;

      const targetPerCampaign = Math.round(target_budget / campaign_ids.length);

      // P2 (2026-07-07): same cooldown as scale_winner. No cap check here —
      // L2: reductions must ALWAYS be allowed (the cap only guards increases).
      const onCooldown = await recentBudgetChanges(db, campaign_ids);

      const results: Array<{
        campaign_id: string;
        old_budget: number;
        new_budget: number;
      }> = [];
      const skipped: Array<{ campaign_id: string; reason: string }> = [];
      const failed: Array<{ campaign_id: string; error: string }> = [];

      for (const campaignId of campaign_ids) {
        if (onCooldown.has(campaignId)) {
          skipped.push({ campaign_id: campaignId, reason: `budget changed within ${COOLDOWN_HOURS}h (cooldown)` });
          continue;
        }

        // L1: per-campaign try/catch — a Meta error mid-loop must not 500 the
        // whole action after some campaigns were already updated.
        try {
          const cfg = resolver.forCampaign(campaignId);
          const info = await runWithMetaConfig(cfg, () => getCampaignBudget(campaignId));
          const oldBudget = Number(info.daily_budget || 0);

          await runWithMetaConfig(cfg, () => updateCampaign(campaignId, {
            daily_budget: String(targetPerCampaign),
          }));
          await sleep(DELAY);

          // Per-campaign learning row so the cooldown check can find it
          await db.from("ad_learnings").insert({
            meta_ad_id: campaignId,
            campaign_name: market,
            event_type: "budget_reduced_for_testing",
            detail: `Budget reduced for ${market} cold start: ${oldBudget / 100} → ${targetPerCampaign / 100} SEK/day`,
            metrics: { market, target_budget: target_budget / 100, old_budget: oldBudget, new_budget: targetPerCampaign },
            workspace_id: resolver.workspaceIdForCampaign(campaignId) ?? workspaceId,
          });

          results.push({
            campaign_id: campaignId,
            old_budget: oldBudget / 100,
            new_budget: targetPerCampaign / 100,
          });
        } catch (err) {
          failed.push({
            campaign_id: campaignId,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        results,
        skipped,
        failed,
      });
    }

    case "increase_budget": {
      const { campaign_ids, extra_per_campaign, market, concepts_count } = body as {
        campaign_ids: string[];
        extra_per_campaign: number; // in cents (Meta format)
        market: string;
        concepts_count: number;
      };
      if (!campaign_ids?.length || !extra_per_campaign) {
        return NextResponse.json(
          { error: "campaign_ids and extra_per_campaign are required" },
          { status: 400 }
        );
      }

      const stale = await staleness409(db, campaign_ids);
      if (stale) return stale;

      // P2 (2026-07-07): same cooldown + cap as scale_winner.
      const onCooldown = await recentBudgetChanges(db, campaign_ids);

      const results: Array<{
        campaign_id: string;
        old_budget: number;
        new_budget: number;
      }> = [];
      const skipped: Array<{ campaign_id: string; reason: string }> = [];
      const failed: Array<{ campaign_id: string; error: string }> = [];

      for (const campaignId of campaign_ids) {
        if (onCooldown.has(campaignId)) {
          skipped.push({ campaign_id: campaignId, reason: `budget changed within ${COOLDOWN_HOURS}h (cooldown)` });
          continue;
        }

        // L1: per-campaign try/catch — a Meta error mid-loop must not 500 the
        // whole action after some campaigns were already updated.
        try {
          const cfg = resolver.forCampaign(campaignId);
          const info = await runWithMetaConfig(cfg, () => getCampaignBudget(campaignId));
          const oldBudget = Number(info.daily_budget || 0);
          const newBudget = oldBudget + extra_per_campaign;

          const maxCents = resolver.maxBudgetSekForCampaign(campaignId) * 100;
          if (newBudget > maxCents) {
            skipped.push({ campaign_id: campaignId, reason: `increase would exceed max campaign budget (${maxCents / 100} SEK/day)` });
            continue;
          }

          await runWithMetaConfig(cfg, () => updateCampaign(campaignId, {
            daily_budget: String(newBudget),
          }));
          await sleep(DELAY);

          // Per-campaign learning row so the cooldown check can find it
          await db.from("ad_learnings").insert({
            meta_ad_id: campaignId,
            campaign_name: market,
            event_type: "budget_increased_for_testing",
            detail: `Budget increased to fit ${concepts_count} new concept${concepts_count !== 1 ? "s" : ""} in ${market}: ${oldBudget / 100} → ${newBudget / 100}/day`,
            metrics: { market, concepts_count, old_budget: oldBudget, new_budget: newBudget },
            workspace_id: resolver.workspaceIdForCampaign(campaignId) ?? workspaceId,
          });

          results.push({
            campaign_id: campaignId,
            old_budget: oldBudget / 100,
            new_budget: newBudget / 100,
          });
        } catch (err) {
          failed.push({
            campaign_id: campaignId,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        results,
        skipped,
        failed,
      });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
  } catch (err) {
    console.error(`[morning-brief/actions] ${action} failed:`, err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 }
    );
  }
}
