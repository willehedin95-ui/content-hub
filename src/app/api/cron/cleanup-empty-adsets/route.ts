import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import {
  listCampaigns,
  listAdSets,
  listAdsInAdSet,
  updateAdSet,
  runWithMetaConfig,
} from "@/lib/meta";
import { sendMessage, isTelegramDisabled } from "@/lib/telegram";

export const maxDuration = 800;

// Throttling between Meta API calls to stay under the user request limit
// (subcode 2446079). The rate limit has a burst component, so even modest
// delays significantly reduce throttling. Sized to keep total runtime under
// maxDuration even with several hundred ad sets.
const READ_DELAY_MS = 250; // between listAdSets / listAdsInAdSet calls
const WRITE_DELAY_MS = 500; // after a pause write
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    .select("id, slug, name, meta_config, settings");

  const silencedWsNames = new Set<string>(
    (workspaces ?? [])
      .filter((w) => isTelegramDisabled(w))
      .map((w) => ((w.name as string) ?? (w.slug as string) ?? "")),
  );

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
  const { data: permanentMappings, error: permErr } = await db
    .from("meta_campaign_mappings")
    .select("template_adset_id")
    .eq("is_permanent", true);
  if (permErr) {
    console.error("[cleanup-empty-adsets] permanent mappings query failed:", permErr.message);
  }
  const permanentAdSetIds = new Set(
    (permanentMappings ?? [])
      .map((m: { template_adset_id: string | null }) => m.template_adset_id)
      .filter((x): x is string => Boolean(x)),
  );

  // --- Ad set age lookup (M5 2026-07-07): freshly pushed ad sets are tracked in
  // meta_campaigns; skip anything younger than 24h so we never pause an ad set
  // whose ads are still in Meta review right after a push.
  const { data: adsetAges, error: ageErr } = await db
    .from("meta_campaigns")
    .select("meta_adset_id, created_at")
    .not("meta_adset_id", "is", null);
  if (ageErr) {
    console.error("[cleanup-empty-adsets] meta_campaigns age query failed:", ageErr.message);
  }
  const adsetCreatedAt = new Map<string, string>();
  for (const row of adsetAges ?? []) {
    if (row.meta_adset_id && row.created_at) {
      adsetCreatedAt.set(row.meta_adset_id as string, row.created_at as string);
    }
  }
  const MIN_ADSET_AGE_MS = 24 * 60 * 60 * 1000;

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
      // M5 (2026-07-07): whole account walk runs request-scoped — the pause
      // write below is a money-write and must never hit the wrong ad account
      // if a concurrent request swaps the module-global config.
      await runWithMetaConfig(entry.metaConfig as Parameters<typeof runWithMetaConfig>[0], async () => {

      const campaigns = await listCampaigns();
      await sleep(READ_DELAY_MS);

      for (const camp of campaigns) {
        // listCampaigns already filters to status=ACTIVE, but be defensive
        if (camp.status !== "ACTIVE") continue;

        const adSets = await listAdSets(camp.id);
        await sleep(READ_DELAY_MS);

        for (const adSet of adSets) {
          // Only touch ad sets that Meta thinks are actively delivering.
          // effective_status accounts for inherited pauses (e.g. campaign
          // pause propagating down).
          const effective = adSet.effective_status || adSet.status;
          if (effective !== "ACTIVE") continue;

          // Never touch permanent/template ad sets
          if (permanentAdSetIds.has(adSet.id)) continue;

          // M5: never touch ad sets younger than 24h — a fresh push whose ads
          // are still in review looks "empty" but is very much alive.
          const createdAt = adsetCreatedAt.get(adSet.id);
          if (createdAt && Date.now() - new Date(createdAt).getTime() < MIN_ADSET_AGE_MS) {
            continue;
          }

          const ads = await listAdsInAdSet(adSet.id);
          await sleep(READ_DELAY_MS);

          // "Empty" if either (a) there are no ads at all, or (b) every ad
          // is in a non-delivering state. We check effective_status on each
          // ad so rejections, pauses, and inherited states all count.
          // M5 (2026-07-07): ads under Meta review (PENDING_REVIEW/PREAPPROVED/
          // IN_PROCESS) count as ALIVE — pausing their ad set mid-review killed
          // freshly pushed concepts.
          const ALIVE_AD_STATUSES = new Set(["ACTIVE", "PENDING_REVIEW", "PREAPPROVED", "IN_PROCESS"]);
          const activeAds = ads.filter((a) => {
            const adEffective = a.effective_status || a.status;
            return ALIVE_AD_STATUSES.has(adEffective);
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

            // Rate-limit courtesy after a write
            await sleep(WRITE_DELAY_MS);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            console.error(`[cleanup-empty-adsets] Failed to pause ${adSet.id}:`, msg);
            errors.push({ adSetId: adSet.id, error: msg });
          }
        }
      }

      }); // end runWithMetaConfig for this ad account
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[cleanup-empty-adsets] Workspace ${entry.workspaceName} failed:`, msg);
      errors.push({ adSetId: `ws:${entry.workspaceName}`, error: msg });
    }
  }

  // --- Telegram digest ---
  if (paused.length > 0 && !dryRun) {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    const notifiablePaused = paused.filter((p) => !silencedWsNames.has(p.workspaceName));
    if (chatId && notifiablePaused.length > 0) {
      const byWorkspace = new Map<string, PauseRecord[]>();
      for (const p of notifiablePaused) {
        const key = p.workspaceName;
        if (!byWorkspace.has(key)) byWorkspace.set(key, []);
        byWorkspace.get(key)!.push(p);
      }

      const lines: string[] = [];
      lines.push(`🧹 Cleaned up ${notifiablePaused.length} empty ad set${notifiablePaused.length === 1 ? "" : "s"}`);
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
