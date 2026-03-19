import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import { swipeCompetitorVideo } from "@/lib/swipe-competitor-video";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();
  const settings = await getWorkspaceSettings();

  const body = await req.json();
  const {
    gethookd_ad_id,
    video_url,
    thumbnail_url,
    title,
    body: adBody,
    brand_name,
    video_duration,
  } = body as {
    gethookd_ad_id?: number;
    video_url: string;
    thumbnail_url?: string;
    title?: string;
    body?: string;
    brand_name: string;
    video_duration?: number;
  };

  if (!video_url || !brand_name) {
    return NextResponse.json({ error: "Missing required fields (video_url, brand_name)" }, { status: 400 });
  }

  const productSlug = (settings as Record<string, unknown>).default_product as string || "happysleep";
  const isManual = !gethookd_ad_id;

  try {
    // Only track in discovered_ads when coming from GetHookd
    if (!isManual) {
      await db.from("discovered_ads").upsert({
        workspace_id: workspaceId,
        gethookd_ad_id,
        brand_name,
        title: title ?? "",
        body: adBody ?? "",
        media_urls: thumbnail_url ? [thumbnail_url] : [],
        source: "board",
        status: "swiping",
        ad_type: "video",
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,gethookd_ad_id" });
    }

    // Create a placeholder video_job so user can navigate to it
    const { data: job, error: jobErr } = await db
      .from("video_jobs")
      .insert({
        workspace_id: workspaceId,
        concept_name: `Swiping from ${brand_name}...`,
        product: productSlug,
        status: "draft",
        source: isManual ? "manual" : "autopilot",
        pipeline_mode: "multi_clip",
        target_languages: ["sv", "da", "no"],
        max_shots: 4,
        reuse_first_frame: true,
        swipe_progress: { step: "queued", message: "Waiting to start..." },
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      throw new Error(`Failed to create placeholder video job: ${jobErr?.message}`);
    }

    const videoJobId = job.id;

    // Update discovered_ads with the video job ID (only for GetHookd ads)
    if (!isManual) {
      await db.from("discovered_ads")
        .update({ video_job_id: videoJobId, updated_at: new Date().toISOString() })
        .eq("gethookd_ad_id", gethookd_ad_id)
        .eq("workspace_id", workspaceId);
    }

    // Run the full pipeline in background after response is sent
    after(async () => {
      try {
        const result = await swipeCompetitorVideo({
          workspaceId,
          productSlug,
          competitorVideoUrl: video_url,
          competitorAdCopy: adBody,
          brandName: brand_name,
          videoDuration: video_duration,
          gethookdAdId: gethookd_ad_id,
          notifyTelegram: true,
          existingJobId: videoJobId,
        });

        // Update discovered_ads status (only for GetHookd ads)
        if (!isManual) {
          await db.from("discovered_ads")
            .update({ status: "swiped", updated_at: new Date().toISOString() })
            .eq("gethookd_ad_id", gethookd_ad_id)
            .eq("workspace_id", workspaceId);
        }

        console.log(`[ad-spy/swipe-video] Complete: ${result.conceptName} (${result.shotsCreated} shots)`);
      } catch (err) {
        console.error("[ad-spy/swipe-video] Background error:", err);

        // Mark job as failed
        await db.from("video_jobs").update({
          swipe_progress: { step: "error", message: err instanceof Error ? err.message : "Video swipe failed" },
        }).eq("id", videoJobId);

        if (!isManual) {
          await db.from("discovered_ads")
            .update({ status: "skipped", updated_at: new Date().toISOString() })
            .eq("gethookd_ad_id", gethookd_ad_id)
            .eq("workspace_id", workspaceId);
        }
      }
    });

    // Return immediately with the video job ID
    return NextResponse.json({ ok: true, videoJobId });
  } catch (err) {
    console.error("[ad-spy/swipe-video] Error:", err);

    if (!isManual) {
      await db.from("discovered_ads")
        .update({ status: "skipped", updated_at: new Date().toISOString() })
        .eq("gethookd_ad_id", gethookd_ad_id)
        .eq("workspace_id", workspaceId);
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Video swipe failed" },
      { status: 500 }
    );
  }
}
