import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { processPendingTranslationsForJob } from "@/lib/autopilot-translations";
import { startCronRun, completeCronRun, failCronRun } from "@/lib/cron-tracker";

export const maxDuration = 800;

// Serial per-job translation processing: each job can run two Kie passes
// (primary + 9:16) at up to ~280s poll each, so cap jobs per run to stay
// inside maxDuration. The cron runs every 30 min, so backlogs drain quickly.
const MAX_TRANSLATION_JOBS_PER_RUN = 2;

const STUCK_MS = 2 * 60 * 60 * 1000; // 2 hours
const STALE_DRAFT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Slim self-healing cron (every 30 min). The old pipeline-push cron carried
 * this reconcile logic but was unscheduled 2026-04-27 because of its
 * auto-push behavior - this route recovers stuck states WITHOUT pushing
 * anything to Meta.
 *
 * Actions:
 * 1. Reset image_translations stuck in "processing" >2h back to "pending".
 * 2. Process pending translations server-side for affected jobs (rows
 *    stranded by closed browser tabs or the resets above).
 * 3. Promote stale drafts: with images -> ready; without images and without
 *    visual_direction -> ready (nothing will ever generate images for them).
 * 4. Fail genesis drafts (visual_direction set, no images, >2h) whose
 *    after() image generation died.
 * 5. Settle jobs stuck in "processing" >2h with no active translations:
 *    completed if any translation completed, failed otherwise.
 * 6. Reset discovered_ads stuck in "swiping" (killed swipe runs).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();
  const cronRunId = await startCronRun("reconcile-stuck-jobs");

  const now = Date.now();
  const cutoffStuck = new Date(now - STUCK_MS).toISOString();
  const cutoffDraft = new Date(now - STALE_DRAFT_MS).toISOString();

  const summary = {
    translationsReset: 0,
    translationJobs: [] as Array<{ jobId: string; processed: number; failed: number; error?: string }>,
    translationJobsSkipped: 0,
    draftsPromoted: [] as string[],
    genesisDraftsFailed: [] as string[],
    jobsCompleted: [] as string[],
    jobsFailed: [] as string[],
    discoveredAdsReset: 0,
  };

  try {
    // --- 1. Reset stuck "processing" translations back to "pending" ---
    const affectedJobIds = new Set<string>();

    const { data: stuckTranslations } = await db
      .from("image_translations")
      .select("id, source_images!inner(job_id)")
      .eq("status", "processing")
      .lt("updated_at", cutoffStuck)
      .limit(500);

    if (stuckTranslations && stuckTranslations.length > 0) {
      const ids = stuckTranslations.map((t) => t.id);
      const { error: resetErr } = await db
        .from("image_translations")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .in("id", ids);
      if (!resetErr) {
        summary.translationsReset = ids.length;
        for (const t of stuckTranslations) {
          const si = Array.isArray(t.source_images) ? t.source_images[0] : t.source_images;
          if (si?.job_id) affectedJobIds.add(si.job_id as string);
        }
      }
    }

    // --- 2. Find jobs with stale pending rows and process them server-side ---
    // Covers browser-driven flows (9:16 generate, retry) where a closed tab
    // strands pending rows forever, plus the rows reset in step 1.
    const { data: stalePending } = await db
      .from("image_translations")
      .select("id, source_images!inner(job_id)")
      .eq("status", "pending")
      .lt("updated_at", cutoffStuck)
      .limit(500);

    for (const t of stalePending ?? []) {
      const si = Array.isArray(t.source_images) ? t.source_images[0] : t.source_images;
      if (si?.job_id) affectedJobIds.add(si.job_id as string);
    }

    if (affectedJobIds.size > 0) {
      // Never burn Kie credits on archived jobs
      const { data: candidateJobs } = await db
        .from("image_jobs")
        .select("id")
        .in("id", [...affectedJobIds])
        .is("archived_at", null);

      const processable = (candidateJobs ?? []).map((j) => j.id as string);
      summary.translationJobsSkipped = Math.max(0, processable.length - MAX_TRANSLATION_JOBS_PER_RUN);

      for (const jobId of processable.slice(0, MAX_TRANSLATION_JOBS_PER_RUN)) {
        try {
          const result = await processPendingTranslationsForJob(jobId);
          summary.translationJobs.push({ jobId, ...result });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[Reconcile] Translation processing failed for job ${jobId}:`, err);
          summary.translationJobs.push({ jobId, processed: 0, failed: 0, error: msg });
        }
      }
    }

    // --- 3 + 4. Stale drafts: promote or fail ---
    // Not restricted by source column: genesis jobs have source "hub", so the
    // old autopilot/competitor_swipe filter missed them entirely.
    const { data: staleDrafts } = await db
      .from("image_jobs")
      .select("id, name, created_at, visual_direction, pending_competitor_gen, source_images(id)")
      .eq("status", "draft")
      .is("archived_at", null)
      .lt("created_at", cutoffDraft)
      .limit(200);

    const promoteIds: string[] = [];
    const failIds: string[] = [];
    for (const j of staleDrafts ?? []) {
      const imgs = j.source_images as { id: string }[] | null;
      const hasImages = !!imgs && imgs.length > 0;
      if (hasImages) {
        promoteIds.push(j.id);
      } else if (!j.visual_direction) {
        // No images and no visual direction: nothing will ever generate
        // images, so surface it in /review instead of "Generating..." limbo.
        promoteIds.push(j.id);
      } else if (
        !j.pending_competitor_gen &&
        new Date(j.created_at).getTime() < now - STUCK_MS
      ) {
        // Genesis-style draft: visual_direction set but the after() image
        // generation died before producing anything. pending_competitor_gen
        // jobs are excluded - their generation is triggered from the detail
        // page and requires draft status.
        failIds.push(j.id);
      }
    }

    if (promoteIds.length > 0) {
      const { error: promoteErr } = await db
        .from("image_jobs")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .in("id", promoteIds);
      if (!promoteErr) summary.draftsPromoted = promoteIds;
    }

    if (failIds.length > 0) {
      const { error: failErr } = await db
        .from("image_jobs")
        .update({
          status: "failed",
          swipe_progress: {
            step: "error",
            message: "Image generation never produced any images - the background render died after concept creation. Reconcile cron marked the concept failed after 2h.",
          },
          updated_at: new Date().toISOString(),
        })
        .in("id", failIds);
      if (!failErr) summary.genesisDraftsFailed = failIds;
    }

    // --- 5. Settle jobs stuck in "processing" with no active translations ---
    // Jobs touched in step 2 got a fresh updated_at, so they are excluded here.
    const { data: stuckProcessing } = await db
      .from("image_jobs")
      .select("id")
      .eq("status", "processing")
      .lt("updated_at", cutoffStuck)
      .limit(100);

    for (const j of stuckProcessing ?? []) {
      const { data: trans } = await db
        .from("image_translations")
        .select("status, source_images!inner(job_id)")
        .eq("source_images.job_id", j.id);

      const statuses = (trans ?? []).map((t) => t.status as string);
      const hasActive = statuses.some((s) => s === "pending" || s === "processing");
      if (hasActive) continue; // step 2 drains these on upcoming runs

      const anyCompleted = statuses.some((s) => s === "completed");
      if (anyCompleted) {
        await db
          .from("image_jobs")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", j.id);
        summary.jobsCompleted.push(j.id);
      } else {
        await db
          .from("image_jobs")
          .update({
            status: "failed",
            swipe_progress: {
              step: "error",
              message: statuses.length > 0
                ? "All image translations failed - job stuck in processing with zero completed translations. Reconcile cron marked it failed after 2h."
                : "Job stuck in processing with no translation rows. Reconcile cron marked it failed after 2h.",
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", j.id);
        summary.jobsFailed.push(j.id);
      }
    }

    // --- 6. Reset stuck "swiping" discovered_ads rows ---
    // 15 min is well past the worst-case swipe duration, so anything older
    // was orphaned by a killed swipeCompetitorAd run.
    const cutoffSwipe = new Date(now - 15 * 60 * 1000).toISOString();
    const { data: stuckSwipes, error: stuckSwipeErr } = await db
      .from("discovered_ads")
      .update({ status: "skipped", updated_at: new Date().toISOString() })
      .eq("status", "swiping")
      .lt("updated_at", cutoffSwipe)
      .select("id");

    if (!stuckSwipeErr && stuckSwipes) {
      summary.discoveredAdsReset = stuckSwipes.length;
    }

    const totalActions =
      summary.translationsReset +
      summary.translationJobs.length +
      summary.draftsPromoted.length +
      summary.genesisDraftsFailed.length +
      summary.jobsCompleted.length +
      summary.jobsFailed.length +
      summary.discoveredAdsReset;

    if (totalActions > 0) {
      console.log("[Reconcile] Recovered stuck states:", JSON.stringify(summary));
    }

    await completeCronRun(
      cronRunId,
      `${summary.translationsReset} translations reset, ${summary.translationJobs.length} jobs drained, ${summary.draftsPromoted.length} drafts promoted, ${summary.genesisDraftsFailed.length} genesis drafts failed, ${summary.jobsCompleted.length} completed, ${summary.jobsFailed.length} failed`
    );

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[Reconcile] Error:", err);
    await failCronRun(cronRunId, err instanceof Error ? err.message : "Reconcile cron failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reconcile cron failed", partial: summary },
      { status: 500 }
    );
  }
}
