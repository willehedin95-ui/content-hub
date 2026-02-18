import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import {
  createCampaign,
  createAdSet,
  uploadImage,
  createAdCreative,
  createAd,
} from "@/lib/meta";

export const maxDuration = 180;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Load campaign with ads
  const { data: campaign, error } = await db
    .from("meta_campaigns")
    .select("*, meta_ads(*)")
    .eq("id", id)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status === "pushed") {
    return NextResponse.json({ error: "Campaign already pushed" }, { status: 400 });
  }

  // Mark as pushing
  await db
    .from("meta_campaigns")
    .update({ status: "pushing", updated_at: new Date().toISOString() })
    .eq("id", id);

  try {
    // 1. Create or reuse Meta campaign
    let metaCampaignId = campaign.meta_campaign_id;

    if (!metaCampaignId) {
      const metaCampaign = await createCampaign({
        name: campaign.name,
        objective: campaign.objective,
        status: "PAUSED",
      });
      metaCampaignId = metaCampaign.id;

      await db
        .from("meta_campaigns")
        .update({ meta_campaign_id: metaCampaignId })
        .eq("id", id);
    }

    // 2. Create Meta ad set
    const metaAdSet = await createAdSet({
      name: `${campaign.name} - Ad Set`,
      campaignId: metaCampaignId,
      dailyBudget: campaign.daily_budget,
      countries: campaign.countries,
      startTime: campaign.start_time || undefined,
      endTime: campaign.end_time || undefined,
      status: "PAUSED",
    });

    await db
      .from("meta_campaigns")
      .update({ meta_adset_id: metaAdSet.id })
      .eq("id", id);

    // 3. Process each ad
    const ads = campaign.meta_ads ?? [];
    for (const ad of ads) {
      try {
        // Mark as uploading
        await db
          .from("meta_ads")
          .update({ status: "uploading" })
          .eq("id", ad.id);

        // Upload image
        const { hash: imageHash } = await uploadImage(ad.image_url);
        await db
          .from("meta_ads")
          .update({ meta_image_hash: imageHash })
          .eq("id", ad.id);

        // Create creative
        const creative = await createAdCreative({
          name: ad.name,
          imageHash,
          primaryText: ad.ad_copy,
          headline: ad.headline || undefined,
          linkUrl: ad.landing_page_url,
        });
        await db
          .from("meta_ads")
          .update({ meta_creative_id: creative.id })
          .eq("id", ad.id);

        // Create ad
        const metaAd = await createAd({
          name: ad.name,
          adSetId: metaAdSet.id,
          creativeId: creative.id,
          status: "PAUSED",
        });
        await db
          .from("meta_ads")
          .update({ meta_ad_id: metaAd.id, status: "pushed" })
          .eq("id", ad.id);
      } catch (adError) {
        await db
          .from("meta_ads")
          .update({
            status: "error",
            error_message: adError instanceof Error ? adError.message : "Failed",
          })
          .eq("id", ad.id);
      }
    }

    // Mark campaign as pushed
    await db
      .from("meta_campaigns")
      .update({ status: "pushed", updated_at: new Date().toISOString() })
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

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Push failed" },
      { status: 500 }
    );
  }
}
