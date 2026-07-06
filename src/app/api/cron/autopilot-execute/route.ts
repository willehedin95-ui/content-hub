import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { sendMessage, isTelegramDisabled } from "@/lib/telegram";
import { updateAdSet, updateCampaign, setMetaConfig, pauseAdSetAndAds, runWithMetaConfig } from "@/lib/meta";
import { startCronRun, completeCronRun, failCronRun } from "@/lib/cron-tracker";
import {
  computeStrategyGuide,
  type StrategyInput,
  type StrategyRecommendation,
  type AdSetDayRow,
  type CampaignInfo,
  type BudgetSnapshot,
} from "@/lib/strategy-engine";

export const maxDuration = 800;

const MAX_KILLS_PER_RUN = 10;
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
  const cronRunId = await startCronRun("autopilot-execute");

  try {
    // --- Fetch all workspaces with autopilot execution enabled ---
    const { data: allWorkspaces } = await db
      .from("workspaces")
      .select("id, slug, settings, meta_config");

    const workspaces = (allWorkspaces ?? []).filter((ws) => {
      if (isTelegramDisabled(ws)) return false;
      const s = (ws.settings ?? {}) as Record<string, unknown>;
      return s.autopilot_auto_kill === true || s.autopilot_auto_budget === true || s.autopilot_auto_iterate === true;
    });

    if (workspaces.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "No workspaces with autopilot execution enabled" });
    }

    const multiWs = workspaces.length > 1;
    const allResults: Array<{ workspace: string; result: unknown }> = [];
    const wsActionResults: WsActions[] = [];

    for (const workspace of workspaces) {
      const wsId = workspace.id;
      const label = multiWs ? `[${workspace.slug}] ` : "";
      const settings = (workspace.settings ?? {}) as Record<string, unknown>;
      const autoKill = settings.autopilot_auto_kill === true;
      const autoBudget = settings.autopilot_auto_budget === true;

      try {
        // Set Meta credentials for this workspace (crons have no cookies).
        // Money-writing calls below ALSO run inside runWithMetaConfig so a
        // concurrent request swapping the module global can never redirect a
        // kill/budget-change into the wrong ad account.
        const wsMetaConfig = (workspace.meta_config ?? null) as Parameters<typeof runWithMetaConfig>[0];
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
    const killActions: Array<{ name: string; reason: string; success: boolean; error?: string; spend7d?: number; purchases7d?: number; daysRunning?: number | null }> = [];
    const budgetActions: Array<{ name: string; oldBudget: number; newBudget: number; success: boolean; error?: string }> = [];
    const skippedActions: string[] = [];

    // Auto-kill
    if (autoKill) {
      const killRecs = guide.recommendations.filter(
        (r) => r.action === "kill_deadweight" &&
          (r.urgency === "critical" || r.urgency === "recommended") &&
          r.action_data?.adset_ids
      );

      // Skip ad sets already killed in last 7 days to avoid redundant pauses
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentKills } = await db
        .from("autopilot_actions")
        .select("target_id")
        .eq("workspace_id", wsId)
        .eq("action_type", "kill_adset")
        .eq("success", true)
        .gte("created_at", sevenDaysAgo);
      const recentlyKilledIds = new Set((recentKills ?? []).map((k) => k.target_id));

      let killCount = 0;
      for (const rec of killRecs) {
        const adsetIds = rec.action_data!.adset_ids as string[];
        for (const adsetId of adsetIds) {
          if (killCount >= MAX_KILLS_PER_RUN) break;

          // Skip if already killed recently
          if (recentlyKilledIds.has(adsetId)) {
            skippedActions.push(`${adsetId} (already killed recently)`);
            continue;
          }

          // Find ad set name from breakdown
          const breakdown = guide.adset_breakdown.find((b) => b.adset_id === adsetId);
          const adsetName = breakdown?.adset_name ?? adsetId;

          if (dryRun) {
            killActions.push({ name: adsetName, reason: rec.title, success: true, spend7d: breakdown?.spend_7d, purchases7d: breakdown?.purchases_7d, daysRunning: breakdown?.days_running });
            killCount++;
            continue;
          }

          try {
            await runWithMetaConfig(wsMetaConfig, () => pauseAdSetAndAds(adsetId));
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

            killActions.push({ name: adsetName, reason: rec.title, success: true, spend7d: breakdown?.spend_7d, purchases7d: breakdown?.purchases_7d, daysRunning: breakdown?.days_running });
            killCount++;

            // 2026-04-16: Real-time Telegram alert per kill so the user learns
            // immediately — not buried in the next daily digest. Includes the
            // before-state (spend, purchases, days) and the strategy reasoning
            // so they can review and un-pause if it was a false positive.
            // See resilience-audit-2026-04-16.md (P0-4).
            if (chatId && !dryRun) {
              try {
                await sendMessage(
                  chatId,
                  formatKillAlert({
                    workspaceLabel: label,
                    adsetName,
                    adsetId,
                    reason: rec.title,
                    reasoning: rec.reasoning,
                    urgency: rec.urgency,
                    spend7d: breakdown?.spend_7d,
                    purchases7d: breakdown?.purchases_7d,
                    daysRunning: breakdown?.days_running,
                    success: true,
                  }),
                  { parse_mode: "HTML" },
                );
              } catch (tgErr) {
                console.error("[autopilot-execute] Kill alert Telegram failed:", tgErr);
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            killActions.push({ name: adsetName, reason: rec.title, success: false, spend7d: breakdown?.spend_7d, purchases7d: breakdown?.purchases_7d, daysRunning: breakdown?.days_running });

            await db.from("autopilot_actions").insert({
              workspace_id: wsId,
              action_type: "kill_adset",
              target_id: adsetId,
              target_name: adsetName,
              details: { recommendation_id: rec.id, urgency: rec.urgency },
              success: false,
              error_message: errorMsg,
            });

            // Also alert on failures so partial kills don't hide
            if (chatId && !dryRun) {
              try {
                await sendMessage(
                  chatId,
                  formatKillAlert({
                    workspaceLabel: label,
                    adsetName,
                    adsetId,
                    reason: rec.title,
                    reasoning: rec.reasoning,
                    urgency: rec.urgency,
                    spend7d: breakdown?.spend_7d,
                    purchases7d: breakdown?.purchases_7d,
                    daysRunning: breakdown?.days_running,
                    success: false,
                    errorMsg,
                  }),
                  { parse_mode: "HTML" },
                );
              } catch (tgErr) {
                console.error("[autopilot-execute] Kill alert Telegram failed:", tgErr);
              }
            }
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
          await runWithMetaConfig(wsMetaConfig, () => updateCampaign(campaignId, { daily_budget: String(newBudgetCents) }));
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

    // --- Pipeline status for digest ---
    const { data: pipelineJobs } = await db
      .from("image_jobs")
      .select("status, launchpad_priority")
      .eq("workspace_id", wsId)
      .in("status", ["ready", "completed", "translating", "processing"]);

    const { data: launchpadMarkets } = await db
      .from("image_job_markets")
      .select("image_job_id")
      .not("launchpad_priority", "is", null)
      .gt("launchpad_priority", 0);

    // Count active ad sets from today's performance data
    const uniqueActiveAdSets = new Set(
      (adsetRows ?? [])
        .filter((r: Record<string, unknown>) => r.date === today)
        .map((r: Record<string, unknown>) => r.adset_id as string)
    );

    const pipeline: PipelineStatus = {
      awaitingApproval: (pipelineJobs ?? []).filter(j => j.status === "ready").length,
      onLaunchpad: new Set((launchpadMarkets ?? []).map(m => m.image_job_id)).size,
      inTranslation: (pipelineJobs ?? []).filter(j => j.status === "translating" || j.status === "processing").length,
      activeAdSets: uniqueActiveAdSets.size,
    };

    // Collect actions for combined digest (sent after workspace loop with morning brief)
    wsActionResults.push({
      label,
      slug: workspace.slug,
      killActions,
      budgetActions,
      skippedActions,
      dryRun,
      pipeline,
    });

    // --- Auto-iterate fatiguing concepts ---
    let iterateResult: { iterated: boolean; jobId?: string; reason?: string } | null = null;
    if (settings.autopilot_auto_iterate === true && !dryRun) {
      try {
        const { detectAndIterateFatiguingConcepts } = await import("@/lib/autopilot-iterate");
        iterateResult = await detectAndIterateFatiguingConcepts(wsId, db, chatId);
        if (iterateResult?.iterated) {
          console.log(`[Autopilot Execute] ${label}Iterated concept: ${iterateResult.jobId}`);
        }
      } catch (err) {
        console.error(`[Autopilot Execute] ${label}Iteration failed:`, err);
      }
    }

    allResults.push({
      workspace: workspace.slug,
      result: {
        headline: guide.headline,
        headline_tone: guide.headline_tone,
        kills: killActions,
        budget_changes: budgetActions,
        skipped: skippedActions,
        iterate: iterateResult,
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

    // --- Combined daily digest: morning brief + autopilot actions ---
    if (chatId && !dryRun) {
      try {
        await sendCombinedDailyDigest(chatId, wsActionResults);
      } catch (err) {
        console.error("[Autopilot Execute] Combined digest failed:", err);
      }
    } else if (chatId && dryRun) {
      // In dry-run mode, just send autopilot actions without morning brief
      for (const ws of wsActionResults) {
        const lines = formatAutopilotActions(ws);
        if (lines.length > 0) {
          await sendMessage(chatId, lines.join("\n"));
        }
      }
    }

    await completeCronRun(cronRunId, `${allResults.length} workspace(s) processed`);
    return NextResponse.json({ ok: true, dry_run: dryRun, results: allResults });
  } catch (err) {
    setMetaConfig(null);
    console.error("[Autopilot Execute] Fatal error:", err);
    await failCronRun(cronRunId, err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// --- Combined daily digest helpers ---

type PipelineStatus = {
  awaitingApproval: number;
  onLaunchpad: number;
  inTranslation: number;
  activeAdSets: number;
};

type WsActions = {
  label: string;
  slug: string;
  killActions: Array<{ name: string; reason: string; success: boolean; spend7d?: number; purchases7d?: number; daysRunning?: number | null }>;
  budgetActions: Array<{ name: string; oldBudget: number; newBudget: number; success: boolean }>;
  skippedActions: string[];
  dryRun: boolean;
  pipeline?: PipelineStatus;
};

function formatAutopilotActions(ws: WsActions): string[] {
  const { label, killActions, budgetActions, skippedActions, dryRun } = ws;
  const lines: string[] = [];

  if (killActions.length === 0 && budgetActions.length === 0 && skippedActions.length === 0) {
    return lines;
  }

  lines.push(dryRun ? `🤖 ${label}Autopilot Actions (DRY RUN)` : `🤖 ${label}Autopilot Actions`);

  if (killActions.length > 0) {
    lines.push(`  📉 Killed ${killActions.length} ad set${killActions.length > 1 ? "s" : ""}:`);
    for (const k of killActions) {
      const status = k.success ? "" : " ❌ FAILED";
      // Show spend + purchases + days so user understands WHY it was killed
      const metrics: string[] = [];
      if (k.spend7d != null) metrics.push(`${Math.round(k.spend7d)} SEK`);
      if (k.purchases7d != null) metrics.push(`${k.purchases7d} conv`);
      if (k.daysRunning != null) metrics.push(`${k.daysRunning}d`);
      const metricsStr = metrics.length > 0 ? ` [${metrics.join(", ")}]` : "";
      lines.push(`    - ${k.name}${metricsStr}${status}`);
    }
  }

  if (budgetActions.length > 0) {
    lines.push("  📈 Budget changes:");
    for (const b of budgetActions) {
      const pct = b.oldBudget > 0 ? Math.round((b.newBudget - b.oldBudget) / b.oldBudget * 100) : 0;
      const status = b.success ? "" : " ❌ FAILED";
      lines.push(`    - ${b.name}: ${b.oldBudget} → ${b.newBudget} SEK (+${pct}%)${status}`);
    }
  }

  if (killActions.length === 0 && budgetActions.length === 0) {
    lines.push("  💤 No actions needed today.");
  }

  return lines;
}

function money(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n.toFixed(0)}`;
}

/** Minimal HTML escape for Telegram parse_mode=HTML */
function htmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Format a real-time kill alert for Telegram.
 * 2026-04-16: Added so the user learns about each auto-kill immediately rather
 * than waiting for the daily digest. Includes the strategy engine's reasoning
 * + before-state so they can un-pause in Ads Manager if it's a false positive.
 */
function formatKillAlert(input: {
  workspaceLabel: string;
  adsetName: string;
  adsetId: string;
  reason: string;
  reasoning?: string;
  urgency: string;
  spend7d?: number;
  purchases7d?: number;
  daysRunning?: number | null;
  success: boolean;
  errorMsg?: string;
}): string {
  const {
    workspaceLabel,
    adsetName,
    adsetId,
    reason,
    reasoning,
    urgency,
    spend7d,
    purchases7d,
    daysRunning,
    success,
    errorMsg,
  } = input;

  const header = success
    ? `🛑 <b>${htmlEsc(workspaceLabel)}Autopilot killed ad set</b>`
    : `⚠️ <b>${htmlEsc(workspaceLabel)}Autopilot kill FAILED</b>`;

  const metrics: string[] = [];
  if (spend7d != null) metrics.push(`${Math.round(spend7d)} SEK spend`);
  if (purchases7d != null) metrics.push(`${purchases7d} purch`);
  if (daysRunning != null) metrics.push(`${daysRunning}d old`);

  const lines = [
    header,
    ``,
    `<b>${htmlEsc(adsetName)}</b>`,
    `Reason: ${htmlEsc(reason)}`,
    `Urgency: ${htmlEsc(urgency)}`,
  ];
  if (metrics.length > 0) {
    lines.push(`7d: ${htmlEsc(metrics.join(" • "))}`);
  }
  if (reasoning) {
    lines.push(``);
    lines.push(`<i>${htmlEsc(reasoning)}</i>`);
  }
  if (!success && errorMsg) {
    lines.push(``);
    lines.push(`Error: <code>${htmlEsc(errorMsg.slice(0, 400))}</code>`);
  }
  lines.push(``);
  lines.push(`<code>adset_id=${htmlEsc(adsetId)}</code>`);

  return lines.join("\n");
}

function arrow(trend: string): string {
  if (trend === "up") return "↗️";
  if (trend === "down") return "↘️";
  return "→";
}

async function sendCombinedDailyDigest(
  chatId: string,
  wsActions: WsActions[]
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";
  const cronSecret = process.env.CRON_SECRET;

  const lines: string[] = [];

  // --- Morning brief section ---
  try {
    const briefRes = await fetch(`${baseUrl}/api/morning-brief`, {
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
    });

    if (briefRes.ok) {
      const data = await briefRes.json();
      const sp = data.questions?.spend_pacing;
      const trends = data.questions?.performance_trends ?? [];
      const strategy = data.strategy;

      // Header
      lines.push(`☀️ DAILY DIGEST — ${data.data_date}`);
      lines.push("");

      // KPI summary
      if (sp) {
        const cpa = sp.total_purchases > 0 ? money(sp.total_spend / sp.total_purchases) : "—";
        lines.push(`📊 Spend: ${money(sp.total_spend)} SEK | Purchases: ${sp.total_purchases} | Revenue: ${money(sp.total_revenue)} SEK`);
        lines.push(`   ROAS: ${sp.blended_roas.toFixed(2)}x | CPA: ${cpa} SEK`);
        lines.push("");
      }

      // Campaign trends (condensed)
      if (trends.length > 0) {
        lines.push("📈 Campaigns (7d):");
        for (const ct of trends) {
          const name = ct.campaign_name.length > 25 ? ct.campaign_name.slice(0, 24) + "…" : ct.campaign_name;
          lines.push(`  ${name}: ${ct.current_7d.roas.toFixed(1)}x ${arrow(ct.trend.roas)} | ${money(ct.current_7d.spend)} SEK`);
        }
        lines.push("");
      }

      // Alerts (critical only)
      const criticals = data.questions?.fatigue_signals?.critical ?? [];
      const bleeders = data.signals?.bleeders ?? [];
      if (criticals.length > 0 || bleeders.length > 0) {
        lines.push("🚨 Alerts:");
        for (const s of criticals.slice(0, 3)) {
          lines.push(`  ⚠️ ${s.ad_name || "Unnamed"}: ${s.detail}`);
        }
        for (const b of bleeders.slice(0, 3)) {
          lines.push(`  🔥 ${b.ad_name || "Unnamed"} — ${b.days_bleeding}d bleeding, ${money(b.total_spend)} SEK`);
        }
        lines.push("");
      }

      // Strategy headline
      if (strategy) {
        const tone = strategy.headline_tone === "positive" ? "🟢" : strategy.headline_tone === "cautious" ? "🟡" : "🔴";
        lines.push(`${tone} ${strategy.headline}`);
        lines.push("");
      }

      // Top performers
      const winners = data.questions?.winners_losers?.winners ?? [];
      if (winners.length > 0) {
        lines.push("🏆 Top:");
        for (const w of winners.slice(0, 2)) {
          lines.push(`  ${w.ad_name || "Unnamed"} — ${w.roas.toFixed(1)}x, ${w.purchases} purchases`);
        }
        lines.push("");
      }
    }
  } catch (err) {
    console.error("[Daily Digest] Morning brief fetch failed:", err);
    lines.push("☀️ DAILY DIGEST");
    lines.push("⚠️ Morning brief data unavailable");
    lines.push("");
  }

  // --- Pipeline status per workspace ---
  const pipelineWorkspaces = wsActions.filter(ws => ws.pipeline);
  if (pipelineWorkspaces.length > 0) {
    lines.push("📦 Pipeline:");
    for (const ws of pipelineWorkspaces) {
      const p = ws.pipeline!;
      const parts: string[] = [];
      if (p.activeAdSets > 0) parts.push(`${p.activeAdSets} active`);
      if (p.onLaunchpad > 0) parts.push(`${p.onLaunchpad} on launchpad`);
      if (p.inTranslation > 0) parts.push(`${p.inTranslation} translating`);
      if (p.awaitingApproval > 0) parts.push(`⏳ ${p.awaitingApproval} awaiting approval`);

      const prefix = pipelineWorkspaces.length > 1 ? `  [${ws.slug}] ` : "  ";
      lines.push(`${prefix}${parts.join(" | ")}`);

      // Alert if nothing in pipeline
      if (p.onLaunchpad === 0 && p.inTranslation === 0 && p.awaitingApproval === 0) {
        lines.push(`${prefix}⚠️ Pipeline empty — no concepts queued`);
      }
    }
    lines.push("");
  }

  // --- Autopilot actions section ---
  for (const ws of wsActions) {
    const actionLines = formatAutopilotActions(ws);
    if (actionLines.length > 0) {
      lines.push(...actionLines);
      lines.push("");
    }
  }

  // Footer
  lines.push(`👉 ${baseUrl}`);

  if (lines.length > 2) {
    await sendMessage(chatId, lines.join("\n"), { disable_web_page_preview: true });
  }
}
