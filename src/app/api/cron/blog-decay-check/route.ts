import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { detectDecay } from "@/lib/content-decay";
import { sendTelegramNotification } from "@/lib/telegram";
import type { Language } from "@/types";

// Weekly cron: detect articles whose GSC position dropped >5 places
// week-over-week AND now rank below position 20. Surfaces them via Telegram
// so operator can refresh or sunset.
//
// Pure detection - does not auto-act. Auto-refresh would risk over-publishing
// (LOW_RANK refresh cron handles regeneration on a separate cadence).

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, slug, name, settings");

  const allDecayed: Array<{
    workspace: string;
    language: string;
    slug: string;
    url: string;
    topQuery: string;
    currentPos: number;
    previousPos: number;
    dropPlaces: number;
  }> = [];

  for (const ws of workspaces ?? []) {
    const settings = (ws.settings ?? {}) as Record<string, unknown>;
    if (!settings.blog_autopilot_enabled) continue;
    const languages = (settings.blog_autopilot_languages as string[]) ?? ["sv"];

    for (const lang of languages) {
      try {
        const decayed = await detectDecay(ws.id as string, lang as Language, { limit: 5 });
        for (const d of decayed) {
          allDecayed.push({
            workspace: ws.slug as string,
            language: lang,
            slug: d.slug,
            url: d.url,
            topQuery: d.topQuery,
            currentPos: d.currentPos,
            previousPos: d.previousPos,
            dropPlaces: d.dropPlaces,
          });
        }
      } catch (err) {
        console.error(`[blog-decay-check] ${ws.slug} (${lang}) failed:`, err);
      }
    }
  }

  // Telegram only if any decay detected (silence is OK = all stable)
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId && allDecayed.length > 0) {
      const lines = allDecayed.slice(0, 15).map((d) =>
        `📉 ${d.workspace}/${d.language} \`${d.slug}\`\n` +
        `   "${d.topQuery}" pos ${d.previousPos.toFixed(1)} -> ${d.currentPos.toFixed(1)} (drop ${d.dropPlaces.toFixed(1)})`
      );
      await sendTelegramNotification(
        chatId,
        `📉 *Content decay alert: ${allDecayed.length} artiklar tappar position*\n\n${lines.join("\n\n")}\n\nÖverväg: regenerate via LOW\\_RANK-cron eller arkivera om irrelevant.`
      );
    }
  } catch (err) {
    console.warn("[blog-decay-check] Telegram failed:", err);
  }

  return NextResponse.json({ ok: true, decayed: allDecayed });
}
