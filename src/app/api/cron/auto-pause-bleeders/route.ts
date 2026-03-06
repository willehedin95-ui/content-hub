import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { updateAd, updateAdSet } from "@/lib/meta";
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
  target_cpa: number;
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
        reason: `Bleeding ${bleeder.days_bleeding}d: ${money(bleeder.total_spend)} spent, CTR ${bleeder.avg_ctr}%, CPA ${bleeder.avg_cpa > 0 ? money(bleeder.avg_cpa) : "∞"} vs target ${money(bleeder.target_cpa)}`,
        days_bleeding: bleeder.days_bleeding,
        total_spend: bleeder.total_spend,
      });

      // Record learning for future reference
      await db.from("ad_learnings").insert({
        meta_ad_id: bleeder.ad_id,
        ad_name: bleeder.ad_name,
        campaign_name: bleeder.campaign_name,
        event_type: "paused_bleeder",
        detail: `Auto-paused after ${bleeder.days_bleeding}d bleeding: ${money(bleeder.total_spend)} spent, CTR ${bleeder.avg_ctr}%, CPA ${bleeder.avg_cpa > 0 ? money(bleeder.avg_cpa) : "∞"} vs target ${money(bleeder.target_cpa)}`,
        metrics: { days_bleeding: bleeder.days_bleeding, total_spend: bleeder.total_spend, avg_ctr: bleeder.avg_ctr, avg_cpa: bleeder.avg_cpa },
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

  // === Concept-level kills: zombie ad sets (all ads paused) ===

  const { data: activeCampaigns } = await db
    .from("meta_campaigns")
    .select("id, meta_adset_id, image_job_id, adset_name")
    .eq("status", "pushed");

  const killedAdSets: string[] = [];

  for (const campaign of activeCampaigns ?? []) {
    if (!campaign.meta_adset_id) continue;

    // Check if any active ads remain in this ad set
    const { data: ads } = await db
      .from("meta_ads")
      .select("meta_ad_id, status")
      .eq("campaign_id", campaign.id);

    const activeAds = (ads ?? []).filter((a) => a.status !== "PAUSED");

    if (ads && ads.length > 0 && activeAds.length === 0) {
      // All ads paused -> kill the ad set
      try {
        await updateAdSet(campaign.meta_adset_id, { status: "PAUSED" });
        killedAdSets.push(campaign.adset_name ?? campaign.meta_adset_id);

        // Mark concept as killed in lifecycle
        const { data: markets } = await db
          .from("image_job_markets")
          .select("id")
          .eq("image_job_id", campaign.image_job_id);

        for (const market of markets ?? []) {
          const { data: lifecycle } = await db
            .from("concept_lifecycle")
            .select("id, stage")
            .eq("image_job_market_id", market.id)
            .in("stage", ["testing", "review", "active"])
            .is("exited_at", null)
            .single();

          if (lifecycle) {
            const now = new Date().toISOString();
            await db.from("concept_lifecycle")
              .update({ exited_at: now })
              .eq("id", lifecycle.id);
            await db.from("concept_lifecycle").insert({
              image_job_market_id: market.id,
              stage: "killed",
              entered_at: now,
              signal: "zombie_all_ads_paused",
            });
          }
        }
      } catch (err) {
        console.error(`Failed to kill zombie ad set ${campaign.adset_name}:`, err);
      }
    }
  }

  if (killedAdSets.length > 0 && chatId) {
    await sendMessage(
      chatId,
      `\u{1FAA6} Killed ${killedAdSets.length} zombie ad set(s) (all ads paused):\n` +
      killedAdSets.map((n) => `  \u2022 ${n}`).join("\n")
    );
  }

  return NextResponse.json({
    ok: true,
    paused,
    failed,
    results,
    killedZombieAdSets: killedAdSets.length,
  });
}

function money(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
