import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { auditLinkDepth } from "@/lib/link-depth-audit";
import { sendTelegramNotification, escapeHtml } from "@/lib/telegram";
import type { Language } from "@/types";
import { trackedCronRoute } from "@/lib/cron-tracker";

// Weekly cron: audit internal link depth across all published blog articles.
// Flags articles >3 clicks from homepage (poor crawler discoverability) and
// orphans (no inbound internal links). Telegram alerts so operator can add
// links from hub-pages / popular articles.
//
// Cron: Mondays 07:00 UTC (after gsc-sync + gsc-gap-refresh + index-check).

export const maxDuration = 120;

async function handleCron(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();
  const { data: workspaces } = await db.from("workspaces").select("id, slug, name, settings");

  const results: Array<{
    workspace: string;
    language: string;
    totalArticles: number;
    averageDepth: number;
    orphans: number;
    tooDeep: number;
    topOrphans: string[];
    topTooDeep: string[];
  }> = [];

  for (const ws of workspaces ?? []) {
    const settings = (ws.settings ?? {}) as Record<string, unknown>;
    if (!settings.blog_autopilot_enabled) continue;
    const languages = (settings.blog_autopilot_languages as string[]) ?? ["sv"];
    for (const lang of languages) {
      try {
        const report = await auditLinkDepth(ws.id as string, lang as Language, { maxDepth: 3 });
        if (report.totalArticles === 0) continue;
        results.push({
          workspace: ws.slug as string,
          language: lang,
          totalArticles: report.totalArticles,
          averageDepth: report.averageDepth,
          orphans: report.orphans.length,
          tooDeep: report.tooDeep.length,
          topOrphans: report.orphans.slice(0, 5).map((o) => o.slug),
          topTooDeep: report.tooDeep.slice(0, 5).map((t) => `${t.slug}@d${t.depth}`),
        });
      } catch (err) {
        console.error(`[link-depth] ${ws.slug} (${lang}) failed:`, err);
      }
    }
  }

  // Telegram only if there's anything to act on
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    const concerning = results.filter((r) => r.orphans > 0 || r.tooDeep > 0);
    if (chatId && concerning.length > 0) {
      const lines = concerning.map((r) => {
        const parts: string[] = [`<b>${r.workspace}/${r.language}</b> (avg depth ${r.averageDepth})`];
        if (r.orphans > 0) {
          parts.push(`🔗 ${r.orphans} orphans: <code>${escapeHtml(r.topOrphans.slice(0, 3).join(", "))}</code>`);
        }
        if (r.tooDeep > 0) {
          parts.push(`⬇️ ${r.tooDeep} &gt;3 clicks deep: <code>${escapeHtml(r.topTooDeep.slice(0, 3).join(", "))}</code>`);
        }
        return parts.join("\n  ");
      });
      await sendTelegramNotification(
        chatId,
        `🔗 <b>Internal-link depth audit</b>\n\n${lines.join("\n\n")}\n\nFix: add internal links from popular articles or pillar hubs to these slugs.`
      );
    }
  } catch (err) {
    console.warn("[link-depth] Telegram failed:", err);
  }

  return NextResponse.json({ ok: true, results });
}

// Cron-run tracking wrapper (audit 2026-07-07, I1)
export const GET = trackedCronRoute("blog-link-depth-audit", handleCron);
