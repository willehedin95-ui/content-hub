import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { calculateAvailableBudget, getLaunchpadConcepts, syncPipelineMetrics, MAX_CONCEPTS_PER_BATCH, COLD_START_BATCH_SIZE } from "@/lib/pipeline";
import { pushConceptToMeta } from "@/lib/meta-push";
import { pushVideoToMeta } from "@/lib/meta-video-push";
import { setMetaConfig } from "@/lib/meta";
import { notifyStageTransitions } from "@/lib/telegram-notify";
import { sendMessage } from "@/lib/telegram";
import { startCronRun, completeCronRun, failCronRun } from "@/lib/cron-tracker";


export const maxDuration = 800;

const MARKET_TO_LANG: Record<string, string> = { NO: "no", DK: "da", SE: "sv" };

/**
 * Daily pipeline cron (03:00 UTC):
 * 1. Sync metrics from Meta -> detect stage transitions (auto-kill, promote to review/active)
 * 2. Push launch pad concepts to Meta when budget allows (per market, per format)
 */
export async function GET(req: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();
  const cronRunId = await startCronRun("pipeline-push");

  try {
    // Step 0: Reconcile stuck jobs (recovery for incomplete pipeline runs)
    // This catches concepts that got stuck because Vercel timed out mid-execution
    // or because an upstream call failed and the status update never ran.
    const reconcileResult = await reconcileStuckJobs(db);
    if (reconcileResult.totalReset > 0) {
      console.log(`[Pipeline Cron] Reconciled ${reconcileResult.totalReset} stuck jobs:`, reconcileResult);
    }

    // Step 1: Sync metrics and detect stage transitions
    console.log("[Pipeline Cron] Syncing metrics and detecting stage transitions...");
    const syncResult = await syncPipelineMetrics();
    console.log(`[Pipeline Cron] Synced ${syncResult.synced} metrics, ${syncResult.transitions.length} stage transitions`);

    if (syncResult.transitions.length > 0) {
      await notifyStageTransitions(syncResult.transitions);
    }

    if (syncResult.errors.length > 0) {
      console.warn("[Pipeline Cron] Sync errors:", syncResult.errors);
    }

    // Old AB test conversion sync removed — now using ad-level page testing

    // Step 2: Push from launch pad based on available budget per market (format-aware)
    // Fetch all workspaces with Meta config (needed for pushing)
    const { data: allWorkspaces } = await db
      .from("workspaces")
      .select("id, slug, settings, meta_config");

    const pushWorkspaces = (allWorkspaces ?? []).filter((ws) => ws.meta_config != null);

    if (pushWorkspaces.length === 0) {
      return NextResponse.json({
        message: "Sync complete, no workspaces with Meta config",
        syncedMetrics: syncResult.synced,
        stageTransitions: syncResult.transitions.length,
        pushed: 0,
      });
    }

    const multiWs = pushWorkspaces.length > 1;
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    const allResults: Array<{ workspace: string; results: Array<{ concept: string; type: string; market: string; status: string; error?: string }> }> = [];

    for (const workspace of pushWorkspaces) {
      const wsId = workspace.id;
      const label = multiWs ? `[${workspace.slug}] ` : "";
      const wsSettings = (workspace.settings ?? {}) as Record<string, unknown>;
      const metaConfig = workspace.meta_config as Record<string, unknown>;

      try {
        setMetaConfig(metaConfig as Parameters<typeof setMetaConfig>[0]);

        const budgets = await calculateAvailableBudget(wsId);
        const launchpadConcepts = await getLaunchpadConcepts(wsId);

        if (launchpadConcepts.length === 0) {
          allResults.push({ workspace: workspace.slug, results: [] });
          continue;
        }

        // Filter out image concepts whose translations aren't complete yet
        const imageConceptIds = launchpadConcepts.filter((c) => c.type === "image").map((c) => c.conceptId);
        const { data: jobStatuses } = imageConceptIds.length > 0
          ? await db.from("image_jobs").select("id, status, ad_copy_translations").in("id", imageConceptIds)
          : { data: [] as { id: string; status: string; ad_copy_translations: unknown }[] };

        const completedJobIds = new Set((jobStatuses ?? []).filter((j) => j.status === "completed").map((j) => j.id));
        const statusMap = new Map((jobStatuses ?? []).map((j) => [j.id, j.status]));

        // Auto-approve translations stuck in "review" for 12+ hours
        // (reduced from 48h — most Haiku complaints are minor grammar/style issues)
        const TRANSLATION_AUTO_APPROVE_MS = 12 * 60 * 60 * 1000;
        const autoApprovedJobIds: string[] = [];
        for (const j of jobStatuses ?? []) {
          const t = j.ad_copy_translations as Record<string, { status?: string; reviewed_at?: string }> | null;
          if (!t) continue;
          let updated = false;
          for (const [lang, trans] of Object.entries(t)) {
            if (trans.status !== "review") continue;
            const reviewedAt = trans.reviewed_at ? new Date(trans.reviewed_at).getTime() : 0;
            if (!reviewedAt) {
              // Legacy data: set reviewed_at now, will auto-approve in 48h
              t[lang] = { ...trans, reviewed_at: new Date().toISOString() };
              updated = true;
              continue;
            }
            if (Date.now() - reviewedAt >= TRANSLATION_AUTO_APPROVE_MS) {
              t[lang] = { ...trans, status: "completed" };
              updated = true;
              console.log(`[Pipeline Push] ${label}Auto-approved ${lang} translation for job ${j.id} (12h timeout)`);
            }
          }
          if (updated) {
            await db.from("image_jobs")
              .update({ ad_copy_translations: t, updated_at: new Date().toISOString() })
              .eq("id", j.id);
            // Check if all translations are now completed
            const allCompleted = Object.values(t).every((v) => v.status === "completed");
            if (allCompleted && j.status !== "completed") {
              await db.from("image_jobs").update({ status: "completed" }).eq("id", j.id);
              completedJobIds.add(j.id);
              autoApprovedJobIds.push(j.id);
            }
          }
        }

        if (autoApprovedJobIds.length > 0) {
          console.log(`[Pipeline Push] ${label}Auto-approved translations for ${autoApprovedJobIds.length} concepts`);
          await db.from("autopilot_actions").insert(
            autoApprovedJobIds.map((id) => ({
              workspace_id: wsId,
              action_type: "translation_auto_approved",
              target_id: id,
              target_name: `Job ${id.slice(0, 8)}`,
              details: { reason: "48h_timeout" },
              success: true,
            }))
          );
        }

        // Quality gate: block concepts with translations still in "review" status
        const reviewBlockedIds = new Set(
          (jobStatuses ?? []).filter((j) => {
            const t = j.ad_copy_translations as Record<string, { status?: string }> | null;
            if (!t) return false;
            return Object.values(t).some((v) => v.status === "review");
          }).map((j) => j.id)
        );

        const results: Array<{ concept: string; type: string; market: string; status: string; error?: string }> = [];

        // Track how many we've pushed per market+format so we respect MAX_CONCEPTS_PER_BATCH
        const pushCounts: Record<string, number> = {}; // key: "market:format"

        for (const [market, budget] of Object.entries(budgets)) {
          // Cold start cooldown: recently pushed to a fresh market, waiting for data
          if (budget.coldStartCooldown) {
            console.log(`[Pipeline Push] ${label}${market}: Cold start cooldown (${budget.cooldownDaysLeft ?? "?"} days left) — skipping`);
            continue;
          }

          for (const format of ["image", "video"] as const) {
            const formatBudget = budget[format];
            // Log compression info but don't block pushing — always allow new creative
            if (formatBudget.canPush <= 0) {
              console.log(`[Pipeline Push] ${label}${market}/${format}: Low compression headroom (${formatBudget.available} ${formatBudget.currency}), pushing anyway`);
            }

            const countKey = `${market}:${format}`;
            pushCounts[countKey] = 0;

            // Sort concepts by this market's priority (fall back to global priority)
            const sortedConcepts = [...launchpadConcepts].sort((a, b) => {
              const aPrio = a.marketPriorities?.[market] ?? a.priority;
              const bPrio = b.marketPriorities?.[market] ?? b.priority;
              return aPrio - bPrio;
            });

            for (const concept of sortedConcepts) {
              if (concept.type !== format) continue;
              // Skip image concepts whose translations aren't complete
              if (concept.type === "image" && !completedJobIds.has(concept.conceptId)) {
                const status = statusMap.get(concept.conceptId) ?? "unknown";
                console.log(`[Pipeline Push] ${label}Skipping "${concept.name}" — translations not complete (status: ${status})`);
                continue;
              }
              // Skip image concepts with translations pending quality review
              if (concept.type === "image" && reviewBlockedIds.has(concept.conceptId)) {
                console.log(`[Pipeline Push] ${label}Skipping "${concept.name}" — translation quality review pending`);
                continue;
              }
              const batchLimit = formatBudget.activeAdSets === 0 ? COLD_START_BATCH_SIZE : MAX_CONCEPTS_PER_BATCH;
              if (pushCounts[countKey] >= batchLimit) break;

              const marketEntry = concept.markets.find((m) => m.market === market);
              if (!marketEntry || marketEntry.stage !== "launchpad") continue;

              const lang = MARKET_TO_LANG[market];
              if (!lang) continue;

              // Count attempts (not just successes) to enforce batch limit even on failures
              pushCounts[countKey]++;

              try {
                console.log(`[Pipeline Push] ${label}Pushing ${concept.type} "${concept.name}" to ${market} (budget: ${formatBudget.available} ${formatBudget.currency})...`);

                if (concept.type === "video") {
                  // Video push — pushVideoToMeta handles meta_campaigns tracking internally
                  const pushResult = await pushVideoToMeta(concept.conceptId, { languages: [lang], workspaceId: wsId });
                  const langResult = pushResult.results.find((r) => r.language === lang)
                    ?? pushResult.results[0]; // Fallback to first result if language lookup fails

                  if (langResult?.status === "pushed") {
                    // Clear push error for this market
                    const existingErrors = ((await db.from("video_jobs").select("push_errors").eq("id", concept.conceptId).single()).data?.push_errors ?? {}) as Record<string, unknown>;
                    delete existingErrors[market];
                    await db.from("video_jobs").update({ push_errors: Object.keys(existingErrors).length > 0 ? existingErrors : null }).eq("id", concept.conceptId);

                    results.push({ concept: concept.name, type: "video", market, status: "pushed" });

                    // Check if all markets pushed -> clear from launch pad
                    const allMarkets = concept.markets.map((m) => m.market);
                    const pushedMarkets = new Set<string>();
                    const { data: videoMeta } = await db
                      .from("meta_campaigns")
                      .select("language, status")
                      .eq("video_job_id", concept.conceptId);

                    const langToMarket: Record<string, string> = { sv: "SE", da: "DK", no: "NO" };
                    for (const mc of videoMeta ?? []) {
                      if (mc.status === "pushed" || mc.status === "active") {
                        const mkt = langToMarket[mc.language];
                        if (mkt) pushedMarkets.add(mkt);
                      }
                    }

                    const allPushed = allMarkets.every((m) => pushedMarkets.has(m));
                    if (allPushed) {
                      await db.from("video_jobs").update({ launchpad_priority: null }).eq("id", concept.conceptId);
                    }
                  } else {
                    // Record push error for this market
                    const existingErrors = ((await db.from("video_jobs").select("push_errors").eq("id", concept.conceptId).single()).data?.push_errors ?? {}) as Record<string, unknown>;
                    existingErrors[market] = { error: langResult?.error ?? "Unknown", at: new Date().toISOString() };
                    await db.from("video_jobs").update({ push_errors: existingErrors }).eq("id", concept.conceptId);

                    results.push({ concept: concept.name, type: "video", market, status: "failed", error: langResult?.error ?? "Unknown" });
                  }
                } else {
                  // Image push (original logic with concept_lifecycle)
                  const pushResult = await pushConceptToMeta(concept.conceptId, {
                    languages: [lang],
                    workspaceId: wsId,
                    metaConfig,
                    wsSettings,
                  });
                  const langResult = pushResult.results.find((r) => r.language === lang)
                    ?? pushResult.results[0]; // Fallback to first result if language lookup fails

                  if (langResult?.status === "pushed") {
                    const now = new Date().toISOString();

                    // Clear push error for this market
                    await db.from("image_job_markets").update({ last_push_error: null, last_push_error_at: null }).eq("id", marketEntry.imageJobMarketId);

                    await db
                      .from("concept_lifecycle")
                      .update({ exited_at: now })
                      .eq("image_job_market_id", marketEntry.imageJobMarketId)
                      .eq("stage", "launchpad")
                      .is("exited_at", null);

                    await db.from("concept_lifecycle").insert({
                      image_job_market_id: marketEntry.imageJobMarketId,
                      stage: "testing",
                      entered_at: now,
                      signal: "auto_pushed_budget_aware",
                    });

                    results.push({ concept: concept.name, type: "image", market, status: "pushed" });

                    // Check if concept fully pushed -> clear from launch pad
                    const { data: remaining } = await db
                      .from("concept_lifecycle")
                      .select("stage")
                      .in("image_job_market_id", concept.markets.map((m) => m.imageJobMarketId))
                      .eq("stage", "launchpad")
                      .is("exited_at", null);

                    if (!remaining || remaining.length === 0) {
                      await db.from("image_jobs").update({ launchpad_priority: null }).eq("id", concept.conceptId);
                    }
                  } else {
                    // Record push error for this market
                    await db.from("image_job_markets").update({
                      last_push_error: langResult?.error ?? "Unknown",
                      last_push_error_at: new Date().toISOString(),
                    }).eq("id", marketEntry.imageJobMarketId);

                    results.push({ concept: concept.name, type: "image", market, status: "failed", error: langResult?.error ?? "Unknown" });
                  }
                }
              } catch (err) {
                const errorMsg = err instanceof Error ? err.message : "Unknown error";

                // Record push error for the market (best-effort)
                try {
                  if (concept.type === "image" && marketEntry?.imageJobMarketId) {
                    await db.from("image_job_markets").update({
                      last_push_error: errorMsg,
                      last_push_error_at: new Date().toISOString(),
                    }).eq("id", marketEntry.imageJobMarketId);
                  } else if (concept.type === "video") {
                    const existingErrors = ((await db.from("video_jobs").select("push_errors").eq("id", concept.conceptId).single()).data?.push_errors ?? {}) as Record<string, unknown>;
                    existingErrors[market] = { error: errorMsg, at: new Date().toISOString() };
                    await db.from("video_jobs").update({ push_errors: existingErrors }).eq("id", concept.conceptId);
                  }
                } catch { /* don't let error tracking failure propagate */ }

                results.push({ concept: concept.name, type: concept.type, market, status: "failed", error: errorMsg });
              }
            }
          }
        }

        // Send Telegram summary for this workspace
        if (results.length > 0 && chatId) {
          const pushed = results.filter((r) => r.status === "pushed");
          const failed = results.filter((r) => r.status === "failed");
          const remaining = await getLaunchpadConcepts(wsId);

          const lines = [
            `\u{1F680} ${label}Auto-push results:`,
            ...pushed.map((r) => `  \u2705 [${r.type}] ${r.concept} \u2192 ${r.market}`),
            ...failed.map((r) => `  \u274C [${r.type}] ${r.concept} \u2192 ${r.market}: ${r.error}`),
            ``,
            `\u{1F4CB} Launch pad: ${remaining.length} concepts remaining`,
            ...Object.entries(budgets).map(([m, b]) => `  ${m}: ${b.available} ${b.currency} available (img: ${b.image.canPush}, vid: ${b.video.canPush})`),
          ];

          await sendMessage(chatId, lines.join("\n"));
        }

        allResults.push({ workspace: workspace.slug, results });
      } catch (err) {
        console.error(`[Pipeline Push] ${label}Error:`, err);
        if (chatId) {
          await sendMessage(chatId,
            `\u274C ${label}Pipeline push failed: ${err instanceof Error ? err.message : "Unknown error"}`
          ).catch(() => {});
        }
        allResults.push({ workspace: workspace.slug, results: [{ concept: "N/A", type: "N/A", market: "N/A", status: "failed", error: err instanceof Error ? err.message : "Unknown error" }] });
      } finally {
        setMetaConfig(null);
      }
    } // end workspace loop

    const flatResults = allResults.flatMap((ws) => ws.results);
    const pushed = flatResults.filter((r) => r.status === "pushed").length;
    const failed = flatResults.filter((r) => r.status === "failed").length;
    await completeCronRun(cronRunId, `${pushed} pushed, ${failed} failed, ${syncResult.transitions.length} transitions`);
    return NextResponse.json({
      syncedMetrics: syncResult.synced,
      stageTransitions: syncResult.transitions.length,
      workspaces: allResults,
      pushed,
      failed,
    });
  } catch (err) {
    setMetaConfig(null);
    console.error("[Pipeline Cron] Error:", err);
    await failCronRun(cronRunId, err instanceof Error ? err.message : "Pipeline cron failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pipeline cron failed" },
      { status: 500 }
    );
  }
}

