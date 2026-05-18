import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { detectStaleArticles } from "@/lib/content-sunset";
import { sendTelegramNotification } from "@/lib/telegram";
import type { Language } from "@/types";

// Monthly cron: detect articles ranked >pos 30 after 90+ days indexed.
// They drag down domain authority - Google rates the domain partly on the
// weakest 20% of content. Surfaces them via Telegram so operator decides:
// refresh via LOW_RANK update cron, or remove entirely.
//
// Pure detection - no auto-deletion. Conservative on cadence (monthly, not
// weekly) since article maturity takes time and removing too soon kills
// articles still warming up.

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();
  const { data: workspaces } = await db.from("workspaces").select("id, slug, name, settings");

  const allStale: Array<{
    workspace: string;
    language: string;
    slug: string;
    avgPos: number;
    impressions: number;
    daysOld: number;
  }> = [];

  for (const ws of workspaces ?? []) {
    const settings = (ws.settings ?? {}) as Record<string, unknown>;
    if (!settings.blog_autopilot_enabled) continue;
    const languages = (settings.blog_autopilot_languages as string[]) ?? ["sv"];
    for (const lang of languages) {
      try {
        const stale = await detectStaleArticles(ws.id as string, lang as Language, { limit: 8 });
        for (const s of stale) {
          allStale.push({
            workspace: ws.slug as string,
            language: lang,
            slug: s.slug,
            avgPos: s.avgPosition,
            impressions: s.totalImpressions,
            daysOld: s.daysSincePublish,
          });
        }
      } catch (err) {
        console.error(`[blog-sunset-check] ${ws.slug} (${lang}) failed:`, err);
      }
    }
  }

  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId && allStale.length > 0) {
      const lines = allStale.slice(0, 15).map((s) =>
        `🪦 ${s.workspace}/${s.language} \`${s.slug}\` pos ${s.avgPos.toFixed(1)} (${s.impressions} impr, ${s.daysOld}d gammal)`
      );
      await sendTelegramNotification(
        chatId,
        `🪦 *Stale articles dragging down domain*\n\n${lines.join("\n")}\n\nÖverväg: regenerate via LOW\\_RANK refresh-cron, eller arkivera artikeln (sätt status='archived' i translations).`
      );
    }
  } catch (err) {
    console.warn("[blog-sunset-check] Telegram failed:", err);
  }

  return NextResponse.json({ ok: true, stale: allStale });
}
