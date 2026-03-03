import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { updateAd } from "@/lib/meta";
import { sendMessage } from "@/lib/telegram";

export const maxDuration = 60;

interface Bleeder {
  ad_id: string;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  days_bleeding: number;
  total_spend: number;
  purchases: number;
  avg_cpa: number;
  campaign_avg_cpa: number;
  avg_ctr: number;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.META_SYSTEM_USER_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
    return NextResponse.json({ error: "Meta not configured" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Fetch bleeders from morning brief API
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";
  const briefRes = await fetch(`${baseUrl}/api/morning-brief`, {
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });

  if (!briefRes.ok) {
    return NextResponse.json({ error: "Morning brief API failed" }, { status: 500 });
  }

  const briefData = await briefRes.json();
  const bleeders: Bleeder[] = briefData.signals?.bleeders ?? [];

  if (bleeders.length === 0) {
    return NextResponse.json({ ok: true, paused: 0, message: "No bleeders to pause" });
  }

  // Check which ads are already paused by us (avoid duplicate pauses)
  const { data: alreadyPaused } = await db
    .from("auto_paused_ads")
    .select("meta_ad_id")
    .eq("status", "paused")
    .in("meta_ad_id", bleeders.map((b) => b.ad_id));

  const alreadyPausedIds = new Set((alreadyPaused ?? []).map((r) => r.meta_ad_id));
  const toPause = bleeders.filter((b) => !alreadyPausedIds.has(b.ad_id));

  if (toPause.length === 0) {
    return NextResponse.json({ ok: true, paused: 0, message: "All bleeders already paused" });
  }

  const results: Array<{ ad_id: string; ad_name: string | null; success: boolean; error?: string }> = [];

  for (const bleeder of toPause) {
    try {
      await updateAd(bleeder.ad_id, { status: "PAUSED" });

      // Record the pause in our tracking table
      await db.from("auto_paused_ads").insert({
        meta_ad_id: bleeder.ad_id,
        adset_id: null,
        ad_name: bleeder.ad_name,
        campaign_name: bleeder.campaign_name,
        reason: `Bleeding ${bleeder.days_bleeding}d: ${money(bleeder.total_spend)} spent, CTR ${bleeder.avg_ctr}%, CPA ${bleeder.avg_cpa > 0 ? money(bleeder.avg_cpa) : "∞"} vs campaign avg ${money(bleeder.campaign_avg_cpa)}`,
        days_bleeding: bleeder.days_bleeding,
        total_spend: bleeder.total_spend,
      });

      results.push({ ad_id: bleeder.ad_id, ad_name: bleeder.ad_name, success: true });

      // Small delay to avoid Meta rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      results.push({
        ad_id: bleeder.ad_id,
        ad_name: bleeder.ad_name,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const paused = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  // Send Telegram notification about paused ads
  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (chatId && paused > 0) {
    const lines = [`🛑 Auto-paused ${paused} bleeding ad${paused !== 1 ? "s" : ""}:`];
    for (const r of results.filter((r) => r.success)) {
      const b = toPause.find((x) => x.ad_id === r.ad_id)!;
      lines.push(`  • ${r.ad_name || "Unnamed"} (${b.campaign_name}) — ${b.days_bleeding}d, ${money(b.total_spend)} wasted`);
    }
    if (failed > 0) {
      lines.push(`\n⚠️ Failed to pause ${failed} ad${failed !== 1 ? "s" : ""}`);
    }
    lines.push(`\n👉 ${process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app"}/morning-brief`);
    await sendMessage(chatId, lines.join("\n"));
  }

  return NextResponse.json({
    ok: true,
    paused,
    failed,
    results,
  });
}

function money(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
