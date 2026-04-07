import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import {
  listCampaigns,
  listAdSets,
  listAdsInAdSet,
  updateAdSet,
  setMetaConfig,
} from "@/lib/meta";
import { sendMessage } from "@/lib/telegram";

export const maxDuration = 120;

/**
 * Cleanup cron: pauses any active ad set where every ad inside is paused
 * or the ad set has zero ads at all.
 *
 * Why: In Meta Ads Manager you often end up with ad sets showing
 * "Ads off" / "Ad off" / "No ads" — the ad set toggle is still ON, but
 * it's not delivering anything. These clutter the UI, skew reporting, and
 * occasionally confuse downstream logic that looks at "active" ad sets.
 *
 * This cron is the source-of-truth version of the zombie killer already in
 * auto-pause-bleeders. That one only looks at ad sets tracked in our DB
 * (meta_campaigns.status = 'pushed') and relies on stale meta_ads.status.
 * This one queries Meta directly across ALL active campaigns in every
 * workspace's ad account — catches legacy ad sets, manually-paused ads, and
 * ad sets not tracked in our DB at all.
 *
 * Protections:
 *   - Permanent ad sets (meta_campaign_mappings.is_permanent = true) are
 *     never touched — they're shared templates for future pushes.
 *   - Only considers ad sets with effective_status = ACTIVE (won't touch
 *     already-paused, archived, or under-review ad sets).
 *   - Logs every pause to auto_paused_ads so repeat runs can see history.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isManual = req.nextUrl.searchParams.get("manual") === "true";
  if (!cronSecret || (authHeader !== `Bearer ${cronSecret}` && !isManual)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dry_run") === "true";
  const db = createServerSupabase();

  // --- Load workspace configs ---
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, slug, name, meta_config");

  // Build list of unique (adAccountId → workspaceId, metaConfig, name) pairs.
  // Multiple workspaces can share an ad account (e.g. HappySleep + Hydro13
  // both on the SwedishBalance account right now). We dedup by ad account ID
  // so we don't iterate the same campaigns twice.
  type WsEntry = {
    workspaceId: string;
    workspaceName: string;
    metaConfig: Record<string, unknown> | null;
    adAccountId: string;
  };
  const seenAdAccounts = new Set<string>();
  const entries: WsEntry[] = [];

  // Workspaces with explicit meta_config
  for (const ws of workspaces ?? []) {
    const cfg = ws.meta_config as Record<string, unknown> | null;
    const adAccountId = cfg?.ad_account_id as string | undefined;
    if (!adAccountId) continue;
    if (seenAdAccounts.has(adAccountId)) continue;
    seenAdAccounts.add(adAccountId);
    entries.push({
      workspaceId: ws.id as string,
      workspaceName: (ws.name as string) ?? (ws.slug as string) ?? "?",
      metaConfig: cfg,
      adAccountId,
    });
  }

  // Fallback: default env var account (for workspaces that haven't set their
  // own meta_config yet — currently HappySleep + Hydro13 share this).
  const defaultAdAccount = process.env.META_AD_ACCOUNT_ID;
  if (defaultAdAccount && !seenAdAccounts.has(defaultAdAccount)) {
    seenAdAccounts.add(defaultAdAccount);
    entries.push({
      workspaceId: "",
      workspaceName: "default",
      metaConfig: null,
      adAccountId: defaultAdAccount,
    });
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "No Meta ad accounts configured" }, { status: 400 });
  }

  // --- Load permanent ad set IDs (global protection list) ---
  const { data: permanentMappings } = await db
    .from("meta_campaign_mappings")
    .select("template_adset_id")
    .eq("is_permanent", true);
  const permanentAdSetIds = new Set(
    (permanentMappings ?? [])
      .map((m: { template_adset_id: string | null }) => m.template_adset_id)
      .filter((x): x is string => Boolean(x)),
  );

  // --- Walk each ad account ---
  type PauseRecord = {
    adAccountId: string;
    workspaceName: string;
    campaignName: string;
    adSetId: string;
    adSetName: string;
    reason: "all_ads_paused" | "no_ads";
    adCount: number;
  };
  const paused: PauseRecord[] = [];
  const errors: Array<{ adSetId: string; error: string }> = [];

  for (const entry of entries) {
    try {
      setMetaConfig(entry.metaConfig as Parameters<typeof setMetaConfig>[0]);

      const campaigns = await listCampaigns();

      for (const camp of campaigns) {
        // listCampaigns already filters to status=ACTIVE, but be defensive
        if (camp.status !== "ACTIVE") continue;

        const adSets = await listAdSets(camp.id);

        for (const adSet of adSets) {
          // Only touch ad sets that Meta thinks are actively delivering.
          // effective_status accounts for inherited pauses (e.g. campaign
          // pause propagating down).
          const effective = adSet.effective_status || adSet.status;
          if (effective !== "ACTIVE") continue;

          // Never touch permanent/template ad sets
          if (permanentAdSetIds.has(adSet.id)) continue;

          const ads = await listAdsInAdSet(adSet.id);

          // "Empty" if either (a) there are no ads at all, or (b) every ad
          // is in a non-delivering state. We check effective_status on each
          // ad so rejections, pauses, and inherited states all count.
          const activeAds = ads.filter((a) => {
            const adEffective = a.effective_status || a.status;
            return adEffective === "ACTIVE";
          });

          if (activeAds.length > 0) continue; // still has live ads → leave alone

          // FLAG: zombie ad set
          const reason: "all_ads_paused" | "no_ads" = ads.length === 0 ? "no_ads" : "all_ads_paused";

          if (dryRun) {
            paused.push({
              adAccountId: entry.adAccountId,
              workspaceName: entry.workspaceName,
              campaignName: camp.name,
              adSetId: adSet.id,
              adSetName: adSet.name,
              reason,
              adCount: ads.length,
            });
            continue;
          }

          try {
            await updateAdSet(adSet.id, { status: "PAUSED" });

            // Log to tracking table so future runs + debugging can see why.
            // Uses the same table as auto-pause-bleeders for one source of truth.
            await db.from("auto_paused_ads").insert({
              meta_ad_id: adSet.id, // we reuse this column for the ad set ID
              adset_id: adSet.id,
              ad_name: adSet.name,
              campaign_name: camp.name,
              reason: reason === "no_ads"
                ? `Ad set had 0 ads at all`
                : `All ${ads.length} ads in ad set were paused/not delivering`,
              days_bleeding: 0,
              total_spend: 0,
            });

            paused.push({
              adAccountId: entry.adAccountId,
              workspaceName: entry.workspaceName,
              campaignName: camp.name,
              adSetId: adSet.id,
              adSetName: adSet.name,
              reason,
              adCount: ads.length,
            });

            // Rate-limit courtesy
            await new Promise((r) => setTimeout(r, 300));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            console.error(`[cleanup-empty-adsets] Failed to pause ${adSet.id}:`, msg);
            errors.push({ adSetId: adSet.id, error: msg });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[cleanup-empty-adsets] Workspace ${entry.workspaceName} failed:`, msg);
      errors.push({ adSetId: `ws:${entry.workspaceName}`, error: msg });
    }
  }

  // Reset workspace-specific Meta config
  setMetaConfig(null);

  // --- Telegram digest ---
  if (paused.length > 0 && !dryRun) {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      const byWorkspace = new Map<string, PauseRecord[]>();
      for (const p of paused) {
        const key = p.workspaceName;
        if (!byWorkspace.has(key)) byWorkspace.set(key, []);
        byWorkspace.get(key)!.push(p);
      }

      const lines: string[] = [];
      lines.push(`🧹 Cleaned up ${paused.length} empty ad set${paused.length === 1 ? "" : "s"}`);
      lines.push("");

      for (const [wsName, items] of byWorkspace) {
        lines.push(`*${wsName}*`);
        for (const item of items.slice(0, 15)) {
          const tag = item.reason === "no_ads" ? "⊘ no ads" : `⊘ ${item.adCount} ads paused`;
          lines.push(`  • ${item.adSetName.slice(0, 55)} (${tag})`);
        }
        if (items.length > 15) {
          lines.push(`  … and ${items.length - 15} more`);
        }
        lines.push("");
      }

      lines.push("These were ad sets toggled ON in Meta but not delivering.");
      await sendMessage(chatId, lines.join("\n"));
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    paused: paused.length,
    errors: errors.length,
    details: paused,
    failed: errors,
  });
}