/**
 * Reconciles jobs that got stuck because Vercel timed out mid-execution or
 * an upstream call threw before the status update ran.
 *
 * Three recovery actions:
 * 1. Reset image_translations stuck in "processing" for >2h back to "pending"
 *    so the next run of triggerAutopilotTranslations picks them up.
 * 2. Mark image_jobs stuck in "processing" for >2h with no remaining
 *    pending/processing translations as "completed".
 * 3. Promote autopilot drafts older than 6h that already have source images
 *    to "ready" so they appear in /review for human approval.
 */
async function reconcileStuckJobs(db: ReturnType<typeof createServerSupabase>) {
  const now = Date.now();
  const STUCK_TRANSLATION_MS = 2 * 60 * 60 * 1000; // 2 hours
  const STUCK_DRAFT_MS = 6 * 60 * 60 * 1000; // 6 hours
  const cutoffTranslation = new Date(now - STUCK_TRANSLATION_MS).toISOString();
  const cutoffDraft = new Date(now - STUCK_DRAFT_MS).toISOString();

  let translationsReset = 0;
  let jobsCompleted = 0;
  let draftsPromoted = 0;

  // 1. Reset stuck "processing" translations
  const { data: stuckTranslations } = await db
    .from("image_translations")
    .select("id, source_image_id, language, aspect_ratio")
    .eq("status", "processing")
    .lt("updated_at", cutoffTranslation)
    .limit(500);

  if (stuckTranslations && stuckTranslations.length > 0) {
    const ids = stuckTranslations.map((t) => t.id);
    const { error: resetErr } = await db
      .from("image_translations")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .in("id", ids);
    if (!resetErr) {
      translationsReset = stuckTranslations.length;
    }
  }

  // 2. Promote stuck "draft" autopilot concepts that already have source images.
  // These are concepts where autopilot generated images but the status update never ran
  // (cron timed out or threw mid-execution). Move to "ready" so /review picks them up.
  const { data: stuckDrafts } = await db
    .from("image_jobs")
    .select("id, source_images(id)")
    .eq("status", "draft")
    .in("source", ["autopilot", "competitor_swipe"])
    .is("archived_at", null)
    .lt("created_at", cutoffDraft)
    .limit(200);

  if (stuckDrafts && stuckDrafts.length > 0) {
    const promoteIds: string[] = [];
    for (const j of stuckDrafts) {
      const imgs = j.source_images as { id: string }[] | null;
      if (imgs && imgs.length > 0) {
        promoteIds.push(j.id);
      }
    }
    if (promoteIds.length > 0) {
      const { error: promoteErr } = await db
        .from("image_jobs")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .in("id", promoteIds);
      if (!promoteErr) {
        draftsPromoted = promoteIds.length;
      }
    }
  }

  // 3. Mark "processing" jobs as completed if no translations are still pending/processing.
  // updateJobStatusFinal would normally do this but it only runs at the end of triggerAutopilotTranslations,
  // so jobs that lost the race (e.g. last translation completed via retry, but the job-completion path didn't fire)
  // sit in "processing" forever.
  const { data: stuckProcessing } = await db
    .from("image_jobs")
    .select("id")
    .eq("status", "processing")
    .lt("updated_at", cutoffTranslation)
    .limit(100);

  if (stuckProcessing && stuckProcessing.length > 0) {
    for (const j of stuckProcessing) {
      const { data: pending } = await db
        .from("image_translations")
        .select("id, source_images!inner(job_id)")
        .in("status", ["pending", "processing"])
        .eq("source_images.job_id", j.id)
        .limit(1);

      if (!pending || pending.length === 0) {
        await db
          .from("image_jobs")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", j.id);
        jobsCompleted += 1;
      }
    }
  }

  // 4. Reset stuck "swiping" discovered_ads rows (orphaned by a swipeCompetitorAd
  // call that Vercel killed at the 300s timeout before the try/catch could run).
  // 15 minutes is well past the 5min usual worst-case swipe duration and the
  // 300s Vercel cap, so anything older than that is definitely abandoned.
  const STUCK_SWIPE_MS = 15 * 60 * 1000;
  const cutoffSwipe = new Date(now - STUCK_SWIPE_MS).toISOString();
  let discoveredAdsReset = 0;

  const { data: stuckSwipes, error: stuckSwipeErr } = await db
    .from("discovered_ads")
    .update({ status: "skipped", updated_at: new Date().toISOString() })
    .eq("status", "swiping")
    .lt("updated_at", cutoffSwipe)
    .select("id");

  if (!stuckSwipeErr && stuckSwipes) {
    discoveredAdsReset = stuckSwipes.length;
  }

  return {
    translationsReset,
    draftsPromoted,
    jobsCompleted,
    discoveredAdsReset,
    totalReset:
      translationsReset + draftsPromoted + jobsCompleted + discoveredAdsReset,
  };
}
