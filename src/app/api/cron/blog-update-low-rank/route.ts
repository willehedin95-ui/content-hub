import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { runLowRankUpdate } from "@/lib/article-updater";
import { sendTelegramNotification, escapeHtml } from "@/lib/telegram";
import type { Language } from "@/types";
import { trackedCronRoute } from "@/lib/cron-tracker";

// Weekly cron: refresh 1 LOW_RANK article per workspace+language. Pairs with
// gsc-gap-refresh which only adds NEW articles - this updates existing ones
// that rank position 5-20 to nudge them into top 3.
//
// Opt-in per workspace via `blog_low_rank_updates_enabled: true`. Default OFF
// because refresh costs ~$0.05-0.07/article and only makes sense when GSC
// has enough data to detect real opportunities.

export const maxDuration = 300;

async function handleCron(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, slug, name, settings");

  const results: Array<{
    workspace: string;
    language: string;
    action: string;
    message: string;
    slug?: string;
  }> = [];

  for (const ws of workspaces ?? []) {
    const settings = (ws.settings ?? {}) as Record<string, unknown>;
    if (!settings.blog_autopilot_enabled) continue;
    if (settings.blog_low_rank_updates_enabled !== true) continue;

    const languages = (settings.blog_autopilot_languages as string[]) ?? ["sv"];

    for (const lang of languages) {
      try {
        const result = await runLowRankUpdate(ws.id as string, lang as Language);
        results.push({
          workspace: ws.slug as string,
          language: lang,
          action: result.action,
          message: result.message,
          slug: result.slug,
        });
        console.log(`[blog-update-low-rank] ${ws.slug} (${lang}): ${result.action} - ${result.message}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[blog-update-low-rank] ${ws.slug} (${lang}) failed:`, message);
        results.push({
          workspace: ws.slug as string,
          language: lang,
          action: "error",
          message,
        });
      }
    }
  }

  // Summary Telegram only if errors or updates (avoid noise when all skipped)
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    const updated = results.filter((r) => r.action === "updated");
    const errors = results.filter((r) => r.action === "error");
    if (chatId && (updated.length > 0 || errors.length > 0)) {
      const lines = [...updated, ...errors].map((r) => {
        const icon = r.action === "updated" ? "✅" : "⛔";
        return `${icon} ${r.workspace}/${r.language}: ${escapeHtml(r.message.slice(0, 100))}`;
      });
      await sendTelegramNotification(
        chatId,
        `♻️ <b>LOW_RANK refresh cron</b>\n\n${lines.join("\n")}`
      );
    }
  } catch (err) {
    console.warn("[blog-update-low-rank] Telegram summary failed:", err);
  }

  return NextResponse.json({ ok: true, results });
}

// Cron-run tracking wrapper (audit 2026-07-07, I1)
export const GET = trackedCronRoute("blog-update-low-rank", handleCron);
