import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { detectGapKeywords, addGapsToContentPlan } from "@/lib/gsc-gaps";
import { sendTelegramNotification, escapeHtml } from "@/lib/telegram";
import type { Language } from "@/types";
import { trackedCronRoute } from "@/lib/cron-tracker";

// Weekly cron that converts GSC impressions/positions into content_plan
// entries so the autopilot discovers real search demand instead of only
// working from the hardcoded plan. Safe to run more often — all inserts
// are deduped against existing slugs + normalized keywords.

export const maxDuration = 300;

async function handleCron(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Only workspaces that opted in to GSC-driven content discovery
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, slug, settings");

  const results: Array<{
    workspace: string;
    language: string;
    gapsFound: number;
    added: number;
    skipped: number;
    blocked: number;
    error?: string;
  }> = [];

  for (const ws of workspaces ?? []) {
    const settings = (ws.settings ?? {}) as Record<string, unknown>;
    if (!settings.blog_autopilot_enabled) continue;
    if (settings.gsc_gap_refresh_enabled === false) continue; // explicit opt-out

    const languages = (settings.blog_autopilot_languages as string[]) ?? ["sv"];
    const productSlug = (settings.default_product as string) || "happysleep";

    for (const lang of languages) {
      try {
        const gaps = await detectGapKeywords(ws.id as string, lang as Language, {
          windowDays: 30,
          minImpressions: (settings.gsc_gap_min_impressions as number) || 5,
          limit: (settings.gsc_gap_max_added_per_run as number) || 10,
        });

        const { added, skipped, blocked } = await addGapsToContentPlan(
          ws.id as string,
          lang as Language,
          gaps,
          productSlug
        );

        results.push({
          workspace: ws.slug as string,
          language: lang,
          gapsFound: gaps.length,
          added,
          skipped,
          blocked,
        });

        console.log(
          `[gsc-gap-refresh] ${ws.slug} (${lang}): ${gaps.length} gaps, ${added} added, ${skipped} skipped, ${blocked} blocked`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[gsc-gap-refresh] ${ws.slug} (${lang}) failed:`, message);
        results.push({
          workspace: ws.slug as string,
          language: lang,
          gapsFound: 0,
          added: 0,
          skipped: 0,
          blocked: 0,
          error: message,
        });
      }
    }
  }

  // Telegram summary so operator knows the cron ran and what it found.
  // Without this the silence is ambiguous: did it run, was there nothing
  // to add, or did it crash?
  try {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId && results.length > 0) {
      const totalAdded = results.reduce((s, r) => s + r.added, 0);
      const totalFound = results.reduce((s, r) => s + r.gapsFound, 0);
      const totalBlocked = results.reduce((s, r) => s + r.blocked, 0);
      const errors = results.filter((r) => r.error);

      const lines = results.map((r) => {
        if (r.error) return `⛔ ${r.workspace}/${r.language}: ${escapeHtml(r.error.slice(0, 80))}`;
        if (r.added === 0 && r.gapsFound === 0) return `➖ ${r.workspace}/${r.language}: inga gaps`;
        if (r.added === 0 && r.blocked > 0) return `🚫 ${r.workspace}/${r.language}: ${r.blocked} blockerade, 0 nya`;
        return `✅ ${r.workspace}/${r.language}: +${r.added} nya (${r.gapsFound} hittade)`;
      });

      const header = errors.length > 0
        ? `⚠️ <b>GSC-gap-cron: ${errors.length} fel</b>`
        : totalAdded === 0
        ? `🔍 <b>GSC-gap-cron: 0 nya gaps</b>\n\nCronen körde men hittade inget nytt att lägga till. Antingen är content plan redan komplett eller GSC har inte tillräckligt med data (min ${totalFound} impr per query).`
        : `✨ <b>GSC-gap-cron: +${totalAdded} nya artiklar i content plan</b>`;

      await sendTelegramNotification(
        chatId,
        `${header}\n\n${lines.join("\n")}\n\nTotalt: ${totalFound} gaps hittade, ${totalAdded} tillagda, ${totalBlocked} blockerade`
      );
    }
  } catch (err) {
    console.warn("[gsc-gap-refresh] Telegram summary failed (non-critical):", err);
  }

  return NextResponse.json({ ok: true, results });
}

// Cron-run tracking wrapper (audit 2026-07-07, I1)
export const GET = trackedCronRoute("gsc-gap-refresh", handleCron);
