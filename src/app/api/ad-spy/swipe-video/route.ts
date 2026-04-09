import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceSettings, getWorkspaceLanguages } from "@/lib/workspace";
import { swipeCompetitorVideo, type VideoSwipeStyle, type VideoMode } from "@/lib/swipe-competitor-video";
import type { SwipeVideoFormatId } from "@/lib/video-format-aesthetics";

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
    brand_name: rawBrandName,
    video_duration,
    video_style,
    video_format,
    style_notes,
    video_mode,
  } = body as {
    gethookd_ad_id?: number;
    video_url: string;
    thumbnail_url?: string;
    title?: string;
    body?: string;
    brand_name?: string;
    video_duration?: number;
    video_style?: VideoSwipeStyle;
    video_format?: SwipeVideoFormatId;
    style_notes?: string;
    video_mode?: VideoMode;
  };

  // Brand name is optional for manual uploads — fall back to "Competitor" so
  // pipelines that need a non-empty label keep working. GetHookd ads always
  // supply a real brand name so this default only kicks in for manual uploads.
  const brand_name = (rawBrandName || "").trim() || "Competitor";

  const videoStyle: VideoSwipeStyle =
    video_style === "pixar_animation" ? "pixar_animation" : "ugc";
  const isPixar = videoStyle === "pixar_animation";
  // Format override only applies to UGC (Pixar always uses its own prompt)
  const videoFormat: SwipeVideoFormatId | undefined =
    !isPixar && video_format ? video_format : undefined;
  const styleNotes: string | undefined =
    !isPixar && style_notes?.trim() ? style_notes.trim() : undefined;
  // Shot-structure mode. Pixar always runs "simple" internally so ignore
  // multicut unless we're in UGC mode. Default is "simple".
  const videoMode: VideoMode =
    !isPixar && video_mode === "multicut" ? "multicut" : "simple";
  const isMultiCut = videoMode === "multicut";

  if (!video_url) {
    return NextResponse.json({ error: "Missing required field (video_url)" }, { status: 400 });
  }

  const productSlug = (settings as Record<string, unknown>).default_product as string;
  if (!productSlug) {
    return NextResponse.json({ error: "No default_product configured in workspace settings" }, { status: 400 });
  }
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
        target_languages: await getWorkspaceLanguages(),
        // Multi-cut defaults to 10 shots; Pixar uses 5; simple UGC uses 4
        max_shots: isMultiCut ? 10 : isPixar ? 5 : 4,
        // Multi-cut uses per-shot keyframes (rapid-cut edit needs variety)
        reuse_first_frame: !isPixar && !isMultiCut,
        format_type: isPixar ? "pixar_animation" : null,
        video_mode: videoMode,
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
          notifyTelegram: !isManual,
          existingJobId: videoJobId,
          videoStyle,
          videoFormat,
          styleNotes,
          videoMode,
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
