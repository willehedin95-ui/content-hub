import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/telegram";

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
  };
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

  return NextResponse.json({
    ok: true,
    data_date: briefData.data_date,
    message_length: message.length,
  });
}
