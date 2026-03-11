import { NextRequest, NextResponse } from "next/server";
import { sendMessage, sendMessageWithInlineKeyboard } from "@/lib/telegram";

export const maxDuration = 60;

interface BriefResponse {
  data_date: string;
  questions: {
    spend_pacing: {
      total_spend: number;
      total_purchases: number;
      total_revenue: number;
      blended_roas: number;
      campaigns: Array<{ campaign_name: string; spend: number; active_ads: number }>;
    };
    whats_running: { active_campaigns: number; total_active_ads: number };
    performance_trends: Array<{
      campaign_name: string;
      current_7d: { spend: number; revenue: number; purchases: number; roas: number; cpa: number; avg_ctr: number };
      previous_7d: { spend: number };
      trend: { roas: string; cpa: string };
    }>;
    winners_losers: {
      winners: Array<{ ad_name: string | null; campaign_name: string | null; roas: number; spend: number; purchases: number }>;
      losers: Array<{ ad_name: string | null; campaign_name: string | null; roas: number; spend: number }>;
    };
    fatigue_signals: {
      critical: Array<{ ad_name: string | null; campaign_name: string | null; signal: string; detail: string }>;
      warning: Array<{ ad_name: string | null; signal: string }>;
      monitor: Array<{ ad_name: string | null; signal: string }>;
    };
  };
  signals: {
    bleeders: Array<{ ad_name: string | null; campaign_name: string | null; days_bleeding: number; total_spend: number; avg_ctr: number }>;
    consistent_winners: Array<{ ad_name: string | null; campaign_name: string | null; consistent_days: number; avg_roas: number }>;
    lp_vs_creative_fatigue: Array<{ ad_name: string | null; diagnosis: string; detail: string }>;
    efficiency_scoring: Array<{
      campaign_name: string;
      efficiency_score: number;
      roas_7d: number;
      current_budget_share: number;
      recommended_budget_share: number;
      recommendation: string;
    }>;
    ad_diagnostics?: Array<{
      ad_name: string | null;
      bucket: string;
      ctr_7d: number;
      cpa_7d: number | null;
      spend_7d: number;
      purchases_7d: number;
      target_cpa: number | null;
    }>;
  };
  strategy?: {
    headline: string;
    headline_tone: "positive" | "cautious" | "warning";
    multi_window_kpis: Array<{
      campaign_name: string;
      market: string;
      w7: { roas: number; purchases: number };
      w14: { roas: number; purchases: number };
      w30: { roas: number; purchases: number };
      be_roas: number;
      daily_budget_sek: number;
      active_adsets: number;
    }>;
    recommendations: Array<{
      id: string;
      action: string;
      urgency: "critical" | "recommended" | "fyi";
      title: string;
      what_to_do: string;
      anti_panic?: string;
      action_data?: Record<string, unknown>;
    }>;
  } | null;
}

function arrow(trend: string): string {
  if (trend === "up") return "↗️";
  if (trend === "down") return "↘️";
  return "→";
}

