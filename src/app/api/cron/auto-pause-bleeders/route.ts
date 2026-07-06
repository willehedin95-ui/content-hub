import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { updateAd, updateAdSet, runWithMetaConfig } from "@/lib/meta";


export const maxDuration = 60;

interface Bleeder {
  ad_id: string;
  ad_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  campaign_id: string | null;
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
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Load workspace meta configs for proper API calls
  const { data: allWorkspaces } = await db
    .from("workspaces")
    .select("id, slug, meta_config");
  const wsConfigMap = new Map<string, Record<string, unknown>>();
  for (const ws of allWorkspaces ?? []) {
    if (ws.meta_config) wsConfigMap.set(ws.id, ws.meta_config as Record<string, unknown>);
  }

  // Fall back to env vars if no workspace configs exist
  if (wsConfigMap.size === 0 && (!process.env.META_SYSTEM_USER_TOKEN || !process.env.META_AD_ACCOUNT_ID)) {
    return NextResponse.json({ error: "Meta not configured" }, { status: 400 });
  }

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

  // Build campaign_id -> workspace_id map for workspace scoping
  const campaignIds = [...new Set(toPause.map((b) => b.campaign_id).filter(Boolean))] as string[];
  const wsMap = new Map<string, string>();
  if (campaignIds.length > 0) {
    const { data: mappings } = await db
      .from("meta_campaign_mappings")
      .select("meta_campaign_id, workspace_id")
      .in("meta_campaign_id", campaignIds);
    for (const m of mappings ?? []) {
      if (m.meta_campaign_id && m.workspace_id) wsMap.set(m.meta_campaign_id, m.workspace_id);
    }
  }

  if (toPause.length === 0) {
    return NextResponse.json({ ok: true, paused: 0, message: "All bleeders already paused" });
  }

  const results: Array<{ ad_id: string; ad_name: string | null; success: boolean; error?: string }> = [];

  for (const bleeder of toPause) {
    try {
      // Request-scoped Meta config for this bleeder's workspace — the old
      // module-global setMetaConfig could be swapped by a concurrent request
      // mid-loop, pausing an ad in the WRONG ad account.
      const bleederWsIdForConfig = bleeder.campaign_id ? wsMap.get(bleeder.campaign_id) : undefined;
      const bleederConfig = (bleederWsIdForConfig && wsConfigMap.has(bleederWsIdForConfig)
        ? wsConfigMap.get(bleederWsIdForConfig)!
        : null) as Parameters<typeof runWithMetaConfig>[0];

      await runWithMetaConfig(bleederConfig, () => updateAd(bleeder.ad_id, { status: "PAUSED" }));

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
      const bleederWsId = bleeder.campaign_id ? wsMap.get(bleeder.campaign_id) : undefined;
      await db.from("ad_learnings").insert({
        meta_ad_id: bleeder.ad_id,
        ad_name: bleeder.ad_name,
        campaign_name: bleeder.campaign_name,
        event_type: "paused_bleeder",
        detail: `Auto-paused after ${bleeder.days_bleeding}d bleeding: ${money(bleeder.total_spend)} spent, CTR ${bleeder.avg_ctr}%, CPA ${bleeder.avg_cpa > 0 ? money(bleeder.avg_cpa) : "∞"} vs target ${money(bleeder.target_cpa)}`,
        metrics: { days_bleeding: bleeder.days_bleeding, total_spend: bleeder.total_spend, avg_ctr: bleeder.avg_ctr, avg_cpa: bleeder.avg_cpa },
        ...(bleederWsId && { workspace_id: bleederWsId }),
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

  // (config is request-scoped per call now — nothing global to clear)

  const paused = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  // Telegram notification suppressed — autopilot-execute handles kills + sends digest
  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (paused > 0) {
    console.log(`[auto-pause-bleeders] Paused ${paused} bleeders, ${failed} failed (Telegram suppressed — autopilot-execute sends digest)`);
  }

  // === Concept-level kills: zombie ad sets (all ads paused) ===
  // Skip permanent ad sets — they're shared and should never be paused

  // Get permanent ad set IDs to protect
  const { data: permanentMappings } = await db
    .from("meta_campaign_mappings")
    .select("template_adset_id")
    .eq("is_permanent", true);

  const permanentAdSetIds = new Set(
    (permanentMappings ?? []).map((m: { template_adset_id: string | null }) => m.template_adset_id).filter(Boolean)
  );

  const { data: activeCampaigns } = await db
    .from("meta_campaigns")
    .select("id, meta_adset_id, image_job_id, adset_name, workspace_id")
    .eq("status", "pushed");

  const killedAdSets: string[] = [];

  for (const campaign of activeCampaigns ?? []) {
    if (!campaign.meta_adset_id) continue;

    // NEVER pause permanent ad sets (they're shared across all concepts)
    if (permanentAdSetIds.has(campaign.meta_adset_id)) continue;

    // Check if any active ads remain in this ad set
    const { data: ads } = await db
      .from("meta_ads")
      .select("meta_ad_id, status")
      .eq("campaign_id", campaign.id);

    const activeAds = (ads ?? []).filter((a) => a.status !== "PAUSED");

    if (ads && ads.length > 0 && activeAds.length === 0) {
      // All ads paused -> kill the ad set. Run under the CAMPAIGN's workspace
      // config — this section previously ran after the global config was
      // cleared, so every non-default-workspace adset pause hit the env
      // default ad account.
      try {
        const campaignConfig = (campaign.workspace_id && wsConfigMap.has(campaign.workspace_id)
          ? wsConfigMap.get(campaign.workspace_id)!
          : null) as Parameters<typeof runWithMetaConfig>[0];
        await runWithMetaConfig(campaignConfig, () => updateAdSet(campaign.meta_adset_id, { status: "PAUSED" }));
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

  if (killedAdSets.length > 0) {
    console.log(`[auto-pause-bleeders] Killed ${killedAdSets.length} zombie ad sets: ${killedAdSets.join(", ")}`);
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
