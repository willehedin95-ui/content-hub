import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { sendMessage } from "@/lib/telegram";

export const maxDuration = 60;

// A previously-earning ad set must have made at least this much revenue in
// the last 30 days to be considered "worth watching" for this alert.
const MIN_30D_REVENUE = 500;

// An ad set is flagged if it earned on at least this many days in the last
// 30 — avoids noise from one-day flukes.
const MIN_ACTIVE_DAYS_IN_WINDOW = 3;

// Number of trailing days that must show zero spend (we skip today since
// Meta data sync lags ~2-6 hours and today's row may not exist yet).
const ZERO_SPEND_DAYS: number = 2;

/**
 * Safety-net cron: alerts when a previously-earning ad set suddenly goes
 * dark. Catches situations like:
 *   - Auto-pause-bleeders killed a real winner by mistake
 *   - Meta stopped delivering after a creative rejection
 *   - Budget change or account-level issue caused zero spend
 *   - Ad got manually paused and forgotten
 *
 * Logic:
 *   1. Take the last 30 days of ad-set performance.
 *   2. Identify ad sets that earned at least MIN_30D_REVENUE over that
 *      window, spread across at least MIN_ACTIVE_DAYS_IN_WINDOW days.
 *   3. For each, check the trailing ZERO_SPEND_DAYS window (excluding
 *      today). If total spend in that window is 0 → flag it.
 *   4. Send a Telegram alert grouped by workspace.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Date math — use UTC, skip today (Meta sync lag), look back 30 days.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);
  const zeroWindowStart = new Date(today);
  zeroWindowStart.setUTCDate(today.getUTCDate() - ZERO_SPEND_DAYS);
  const monthStart = new Date(today);
  monthStart.setUTCDate(today.getUTCDate() - 30);

  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const zeroStartStr = zeroWindowStart.toISOString().slice(0, 10);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Pull 30 days of ad-set perf
  const { data: rows, error } = await db
    .from("meta_adset_performance")
    .select("date, adset_id, adset_name, campaign_id, campaign_name, spend, purchase_value, purchases")
    .gte("date", monthStartStr)
    .lte("date", yesterdayStr);

  if (error) {
    console.error("[zero-spend-alert] DB error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, flagged: 0, message: "No adset rows in window" });
  }

  // Aggregate per ad set
  interface AdsetStats {
    adset_id: string;
    adset_name: string;
    campaign_id: string;
    campaign_name: string;
    total_spend: number;
    total_revenue: number;
    total_purchases: number;
    active_days: number;
    zero_window_spend: number;
    last_active_date: string | null;
  }

  const adsetMap = new Map<string, AdsetStats>();

  for (const r of rows) {
    const key = r.adset_id as string;
    if (!adsetMap.has(key)) {
      adsetMap.set(key, {
        adset_id: r.adset_id as string,
        adset_name: (r.adset_name as string) ?? "",
        campaign_id: (r.campaign_id as string) ?? "",
        campaign_name: (r.campaign_name as string) ?? "",
        total_spend: 0,
        total_revenue: 0,
        total_purchases: 0,
        active_days: 0,
        zero_window_spend: 0,
        last_active_date: null,
      });
    }
    const stats = adsetMap.get(key)!;
    const spend = Number(r.spend) || 0;
    const revenue = Number(r.purchase_value) || 0;
    const purchases = Number(r.purchases) || 0;

    stats.total_spend += spend;
    stats.total_revenue += revenue;
    stats.total_purchases += purchases;

    if (spend > 0) {
      stats.active_days += 1;
      if (!stats.last_active_date || (r.date as string) > stats.last_active_date) {
        stats.last_active_date = r.date as string;
      }
    }

    // Trailing zero-spend window
    if ((r.date as string) >= zeroStartStr) {
      stats.zero_window_spend += spend;
    }
  }

  // Filter: previously earning + now dark
  const flagged = [...adsetMap.values()].filter((s) => {
    if (s.total_revenue < MIN_30D_REVENUE) return false;
    if (s.active_days < MIN_ACTIVE_DAYS_IN_WINDOW) return false;
    if (s.zero_window_spend > 0) return false; // still spending
    return true;
  });

  if (flagged.length === 0) {
    return NextResponse.json({ ok: true, flagged: 0, message: "No previously-earning ad sets went dark" });
  }

  // Check which flagged ad sets are currently paused (vs. active but not delivering).
  // Manually paused ones are expected — skip them. Active-but-not-delivering is
  // the real alert signal.
  const { data: adsetRows } = await db
    .from("meta_campaigns")
    .select("meta_adset_id, status, workspace_id")
    .in(
      "meta_adset_id",
      flagged.map((f) => f.adset_id),
    );

  const statusMap = new Map<string, { status: string; workspace_id: string }>();
  for (const row of adsetRows ?? []) {
    if (row.meta_adset_id) {
      statusMap.set(row.meta_adset_id as string, {
        status: (row.status as string) ?? "unknown",
        workspace_id: (row.workspace_id as string) ?? "",
      });
    }
  }

  // Fetch workspace names
  const workspaceIds = [...new Set([...statusMap.values()].map((s) => s.workspace_id).filter(Boolean))];
  const { data: workspaces } = workspaceIds.length > 0
    ? await db.from("workspaces").select("id, name").in("id", workspaceIds)
    : { data: [] };
  const wsNames = new Map((workspaces ?? []).map((w) => [w.id, w.name as string]));

  // Check for recent auto-pause by us (in case auto-pause-bleeders killed it)
  const { data: autoPaused } = await db
    .from("auto_paused_ads")
    .select("meta_ad_id, ad_name, adset_id, reason, created_at")
    .in(
      "adset_id",
      flagged.map((f) => f.adset_id),
    )
    .gte("created_at", monthStart.toISOString());

  const autoPauseMap = new Map<string, { reason: string; when: string }>();
  for (const ap of autoPaused ?? []) {
    if (ap.adset_id) {
      autoPauseMap.set(ap.adset_id as string, {
        reason: (ap.reason as string) ?? "",
        when: ((ap.created_at as string) ?? "").slice(0, 10),
      });
    }
  }

  // Build alert message
  const byWorkspace = new Map<string, typeof flagged>();
  const unknownWs: typeof flagged = [];

  for (const f of flagged) {
    const info = statusMap.get(f.adset_id);
    const wsId = info?.workspace_id;
    if (!wsId) {
      unknownWs.push(f);
      continue;
    }
    if (!byWorkspace.has(wsId)) byWorkspace.set(wsId, []);
    byWorkspace.get(wsId)!.push(f);
  }

  const lines: string[] = [];
  const daySuffix: string = ZERO_SPEND_DAYS === 1 ? "" : "s";
  lines.push(`⚠️ Zero-Spend Safety Net`);
  lines.push("");
  lines.push(
    `${flagged.length} previously-earning ad set${flagged.length === 1 ? "" : "s"} spent 0 SEK in the last ${ZERO_SPEND_DAYS} day${daySuffix}.`,
  );
  lines.push("");

  for (const [wsId, items] of byWorkspace) {
    const wsName = wsNames.get(wsId) ?? "?";
    lines.push(`*${wsName}*`);
    for (const f of items.slice(0, 10)) {
      const roas = f.total_spend > 0 ? (f.total_revenue / f.total_spend).toFixed(2) : "∞";
      const info = statusMap.get(f.adset_id);
      const status = info?.status ?? "unknown";
      const auto = autoPauseMap.get(f.adset_id);
      const name = f.adset_name.slice(0, 50);
      lines.push(`  • ${name}`);
      lines.push(
        `    30d: ${Math.round(f.total_spend)} SEK → ${Math.round(f.total_revenue)} SEK (${roas}x, ${f.total_purchases} purch, ${f.active_days}d active)`,
      );
      lines.push(`    Last active: ${f.last_active_date ?? "unknown"} | Status: ${status}`);
      if (auto) {
        lines.push(`    ⚠️ Auto-paused ${auto.when}: ${auto.reason.slice(0, 100)}`);
      }
    }
    if (items.length > 10) {
      lines.push(`  … and ${items.length - 10} more`);
    }
    lines.push("");
  }

  if (unknownWs.length > 0) {
    lines.push(`*Unknown workspace* (${unknownWs.length} ad sets)`);
    for (const f of unknownWs.slice(0, 5)) {
      lines.push(`  • ${f.adset_name.slice(0, 50)} (30d rev: ${Math.round(f.total_revenue)} SEK)`);
    }
  }

  lines.push("Check if these are intentional pauses, creative rejections, or stuck delivery.");

  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (chatId) {
    await sendMessage(chatId, lines.join("\n"));
  }

  return NextResponse.json({
    ok: true,
    flagged: flagged.length,
    workspaces: byWorkspace.size,
    items: flagged.map((f) => ({
      adset_id: f.adset_id,
      adset_name: f.adset_name,
      total_revenue: f.total_revenue,
      total_spend: f.total_spend,
      active_days: f.active_days,
      last_active_date: f.last_active_date,
      status: statusMap.get(f.adset_id)?.status,
      auto_paused: autoPauseMap.get(f.adset_id),
    })),
  });
}
