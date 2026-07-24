import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { processPendingTranslationsForJob } from "@/lib/autopilot-translations";
import { startCronRun, completeCronRun, failCronRun } from "@/lib/cron-tracker";
import { sendTelegramNotification, escapeHtml } from "@/lib/telegram";

export const maxDuration = 800;

/**
 * Dead-man watchdog (audit 2026-07-07, I1): expected max interval in HOURS
 * for every cron scheduled in vercel.json. HARDCODED MIRROR of vercel.json
 * (2026-07-07) - update BOTH files when schedules change. If the newest
 * cron_runs row for a cron is older than 2x its interval, a critical
 * Telegram alert fires (max one per cron per 24h, deduped via a
 * "watchdog:<cron>" marker row in cron_runs).
 */
const WATCHDOG_EXPECTED_INTERVAL_HOURS: Record<string, number> = {
  "gsc-sync": 168, //              0 5 * * 1 (weekly)
  "gsc-gap-refresh": 168, //       0 6 * * 1 (weekly)
  "blog-link-depth-audit": 168, // 0 7 * * 1 (weekly)
  "blog-decay-check": 168, //      30 6 * * 1 (weekly)
  "blog-sunset-check": 744, //     0 7 1 * * (monthly)
  "blog-update-low-rank": 168, //  0 13 * * 5 (weekly)
  "research-scan": 24, //          0 10 * * *
  "research-themes": 168, //       0 11 * * 0 (weekly)
  "deliverability-sync": 24, //    0 12 * * *
  "reconcile-stuck-jobs": 0.5, //  */30 * * * *
  "ad-performance-sync": 12, //    0 6 + 0 18 * * *
  "daily-snapshot": 24, //         15 6 * * *
  "zero-spend-alert": 24, //       45 6 * * *
};

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
 * 7. Fail translations stuck in image_status "translating" >30 min - the
 *    bulk image batch is client-driven and a closed tab strands it (L1).
 * 8. Fail pages stuck in status "importing" >30 min - swiper imports are
 *    finished in the browser and a closed tab strands them (L3/L5).
 * 9. Fail video_jobs stuck in "generating" >24h (V3).
 * 10. Dead-man watchdog: alert when a scheduled cron has stopped logging
 *     cron_runs rows (I1).
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
    imageBatchesFailed: 0,
    importingPagesFailed: 0,
    videoJobsFailed: 0,
    formDeliveriesRetried: 0,
    formSyntheticTest: null as string | null,
    watchdogAlerts: [] as string[],
    watchdogNeverRun: [] as string[],
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

    // --- 7. Fail translations stuck in image_status "translating" >30 min ---
    // The bulk image batch drain bumps updated_at per image, so 30 min with
    // no bump means the client tab that drove the queue is gone (L1).
    const { data: strandedBatches, error: strandedBatchErr } = await db
      .from("translations")
      .update({
        image_status: "error",
        error_message: "Batch stranded - restart from the page",
        updated_at: new Date().toISOString(),
      })
      .eq("image_status", "translating")
      .lt("updated_at", cutoffDraft)
      .select("id");
    if (strandedBatchErr) {
      console.error("[Reconcile] Stranded image batch sweep failed:", strandedBatchErr.message);
    } else {
      summary.imageBatchesFailed = strandedBatches?.length ?? 0;
    }

    // --- 8. Fail pages stuck in "importing" >30 min ---
    // Swiper imports finish in the browser; a closed tab leaves the page in
    // "importing" forever (L3/L5). pages has no updated_at column, so age is
    // measured from created_at - imports normally complete within minutes.
    const { data: stuckImports, error: stuckImportErr } = await db
      .from("pages")
      .update({ status: "error" })
      .eq("status", "importing")
      .lt("created_at", cutoffDraft)
      .select("id");
    if (stuckImportErr) {
      console.error("[Reconcile] Stuck importing pages sweep failed:", stuckImportErr.message);
    } else {
      summary.importingPagesFailed = stuckImports?.length ?? 0;
    }

    // --- 9. Fail video_jobs stuck in "generating" >24h ---
    // 12 jobs sat in "generating" since April with nothing able to heal them
    // (V3). 24h is far beyond any legitimate render.
    const cutoffVideo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { data: stuckVideos, error: stuckVideoErr } = await db
      .from("video_jobs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("status", "generating")
      .lt("updated_at", cutoffVideo)
      .select("id");
    if (stuckVideoErr) {
      console.error("[Reconcile] Stuck video_jobs sweep failed:", stuckVideoErr.message);
    } else {
      summary.videoJobsFailed = stuckVideos?.length ?? 0;
    }

    // --- 9.5 Retry due form-submission deliveries (self-hosted forms) ---
    // Persist-first design: submissions sit in form_submissions until a
    // helpdesk delivery succeeds. This sweep is the cron-backed safety net;
    // exhausted retries alert via Telegram inside deliverSubmission.
    // Never let form sweep errors break the reconcile steps around it.
    try {
      const { sweepPendingDeliveries, runSyntheticFormTest } = await import("@/lib/form-delivery");
      summary.formDeliveriesRetried = await sweepPendingDeliveries(10);

      // Daily synthetic capture test, piggybacked on the 07:00-07:30 UTC run
      const nowDate = new Date();
      if (nowDate.getUTCHours() === 7 && nowDate.getUTCMinutes() < 30) {
        const synth = await runSyntheticFormTest();
        summary.formSyntheticTest = synth.ok ? "ok" : `failed: ${synth.error}`;
      }
    } catch (formErr) {
      console.error("[Reconcile] Form delivery sweep failed (non-fatal):", formErr);
    }

    // --- 10. Dead-man watchdog for scheduled crons ---
    // Never let watchdog errors break the reconcile sweeps above.
    try {
      const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
      for (const [cronName, intervalHours] of Object.entries(WATCHDOG_EXPECTED_INTERVAL_HOURS)) {
        const { data: lastRun } = await db
          .from("cron_runs")
          .select("started_at, status")
          .eq("cron_name", cronName)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!lastRun) {
          // No baseline yet (cron_runs wrappers are new) - surface in the
          // summary instead of alerting, so a cron that never logs is still
          // visible in /api/cron-status without spamming Telegram daily.
          summary.watchdogNeverRun.push(cronName);
          continue;
        }

        const ageMs = now - new Date(lastRun.started_at).getTime();
        const thresholdMs = intervalHours * 2 * 60 * 60 * 1000;
        if (ageMs <= thresholdMs) continue;

        // Dedupe: max one alert per cron per 24h via a marker row
        const dedupeCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentAlert } = await db
          .from("cron_runs")
          .select("id")
          .eq("cron_name", `watchdog:${cronName}`)
          .gte("started_at", dedupeCutoff)
          .limit(1)
          .maybeSingle();
        if (recentAlert) continue;

        const ageHours = Math.round(ageMs / (60 * 60 * 1000));
        await db.from("cron_runs").insert({
          cron_name: `watchdog:${cronName}`,
          status: "completed",
          completed_at: new Date().toISOString(),
          result_summary: `Alerted: last ${cronName} run ${ageHours}h ago (expected every ${intervalHours}h)`,
        });

        if (chatId) {
          await sendTelegramNotification(
            chatId,
            `🐕 <b>Cron-watchdog: ${escapeHtml(cronName)} verkar död</b>\n\n` +
              `Senaste körning: ${ageHours}h sedan (förväntad var ${intervalHours}h, larmgräns 2x).\n` +
              `Senaste status: <code>${escapeHtml(lastRun.status ?? "unknown")}</code>\n\n` +
              `Kolla Vercel cron-loggarna och /api/cron-status.`,
            { critical: true }
          );
        }
        summary.watchdogAlerts.push(cronName);
      }
    } catch (watchdogErr) {
      console.error("[Reconcile] Watchdog failed (non-fatal):", watchdogErr);
    }

    const totalActions =
      summary.translationsReset +
      summary.translationJobs.length +
      summary.draftsPromoted.length +
      summary.genesisDraftsFailed.length +
      summary.jobsCompleted.length +
      summary.jobsFailed.length +
      summary.discoveredAdsReset +
      summary.imageBatchesFailed +
      summary.importingPagesFailed +
      summary.videoJobsFailed +
      summary.formDeliveriesRetried +
      summary.watchdogAlerts.length;

    if (totalActions > 0) {
      console.log("[Reconcile] Recovered stuck states:", JSON.stringify(summary));
    }

    await completeCronRun(
      cronRunId,
      `${summary.translationsReset} translations reset, ${summary.translationJobs.length} jobs drained, ${summary.draftsPromoted.length} drafts promoted, ${summary.genesisDraftsFailed.length} genesis drafts failed, ${summary.jobsCompleted.length} completed, ${summary.jobsFailed.length} failed, ${summary.imageBatchesFailed} image batches failed, ${summary.importingPagesFailed} importing pages failed, ${summary.videoJobsFailed} video jobs failed` +
        (summary.watchdogAlerts.length > 0 ? `, watchdog alerts: ${summary.watchdogAlerts.join("/")}` : "") +
        (summary.watchdogNeverRun.length > 0 ? `, never run: ${summary.watchdogNeverRun.join("/")}` : "")
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
