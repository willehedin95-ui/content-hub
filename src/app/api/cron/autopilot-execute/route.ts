import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { sendMessage } from "@/lib/telegram";
import { updateAdSet, updateCampaign, setMetaConfig } from "@/lib/meta";
import {
  computeStrategyGuide,
  type StrategyInput,
  type StrategyRecommendation,
  type AdSetDayRow,
  type CampaignInfo,
  type BudgetSnapshot,
} from "@/lib/strategy-engine";

export const maxDuration = 120;

const MAX_KILLS_PER_RUN = 5;
const DELAY_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dry_run") === "true";
  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  const db = createServerSupabase();

  try {
    // --- Fetch all workspaces with autopilot execution enabled ---
    const { data: allWorkspaces } = await db
      .from("workspaces")
      .select("id, slug, settings, meta_config");

    const workspaces = (allWorkspaces ?? []).filter((ws) => {
      const s = (ws.settings ?? {}) as Record<string, unknown>;
      return s.autopilot_auto_kill === true || s.autopilot_auto_budget === true;
    });

    if (workspaces.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "No workspaces with autopilot execution enabled" });
    }

    const multiWs = workspaces.length > 1;
    const allResults: Array<{ workspace: string; result: unknown }> = [];

    for (const workspace of workspaces) {
      const wsId = workspace.id;
      const label = multiWs ? `[${workspace.slug}] ` : "";
      const settings = (workspace.settings ?? {}) as Record<string, unknown>;
      const autoKill = settings.autopilot_auto_kill === true;
      const autoBudget = settings.autopilot_auto_budget === true;

      try {
        // Set Meta credentials for this workspace (crons have no cookies)
        if (workspace.meta_config) {
          setMetaConfig(workspace.meta_config as Parameters<typeof setMetaConfig>[0]);
        }

    // --- Gather strategy engine input ---
    const today = new Date().toISOString().slice(0, 10);

    // Pipeline settings for BE-ROAS and target CPA (scoped to workspace)
    const { data: pipelineSettings } = await db
      .from("pipeline_settings")
      .select("product, country, target_roas, target_cpa")
      .eq("workspace_id", wsId);

    const beRoasMap = new Map<string, number>();
    const targetCpaMap = new Map<string, number>();
    for (const s of pipelineSettings ?? []) {
      const key = `${s.product}:${s.country}`;
      if (s.target_roas != null) beRoasMap.set(key, s.target_roas);
      if (s.target_cpa != null) targetCpaMap.set(key, s.target_cpa);
    }

    // 30-day ad-set performance
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10);

    // Campaign mappings (scoped to workspace)
    const { data: campaignMappings } = await db
      .from("meta_campaign_mappings")
      .select("meta_campaign_id, country, product, format")
      .eq("workspace_id", wsId);

    const wsCampaignIds = (campaignMappings ?? []).map((m) => m.meta_campaign_id).filter(Boolean);
    if (wsCampaignIds.length === 0) {
      allResults.push({ workspace: workspace.slug, result: { skipped: true, reason: "No campaign mappings" } });
      continue;
    }

    // Fetch adset performance only for this workspace's campaigns
    const { data: adsetRows } = await db
      .from("meta_adset_performance")
      .select("*")
      .in("campaign_id", wsCampaignIds)
      .gte("date", thirtyDaysStr)
      .lte("date", today)
      .order("date", { ascending: false });

    if (!adsetRows?.length) {
      allResults.push({ workspace: workspace.slug, result: { skipped: true, reason: "No ad-set performance data" } });
      continue;
    }

    // Budget snapshots (7 days)
    const sevenDaysBack = new Date();
    sevenDaysBack.setDate(sevenDaysBack.getDate() - 6);
    const { data: budgetSnaps } = await db
      .from("campaign_budget_snapshots")
      .select("date, campaign_id, daily_budget")
      .in("campaign_id", wsCampaignIds)
      .gte("date", sevenDaysBack.toISOString().slice(0, 10))
      .order("date", { ascending: false });

    // Build campaign info
    const campaignInfoMap = new Map<string, CampaignInfo>();
    for (const m of campaignMappings ?? []) {
      if (!m.meta_campaign_id || campaignInfoMap.has(m.meta_campaign_id)) continue;
      const beRoas = beRoasMap.get(`${m.product}:${m.country}`) ?? 1.61;
      const targetCpa = targetCpaMap.get(`${m.product}:${m.country}`) ?? 400;

      const latestBudgetSnap = (budgetSnaps ?? []).find(
        (s: Record<string, unknown>) => s.campaign_id === m.meta_campaign_id
      );
      const dailyBudget = latestBudgetSnap
        ? Math.round(Number(latestBudgetSnap.daily_budget) / 100) // Meta stores in cents
        : 0;

      campaignInfoMap.set(m.meta_campaign_id, {
        campaign_id: m.meta_campaign_id,
        campaign_name: m.meta_campaign_id,
        daily_budget_sek: dailyBudget,
        market: m.country ?? "SE",
        format: (m.format === "video" ? "video" : "statics") as "statics" | "video",
        be_roas: beRoas,
        target_cpa: targetCpa,
      });
    }

    // Enrich campaign names from ad-set data
    for (const row of adsetRows) {
      const info = campaignInfoMap.get(row.campaign_id as string);
      if (info && info.campaign_name === info.campaign_id && row.campaign_name) {
        info.campaign_name = row.campaign_name as string;
      }
    }

    const adsetDayData: AdSetDayRow[] = adsetRows.map((r: Record<string, unknown>) => ({
      date: r.date as string,
      adset_id: r.adset_id as string,
      adset_name: (r.adset_name as string) ?? "",
      campaign_id: (r.campaign_id as string) ?? "",
      campaign_name: (r.campaign_name as string) ?? "",
      spend: Number(r.spend) || 0,
      purchases: Number(r.purchases) || 0,
      purchase_value: Number(r.purchase_value) || 0,
      roas: Number(r.roas) || 0,
      cpa: Number(r.cpa) || 0,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.clicks) || 0,
      ctr: Number(r.ctr) || 0,
      frequency: Number(r.frequency) || 0,
    }));

    const budgetSnapData: BudgetSnapshot[] = (budgetSnaps ?? []).map((s: Record<string, unknown>) => ({
      date: s.date as string,
      campaign_id: s.campaign_id as string,
      daily_budget: Number(s.daily_budget) || 0,
    }));

    const strategyInput: StrategyInput = {
      adset_days: adsetDayData,
      campaigns: Array.from(campaignInfoMap.values()),
      budget_snapshots: budgetSnapData,
      today,
    };

    // --- Run strategy engine ---
    const guide = computeStrategyGuide(strategyInput);

    // --- Execute recommendations ---
    const killActions: Array<{ name: string; reason: string; success: boolean; error?: string }> = [];
    const budgetActions: Array<{ name: string; oldBudget: number; newBudget: number; success: boolean; error?: string }> = [];
    const skippedActions: string[] = [];

    // Auto-kill
    if (autoKill) {
      const killRecs = guide.recommendations.filter(
        (r) => r.action === "kill_deadweight" &&
          (r.urgency === "critical" || r.urgency === "recommended") &&
          r.action_data?.adset_ids
      );

      let killCount = 0;
      for (const rec of killRecs) {
        const adsetIds = rec.action_data!.adset_ids as string[];
        for (const adsetId of adsetIds) {
          if (killCount >= MAX_KILLS_PER_RUN) break;

          // Find ad set name from breakdown
          const breakdown = guide.adset_breakdown.find((b) => b.adset_id === adsetId);
          const adsetName = breakdown?.adset_name ?? adsetId;

          if (dryRun) {
            killActions.push({ name: adsetName, reason: rec.title, success: true });
            killCount++;
            continue;
          }

          try {
            await updateAdSet(adsetId, { status: "PAUSED" });
            await sleep(DELAY_MS);

            await db.from("autopilot_actions").insert({
              workspace_id: wsId,
              action_type: "kill_adset",
              target_id: adsetId,
              target_name: adsetName,
              details: {
                recommendation_id: rec.id,
                recommendation_title: rec.title,
                reasoning: rec.reasoning,
                urgency: rec.urgency,
              },
              success: true,
            });

            killActions.push({ name: adsetName, reason: rec.title, success: true });
            killCount++;
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            killActions.push({ name: adsetName, reason: rec.title, success: false, error: errorMsg });

            await db.from("autopilot_actions").insert({
              workspace_id: wsId,
              action_type: "kill_adset",
              target_id: adsetId,
              target_name: adsetName,
              details: { recommendation_id: rec.id, urgency: rec.urgency },
              success: false,
              error_message: errorMsg,
            });
          }
        }
      }
    }

    // Auto-budget
    if (autoBudget) {
      const budgetRecs = guide.recommendations.filter(
        (r) => r.action === "increase_budget" &&
          r.urgency === "recommended" &&
          r.action_data?.campaign_id &&
          r.action_data?.new_budget
      );

      for (const rec of budgetRecs) {
        const campaignId = rec.action_data!.campaign_id as string;
        const newBudgetCents = rec.action_data!.new_budget as number;
        const campInfo = campaignInfoMap.get(campaignId);
        const campName = campInfo?.campaign_name ?? campaignId;
        const oldBudgetSek = campInfo?.daily_budget_sek ?? 0;
        const newBudgetSek = Math.round(newBudgetCents / 100);

        if (dryRun) {
          budgetActions.push({ name: campName, oldBudget: oldBudgetSek, newBudget: newBudgetSek, success: true });
          continue;
        }

        try {
          await updateCampaign(campaignId, { daily_budget: String(newBudgetCents) });
          await sleep(DELAY_MS);

          await db.from("autopilot_actions").insert({
            workspace_id: wsId,
            action_type: "increase_budget",
            target_id: campaignId,
            target_name: campName,
            details: {
              recommendation_id: rec.id,
              old_budget_sek: oldBudgetSek,
              new_budget_sek: newBudgetSek,
              change_pct: oldBudgetSek > 0 ? Math.round((newBudgetSek - oldBudgetSek) / oldBudgetSek * 100) : 0,
              reasoning: rec.reasoning,
            },
            success: true,
          });

          budgetActions.push({ name: campName, oldBudget: oldBudgetSek, newBudget: newBudgetSek, success: true });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          budgetActions.push({ name: campName, oldBudget: oldBudgetSek, newBudget: newBudgetSek, success: false, error: errorMsg });

          await db.from("autopilot_actions").insert({
            workspace_id: wsId,
            action_type: "increase_budget",
            target_id: campaignId,
            target_name: campName,
            details: { old_budget_sek: oldBudgetSek, new_budget_sek: newBudgetSek },
            success: false,
            error_message: errorMsg,
          });
        }
      }
    }

    // Collect skipped/FYI recommendations
    for (const rec of guide.recommendations) {
      if (rec.action === "hold_budget" || rec.urgency === "fyi") {
        skippedActions.push(`${rec.title}: ${rec.reasoning.slice(0, 80)}`);
      }
    }

    // --- Send Telegram digest ---
    if (chatId && (killActions.length > 0 || budgetActions.length > 0 || skippedActions.length > 0)) {
      const lines: string[] = [
        dryRun ? `🤖 ${label}Autopilot Daily Actions (DRY RUN)` : `🤖 ${label}Autopilot Daily Actions`,
        "",
      ];

      if (killActions.length > 0) {
        lines.push(`📉 Killed ${killActions.length} ad set${killActions.length > 1 ? "s" : ""}:`);
        for (const k of killActions) {
          const status = k.success ? "" : " ❌ FAILED";
          lines.push(`  - ${k.name} (${k.reason})${status}`);
        }
        lines.push("");
      }

      if (budgetActions.length > 0) {
        lines.push("📈 Budget changes:");
        for (const b of budgetActions) {
          const pct = b.oldBudget > 0 ? Math.round((b.newBudget - b.oldBudget) / b.oldBudget * 100) : 0;
          const status = b.success ? "" : " ❌ FAILED";
          lines.push(`  - ${b.name}: ${b.oldBudget} → ${b.newBudget} SEK (+${pct}%)${status}`);
        }
        lines.push("");
      }

      if (killActions.length === 0 && budgetActions.length === 0) {
        lines.push("💤 No actions needed today.");
        lines.push("");
      }

      if (skippedActions.length > 0) {
        lines.push("💡 Skipped (FYI):");
        for (const s of skippedActions.slice(0, 5)) {
          lines.push(`  - ${s}`);
        }
      }

      await sendMessage(chatId, lines.join("\n"));
    }

    allResults.push({
      workspace: workspace.slug,
      result: {
        headline: guide.headline,
        headline_tone: guide.headline_tone,
        kills: killActions,
        budget_changes: budgetActions,
        skipped: skippedActions,
      },
    });

      } catch (err) {
        console.error(`[Autopilot Execute] ${label}Error:`, err);
        if (chatId) {
          await sendMessage(chatId,
            `❌ ${label}Autopilot execute failed: ${err instanceof Error ? err.message : "Unknown error"}`
          ).catch(() => {});
        }
        allResults.push({ workspace: workspace.slug, result: { error: err instanceof Error ? err.message : "Unknown error" } });
      } finally {
        setMetaConfig(null);
      }
    } // end workspace loop

    return NextResponse.json({ ok: true, dry_run: dryRun, results: allResults });
  } catch (err) {
    setMetaConfig(null);
    console.error("[Autopilot Execute] Fatal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
