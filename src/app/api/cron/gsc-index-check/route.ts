import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { listSitemaps, getSitemapStats } from "@/lib/gsc";
import { sendTelegramNotification } from "@/lib/telegram";

// Weekly cron: pull sitemap stats from GSC per property. Track submitted vs
// indexed counts in gsc_index_stats. Alert if indexed drops >10% week-over-week
// (signals deindexing event - typically due to broken canonical, robots
// changes, or Google deindexing low-quality content).
//
// Cron: Mondays 06:45 UTC (after gsc-sync at 05:00 and gsc-gap-refresh at 06:00).

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Collect unique GSC properties across all workspaces (multiple workspaces
  // may share a property like halsobladet.com)
  const { data: workspaces } = await db.from("workspaces").select("settings");
  const properties = new Set<string>();
  for (const ws of workspaces ?? []) {
    const settings = (ws.settings ?? {}) as Record<string, unknown>;
    const gscProps = (settings.gsc_properties as Array<{ property: string }>) ?? [];
    for (const p of gscProps) {
      if (p.property) properties.add(p.property);
    }
  }

  const results: Array<{
    property: string;
    sitemapPath: string;
    submitted: number;
    indexed: number;
    indexationRate: number;
    weekOverWeekChange: number | null;
    errors: number;
    warnings: number;
  }> = [];

  for (const property of properties) {
    const sitemaps = await listSitemaps(property);
    for (const sm of sitemaps) {
      if (!sm.path) continue;
      const stats = await getSitemapStats(property, sm.path);
      if (!stats) continue;

      // Compare against last record from a week ago for trend
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data: prevRows } = await db
        .from("gsc_index_stats")
        .select("indexed, checked_at")
        .eq("property", property)
        .eq("sitemap_path", sm.path)
        .lte("checked_at", weekAgo)
        .order("checked_at", { ascending: false })
        .limit(1);
      const prevIndexed = prevRows?.[0]?.indexed as number | undefined;
      const wow = prevIndexed && prevIndexed > 0
        ? Math.round(((stats.indexed - prevIndexed) / prevIndexed) * 100)
        : null;

      // Insert today's measurement
      await db.from("gsc_index_stats").insert({
        property,
        sitemap_path: sm.path,
        submitted: stats.submitted,
        indexed: stats.indexed,
        errors: stats.errors,
        warnings: stats.warnings,
        last_submitted: stats.lastSubmitted,
      });

      results.push({
        property,
        sitemapPath: sm.path,
        submitted: stats.submitted,
        indexed: stats.indexed,
        indexationRate: stats.submitted > 0 ? Math.round((stats.indexed / stats.submitted) * 100) : 0,
        weekOverWeekChange: wow,
        errors: stats.errors,
        warnings: stats.warnings,
      });
    }
  }

  // Telegram summary - always send (this is the visibility we need)
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId && results.length > 0) {
      const dropped = results.filter((r) => r.weekOverWeekChange !== null && r.weekOverWeekChange <= -10);
      const concerning = results.filter((r) => r.errors > 0 || r.warnings > 5);

      const allLines = results.map((r) => {
        const wowStr = r.weekOverWeekChange === null
          ? ""
          : ` (${r.weekOverWeekChange > 0 ? "+" : ""}${r.weekOverWeekChange}% WoW)`;
        const errStr = r.errors > 0 ? ` ⛔${r.errors}err` : "";
        const warnStr = r.warnings > 0 ? ` ⚠️${r.warnings}warn` : "";
        const host = r.property.replace("sc-domain:", "").replace(/^https?:\/\//, "").replace(/\/$/, "");
        return `${host}: ${r.indexed}/${r.submitted} indexed (${r.indexationRate}%)${wowStr}${errStr}${warnStr}`;
      });

      const header = dropped.length > 0
        ? `📉 *Indexation dropped on ${dropped.length} properties*`
        : concerning.length > 0
        ? `⚠️ *Indexation check - errors/warnings detected*`
        : `📊 *Weekly indexation check*`;

      await sendTelegramNotification(
        chatId,
        `${header}\n\n${allLines.join("\n")}\n\nLow indexation rate (<50%) means many submitted pages aren't getting indexed - check Coverage report in GSC.`
      );
    }
  } catch (err) {
    console.warn("[gsc-index-check] Telegram failed:", err);
  }

  return NextResponse.json({ ok: true, results });
}
