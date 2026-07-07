import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import {
  createCampaign,
  createAdSet,
  duplicateAdSet,
  updateAdSet,
  uploadImage,
  createAdCreative,
  createAd,
  runWithMetaConfig,
  getAdSetConfig,
  createAdSetFromTemplate,
} from "@/lib/meta";
import { FEED_STORIES_RULES } from "@/lib/meta-push";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId, getWorkspace } from "@/lib/workspace";

export const maxDuration = 180;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  // Load workspace Meta config
  const workspaceId = await getWorkspaceId();
  const ws = await getWorkspace();
  const metaCfg = (ws.meta_config ?? null) as Parameters<typeof runWithMetaConfig>[0];

  // Load campaign with ads (workspace-scoped)
  const { data: campaign, error } = await db
    .from("meta_campaigns")
    .select("*, meta_ads(*)")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status === "pushed" || campaign.status === "pushing") {
    return NextResponse.json(
      { error: campaign.status === "pushed" ? "Campaign already pushed" : "Campaign is currently being pushed" },
      { status: 400 }
    );
  }

  // P3 (2026-07-07): atomic claim — the read-then-update above is racy under
  // double-click/double-request. Compare-and-swap on the status we just read:
  // the single UPDATE only succeeds for ONE caller; a concurrent push matches
  // zero rows and gets a 409 instead of creating duplicate (PAUSED) ads.
  const claimBase = db
    .from("meta_campaigns")
    .update({ status: "pushing", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  const { data: claimed, error: claimErr } = await (
    campaign.status === null
      ? claimBase.is("status", null)
      : claimBase.eq("status", campaign.status)
  ).select("id");

  if (claimErr) {
    return safeError(claimErr, "Failed to claim campaign for push");
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { error: "Campaign is already being pushed (or was just pushed) by another request" },
      { status: 409 }
    );
  }

  try {
    // 1. Resolve Meta campaign ID (from mapping or existing)
    let metaCampaignId = campaign.meta_campaign_id;

    if (!metaCampaignId) {
      // Fallback: create campaign from scratch (legacy flow)
      const metaCampaign = await runWithMetaConfig(metaCfg, () => createCampaign({
        name: campaign.name,
        objective: campaign.objective,
        status: "PAUSED",
      }));
      metaCampaignId = metaCampaign.id;

      await db
        .from("meta_campaigns")
        .update({ meta_campaign_id: metaCampaignId })
        .eq("id", id);
    }

    // 2. Duplicate template ad set or create from scratch (skip on retry if already created)
    let metaAdSetId: string | null = campaign.meta_adset_id;

    if (metaAdSetId) {
      // Already have an ad set from a previous attempt — reuse it
    } else if (campaign.product) {
      // New flow: duplicate template ad set from mapping
      const { data: mapping } = await db
        .from("meta_campaign_mappings")
        .select("template_adset_id")
        .eq("product", campaign.product)
        .eq("workspace_id", workspaceId)
        .eq("country", campaign.countries[0])
        .eq("format", "image")
        .single();

      if (!mapping?.template_adset_id) {
        throw new Error(
          `No template ad set configured for ${campaign.product} / ${campaign.countries[0]}. Go to Settings → Meta Campaign Mapping.`
        );
      }

      // Create non-DCO ad set from template config (not duplicate, since
      // duplicating inherits is_dynamic_creative=true which breaks PAC rules).
      // P2 (2026-07-07): read runs inside runWithMetaConfig too — reading the
      // template from the wrong account yields a wrong campaign_id for creation.
      const templateConfig = await runWithMetaConfig(metaCfg, () => getAdSetConfig(mapping.template_adset_id));
      const newAdSet = await runWithMetaConfig(metaCfg, () => createAdSetFromTemplate({
        templateConfig,
        name: campaign.name,
        isDynamicCreative: false,
      }));
      metaAdSetId = newAdSet.id;
    } else {
      // Legacy flow: create ad set from scratch
      const metaAdSet = await runWithMetaConfig(metaCfg, () => createAdSet({
        name: `${campaign.name} - Ad Set`,
        campaignId: metaCampaignId,
        dailyBudget: campaign.daily_budget,
        countries: campaign.countries,
        startTime: campaign.start_time || undefined,
        endTime: campaign.end_time || undefined,
        status: "PAUSED",
      }));
      metaAdSetId = metaAdSet.id;
    }

    if (!metaAdSetId) {
      throw new Error("Failed to resolve ad set ID");
    }
    const resolvedAdSetId: string = metaAdSetId;

    await db
      .from("meta_campaigns")
      .update({ meta_adset_id: resolvedAdSetId })
      .eq("id", id);

    // 3. Process each ad (concurrently, max 3 at a time)
    // On retry, skip ads that were already pushed successfully
    const ads = (campaign.meta_ads ?? []).filter(
      (a: { status: string }) => a.status !== "pushed"
    );

    if (ads.length === 0) {
      // Nothing to push — check if any ads exist at all
      const allAds = campaign.meta_ads ?? [];
      const anyPushed = allAds.some((a: { status: string }) => a.status === "pushed");
      await db
        .from("meta_campaigns")
        .update({
          status: anyPushed ? "pushed" : "error",
          error_message: anyPushed ? null : "No ads to push",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      const { data: updated } = await db
        .from("meta_campaigns")
        .select("*, meta_ads(*)")
        .eq("id", id)
        .single();
      return NextResponse.json(updated);
    }

    const CONCURRENCY = 3;

    async function pushOneAd(ad: typeof ads[number]) {
      try {
        await db.from("meta_ads").update({ status: "uploading" }).eq("id", ad.id);

        const { hash: imageHash } = await runWithMetaConfig(metaCfg, () => uploadImage(ad.image_url));
        await db.from("meta_ads").update({ meta_image_hash: imageHash }).eq("id", ad.id);

        // Upload 9:16 image if available
        let imageHash9x16: string | undefined;
        if (ad.image_url_9x16) {
          const result = await runWithMetaConfig(metaCfg, () => uploadImage(ad.image_url_9x16));
          imageHash9x16 = result.hash;
          await db.from("meta_ads").update({ meta_image_hash_9x16: imageHash9x16 }).eq("id", ad.id);
        }

        // Use labeled images + placement rules when 9:16 variant exists
        const has9x16 = !!imageHash9x16;
        const creative = await runWithMetaConfig(metaCfg, () => createAdCreative({
          name: ad.name,
          images: has9x16
            ? [{ hash: imageHash, label: "feed" }, { hash: imageHash9x16!, label: "stories" }]
            : [{ hash: imageHash }],
          bodies: [ad.ad_copy],
          // Titles limited to 1 with asset_customization_rules (subcode 1885878)
          titles: ad.headline ? [ad.headline] : undefined,
          linkUrl: ad.landing_page_url,
          assetCustomizationRules: has9x16 ? FEED_STORIES_RULES : undefined,
        }));
        await db.from("meta_ads").update({ meta_creative_id: creative.id }).eq("id", ad.id);

        // Extract page slug from landing URL for Shopify order attribution via utm_term
        const pageSlug = (() => {
          try { return new URL(ad.landing_page_url).pathname.replace(/^\/|\/$/g, ""); }
          catch { return ""; }
        })();
        const metaAd = await runWithMetaConfig(metaCfg, () => createAd({
          name: ad.name,
          adSetId: resolvedAdSetId,
          creativeId: creative.id,
          status: "PAUSED",
          urlTags: `utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}&utm_term=${encodeURIComponent(pageSlug)}`,
        }));
        await db.from("meta_ads").update({ meta_ad_id: metaAd.id, status: "pushed" }).eq("id", ad.id);
      } catch (adError) {
        await db.from("meta_ads").update({
          status: "error",
          error_message: adError instanceof Error ? adError.message : "Failed",
        }).eq("id", ad.id);
      }
    }

    const queue = [...ads];
    const executing = new Set<Promise<void>>();
    for (const ad of queue) {
      const p = pushOneAd(ad).then(() => { executing.delete(p); });
      executing.add(p);
      if (executing.size >= CONCURRENCY) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);

    // Mark campaign as pushed only if at least one ad succeeded
    const hasSuccess = (await db
      .from("meta_ads")
      .select("id")
      .eq("campaign_id", id)
      .eq("status", "pushed")
      .limit(1)).data?.length;

    await db
      .from("meta_campaigns")
      .update({
        status: hasSuccess ? "pushed" : "error",
        ...(hasSuccess ? {} : { error_message: "All ads failed to push" }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Return updated campaign
    const { data: updated } = await db
      .from("meta_campaigns")
      .select("*, meta_ads(*)")
      .eq("id", id)
      .single();

    return NextResponse.json(updated);
  } catch (err) {
    await db
      .from("meta_campaigns")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message : "Push failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return safeError(err, "Push failed");
  }
}
