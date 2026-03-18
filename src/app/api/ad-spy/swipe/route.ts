import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import { swipeCompetitorAd } from "@/lib/swipe-competitor";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();
  const settings = await getWorkspaceSettings();

  const body = await req.json();
  const {
    gethookd_ad_id,
    media_urls,
    title,
    body: adBody,
    brand_name,
    pain_point,
  } = body as {
    gethookd_ad_id: number;
    media_urls: string[];
    title?: string;
    body?: string;
    brand_name: string;
    pain_point?: string;
  };

  if (!gethookd_ad_id || !media_urls?.length || !brand_name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const productSlug = (settings as Record<string, unknown>).default_product as string || "happysleep";

  try {
    // Upsert into discovered_ads
    await db.from("discovered_ads").upsert({
      workspace_id: workspaceId,
      gethookd_ad_id,
      brand_name,
      title: title ?? "",
      body: adBody ?? "",
      media_urls,
      source: "board",
      status: "swiping",
      pain_point: pain_point || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,gethookd_ad_id" });

    // Create a placeholder job immediately so the user can navigate to it
    const { data: job, error: jobErr } = await db
      .from("image_jobs")
      .insert({
        workspace_id: workspaceId,
        name: `Swiping from ${brand_name}...`,
        product: productSlug,
        status: "draft",
        source: "autopilot",
        target_languages: ["sv", "da", "no"],
        target_ratios: ["4:5", "9:16"],
        tags: ["competitor-swipe", "ad-spy"],
        // Store competitor data so the detail page can show it
        competitor_reference_data: {
          competitor_image_urls: media_urls.slice(0, 3),
          product_hero_urls: [],
        },
        // swipe_progress tracks pipeline steps for the UI
        swipe_progress: { step: "queued", message: "Waiting to start..." },
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      throw new Error(`Failed to create placeholder job: ${jobErr?.message}`);
    }

    const jobId = job.id;

    // Update discovered_ads with the job ID immediately
    await db.from("discovered_ads")
      .update({ image_job_id: jobId, updated_at: new Date().toISOString() })
      .eq("gethookd_ad_id", gethookd_ad_id)
      .eq("workspace_id", workspaceId);

    // Run the full pipeline in the background after response is sent
    after(async () => {
      try {
        const result = await swipeCompetitorAd({
          workspaceId,
          productSlug,
          competitorImageUrls: media_urls.slice(0, 3),
          competitorAdCopy: adBody,
          brandName: brand_name,
          gethookdAdId: gethookd_ad_id,
          notifyTelegram: false,
          existingJobId: jobId,
          painPoint: pain_point,
        });

        // Update discovered_ads status
        await db.from("discovered_ads")
          .update({ status: "swiped", updated_at: new Date().toISOString() })
          .eq("gethookd_ad_id", gethookd_ad_id)
          .eq("workspace_id", workspaceId);

        console.log(`[ad-spy/swipe] Complete: ${result.conceptName} (#${result.conceptNumber})`);
      } catch (err) {
        console.error("[ad-spy/swipe] Background error:", err);

        // Mark job as failed
        await db.from("image_jobs").update({
          swipe_progress: { step: "error", message: err instanceof Error ? err.message : "Swipe failed" },
        }).eq("id", jobId);

        await db.from("discovered_ads")
          .update({ status: "skipped", updated_at: new Date().toISOString() })
          .eq("gethookd_ad_id", gethookd_ad_id)
          .eq("workspace_id", workspaceId);
      }
    });

    // Return immediately with the job ID
    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    console.error("[ad-spy/swipe] Error:", err);

    await db.from("discovered_ads")
      .update({ status: "skipped", updated_at: new Date().toISOString() })
      .eq("gethookd_ad_id", gethookd_ad_id)
      .eq("workspace_id", workspaceId);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Swipe failed" },
      { status: 500 }
    );
  }
}