function money(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function formatBrief(data: BriefResponse): string {
  const { spend_pacing, performance_trends, winners_losers, fatigue_signals } = data.questions;
  const { bleeders, consistent_winners, lp_vs_creative_fatigue, efficiency_scoring } = data.signals;

  const lines: string[] = [];

  // Header
  lines.push(`☀️ MORNING BRIEF — ${data.data_date}`);
  lines.push("");

  // KPI Summary
  lines.push("📊 YESTERDAY'S NUMBERS");
  lines.push(`  Spend: ${money(spend_pacing.total_spend)} | Purchases: ${spend_pacing.total_purchases} | Revenue: ${money(spend_pacing.total_revenue)}`);
  lines.push(`  ROAS: ${spend_pacing.blended_roas.toFixed(2)}x | CPA: ${spend_pacing.total_purchases > 0 ? money(spend_pacing.total_spend / spend_pacing.total_purchases) : "—"}`);
  lines.push("");

  // Campaign Trends
  lines.push("📈 CAMPAIGN TRENDS (7d)");
  for (const ct of performance_trends) {
    const rTrend = arrow(ct.trend.roas);
    const cpaTrend = arrow(ct.trend.cpa);
    lines.push(`  ${ct.campaign_name}`);
    lines.push(`    Spend: ${money(ct.current_7d.spend)} | ROAS: ${ct.current_7d.roas.toFixed(2)}x ${rTrend} | CPA: ${ct.current_7d.cpa > 0 ? money(ct.current_7d.cpa) : "—"} ${cpaTrend}`);
  }
  lines.push("");

  // Alerts — Critical fatigue
  const criticalCount = fatigue_signals.critical.length;
  const warningCount = fatigue_signals.warning.length;
  const bleederCount = bleeders.length;

  if (criticalCount > 0 || bleederCount > 0) {
    lines.push("🚨 ALERTS");
    for (const s of fatigue_signals.critical) {
      lines.push(`  ⚠️ ${s.ad_name || "Unnamed"} (${s.campaign_name}): ${s.detail}`);
    }
    for (const b of bleeders) {
      lines.push(`  🔥 BLEEDER: ${b.ad_name || "Unnamed"} (${b.campaign_name}) — ${b.days_bleeding}d, ${money(b.total_spend)} spent, CTR ${b.avg_ctr}%`);
    }
    lines.push("");
  }

  // LP vs Creative fatigue
  if (lp_vs_creative_fatigue.length > 0) {
    lines.push("🔍 FATIGUE DIAGNOSIS");
    for (const f of lp_vs_creative_fatigue) {
      const icon = f.diagnosis === "landing_page" ? "🌐" : "🎨";
      lines.push(`  ${icon} ${f.ad_name || "Unnamed"}: ${f.detail}`);
    }
    lines.push("");
  }

  // Ad diagnostics (structural)
  const diagnostics = data.signals.ad_diagnostics;
  if (diagnostics && diagnostics.length > 0) {
    const lpProblems = diagnostics.filter((d) => d.bucket === "landing_page_problem");
    const creativeProblems = diagnostics.filter((d) => d.bucket === "creative_problem");

    if (lpProblems.length > 0) {
      lines.push("");
      lines.push("🟣 LANDING PAGE PROBLEMS");
      lines.push("  High CTR but bad conversion — swap the page, not the ad");
      for (const d of lpProblems) {
        lines.push(`  • ${d.ad_name || "Unnamed"}: ${d.ctr_7d}% CTR, ${d.cpa_7d !== null ? d.cpa_7d + " kr CPA" : "0 sales"} (target: ${d.target_cpa} kr)`);
      }
    }

    if (creativeProblems.length > 0) {
      lines.push("");
      lines.push("🎨 WEAK HOOKS");
      lines.push("  Low CTR — need better creative");
      for (const d of creativeProblems) {
        lines.push(`  • ${d.ad_name || "Unnamed"}: ${d.ctr_7d}% CTR (bottom 25%), ${d.spend_7d} kr spent`);
      }
    }
  }

  // Winners
  if (winners_losers.winners.length > 0) {
    lines.push("🏆 TOP PERFORMERS (yesterday)");
    for (const w of winners_losers.winners.slice(0, 3)) {
      lines.push(`  ${w.ad_name || "Unnamed"} — ${w.roas.toFixed(1)}x ROAS, ${w.purchases} purchases`);
    }
    lines.push("");
  }

  // Consistent winners
  if (consistent_winners.length > 0) {
    lines.push("⭐ CONSISTENT WINNERS");
    for (const w of consistent_winners) {
      lines.push(`  ${w.ad_name || "Unnamed"} (${w.campaign_name}) — ${w.consistent_days}d streak, ${w.avg_roas.toFixed(2)}x avg ROAS`);
    }
    lines.push("");
  }

  // Losers
  const bigLosers = winners_losers.losers.filter((l) => l.spend > 50);
  if (bigLosers.length > 0) {
    lines.push("👎 UNDERPERFORMERS (>$50 spend, 0 ROAS)");
    for (const l of bigLosers.slice(0, 3)) {
      lines.push(`  ${l.ad_name || "Unnamed"} — ${money(l.spend)} spent, ${l.roas.toFixed(2)}x ROAS`);
    }
    lines.push("");
  }

  // Efficiency recommendations
  const shifts = efficiency_scoring.filter((e) => e.recommendation !== "maintain");
  if (shifts.length > 0) {
    lines.push("⚡ BUDGET RECOMMENDATIONS");
    for (const e of efficiency_scoring) {
      const icon = e.recommendation === "increase" ? "↑" : e.recommendation === "decrease" ? "↓" : "=";
      lines.push(`  ${icon} ${e.campaign_name}: ${e.current_budget_share}% → ${e.recommended_budget_share}% (eff: ${e.efficiency_score}, ROAS: ${e.roas_7d}x)`);
    }
    lines.push("");
  }

  // Creative refresh suggestions — when fatigue is detected, suggest generating fresh creative
  const creativeFatigueAds = lp_vs_creative_fatigue.filter((f) => f.diagnosis === "creative");
  const needsRefresh = [...fatigue_signals.critical, ...creativeFatigueAds];
  if (needsRefresh.length > 0) {
    const hubUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";
    lines.push("🔄 CREATIVE REFRESH NEEDED");
    const adNames = new Set<string>();
    for (const item of needsRefresh) {
      const name = item.ad_name || "Unnamed";
      if (!adNames.has(name)) {
        adNames.add(name);
        lines.push(`  • ${name}`);
      }
    }
    lines.push(`  → Generate fresh creatives: ${hubUrl}/brainstorm`);
    lines.push("");
  }

  // Strategy Guide
  const strategy = data.strategy;
  if (strategy) {
    lines.push("");
    const toneIcon = strategy.headline_tone === "positive" ? "🟢" : strategy.headline_tone === "cautious" ? "🟡" : "🔴";
    lines.push(`🛡️ STRATEGY GUIDE ${toneIcon}`);
    lines.push(`  ${strategy.headline}`);
    lines.push("");

    // Multi-window ROAS table
    if (strategy.multi_window_kpis.length > 0) {
      lines.push("  Campaign         | 7d    | 14d   | 30d   | BE");
      for (const kpi of strategy.multi_window_kpis) {
        const name = kpi.campaign_name.length > 16 ? kpi.campaign_name.slice(0, 15) + "…" : kpi.campaign_name.padEnd(16);
        const w7 = `${kpi.w7.roas.toFixed(1)}x`.padStart(5);
        const w14 = `${kpi.w14.roas.toFixed(1)}x`.padStart(5);
        const w30 = `${kpi.w30.roas.toFixed(1)}x`.padStart(5);
        const be = `${kpi.be_roas.toFixed(1)}x`.padStart(5);
        lines.push(`  ${name} |${w7} |${w14} |${w30} |${be}`);
      }
      lines.push("");
    }

    // Critical + recommended actions
    const criticalRecs = strategy.recommendations.filter((r) => r.urgency === "critical");
    const recommendedRecs = strategy.recommendations.filter((r) => r.urgency === "recommended");

    if (criticalRecs.length > 0) {
      for (const rec of criticalRecs) {
        lines.push(`  🔴 ${rec.title}`);
        lines.push(`     → ${rec.what_to_do}`);
        if (rec.anti_panic) {
          lines.push(`     💡 ${rec.anti_panic}`);
        }
      }
      lines.push("");
    }

    if (recommendedRecs.length > 0) {
      for (const rec of recommendedRecs) {
        lines.push(`  🟡 ${rec.title}`);
        lines.push(`     → ${rec.what_to_do}`);
      }
      lines.push("");
    }
  }

  // Summary counts
  const summaryParts = [];
  if (warningCount > 0) summaryParts.push(`${warningCount} warnings`);
  if (fatigue_signals.monitor.length > 0) summaryParts.push(`${fatigue_signals.monitor.length} monitoring`);
  if (summaryParts.length > 0) {
    lines.push(`ℹ️ Also: ${summaryParts.join(", ")}`);
  }

  lines.push("");
  lines.push(`👉 Full dashboard: ${process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app"}/morning-brief`);

  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (!chatId) {
    return NextResponse.json({ error: "TELEGRAM_NOTIFY_CHAT_ID not configured" }, { status: 400 });
  }

  // Fetch morning brief data from our own API using internal URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";
  const briefRes = await fetch(`${baseUrl}/api/morning-brief`, {
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });

  if (!briefRes.ok) {
    const err = await briefRes.text().catch(() => "");
    return NextResponse.json({ error: `Morning brief API failed: ${briefRes.status} ${err}` }, { status: 500 });
  }

  const briefData: BriefResponse = await briefRes.json();
  const message = formatBrief(briefData);

  await sendMessage(chatId, message, { disable_web_page_preview: true });

  // Send budget shift approval if there are recommendations
  const shifts = briefData.signals?.efficiency_scoring?.filter(
    (e) => e.recommendation !== "maintain"
  ) ?? [];

  let budgetMessageSent = false;
  if (shifts.length > 0) {
    const budgetLines = ["⚡ Budget shift recommendations ready:"];
    for (const s of briefData.signals.efficiency_scoring) {
      const icon = s.recommendation === "increase" ? "↑" : s.recommendation === "decrease" ? "↓" : "=";
      budgetLines.push(`  ${icon} ${s.campaign_name}: ${s.current_budget_share}% → ${s.recommended_budget_share}%`);
    }
    budgetLines.push("");
    budgetLines.push("Tap below to apply these budget shifts.");

    await sendMessageWithInlineKeyboard(
      chatId,
      budgetLines.join("\n"),
      [
        [
          { text: "✅ Apply Budget Shifts", callback_data: "budget_apply_all" },
          { text: "❌ Skip", callback_data: "budget_skip" },
        ],
      ],
      { disable_web_page_preview: true }
    );
    budgetMessageSent = true;
  }

  // Send winner graduation suggestions if there are consistent winners
  const winners = briefData.signals?.consistent_winners ?? [];
  let winnerMessageSent = false;
  if (winners.length > 0) {
    const winnerLines = ["⭐ Consistent winners — ready for graduation:"];
    for (const w of winners) {
      winnerLines.push(`  ${w.ad_name || "Unnamed"} (${w.campaign_name}) — ${w.consistent_days}d, ${w.avg_roas.toFixed(1)}x ROAS`);
    }
    winnerLines.push("");
    winnerLines.push("Graduating increases the ad set budget by 20%.");

    // Callback data is limited to 64 bytes, so use "graduate_all" for batch
    await sendMessageWithInlineKeyboard(
      chatId,
      winnerLines.join("\n"),
      [
        [
          { text: "🚀 Graduate All Winners", callback_data: "graduate_all" },
          { text: "❌ Skip", callback_data: "graduate_skip" },
        ],
      ],
      { disable_web_page_preview: true }
    );
    winnerMessageSent = true;
  }

  // Send strategy kill action if there are ad sets to kill
  let strategyMessageSent = false;
  const strategyData = briefData.strategy;
  if (strategyData) {
    const killRecs = strategyData.recommendations.filter(
      (r: { action: string; action_data?: Record<string, unknown> }) =>
        (r.action === "kill_deadweight" || r.action === "structure_warning") &&
        r.action_data?.adset_ids
    );
    if (killRecs.length > 0) {
      const allAdsetIds: string[] = [];
      const killLines = ["🛡️ Strategy recommends killing weak ad sets:"];
      for (const rec of killRecs) {
        killLines.push(`  • ${rec.title}`);
        const ids = rec.action_data?.adset_ids as string[] | undefined;
        if (ids) allAdsetIds.push(...ids);
      }
      killLines.push("");
      killLines.push(`Total: ${allAdsetIds.length} ad set(s) to kill.`);

      // Store IDs in callback data (64 byte limit) — use a lookup approach
      // Since callback_data is limited, just use "strategy_kill_all" and re-fetch from API
      await sendMessageWithInlineKeyboard(
        chatId,
        killLines.join("\n"),
        [
          [
            { text: `🗑 Kill ${allAdsetIds.length} ad sets`, callback_data: "strategy_kill_all" },
            { text: "❌ Skip", callback_data: "strategy_skip" },
          ],
        ],
        { disable_web_page_preview: true }
      );
      strategyMessageSent = true;
    }
  }

  return NextResponse.json({
    ok: true,
    data_date: briefData.data_date,
    message_length: message.length,
    budget_message_sent: budgetMessageSent,
    winner_message_sent: winnerMessageSent,
    strategy_message_sent: strategyMessageSent,
  });
}
