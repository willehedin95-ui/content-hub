import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getQueuedConcepts, getTestingCount, getTestingSlots, syncPipelineMetrics } from "@/lib/pipeline";
import { pushConceptToMeta } from "@/lib/meta-push";
import { notifyPushSuccess, notifyPushFailure, notifyPushSummary, notifyStageTransitions } from "@/lib/telegram-notify";

export const maxDuration = 300;

/**
 * Daily pipeline cron (03:00 UTC):
 * 1. Sync metrics from Meta → detect stage transitions (auto-kill, promote to review/active)
 * 2. Push queued concepts to Meta when testing slots are available
 */
export async function GET(req: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();
  const results: Array<{ concept: string; status: "pushed" | "failed"; error?: string }> = [];

  try {
    // Step 1: Sync metrics and detect stage transitions
    // This auto-kills underperformers and promotes winners, freeing up testing slots
    console.log("[Pipeline Cron] Syncing metrics and detecting stage transitions...");
    const syncResult = await syncPipelineMetrics();
    console.log(`[Pipeline Cron] Synced ${syncResult.synced} metrics, ${syncResult.transitions.length} stage transitions`);

    if (syncResult.transitions.length > 0) {
      await notifyStageTransitions(syncResult.transitions);
    }

    if (syncResult.errors.length > 0) {
      console.warn("[Pipeline Cron] Sync errors:", syncResult.errors);
    }

    // Step 2: Push queued concepts to available testing slots
    const queued = await getQueuedConcepts();
    if (queued.length === 0) {
      return NextResponse.json({
        message: "Sync complete, no concepts in queue",
        syncedMetrics: syncResult.synced,
        stageTransitions: syncResult.transitions.length,
        pushed: 0,
      });
    }

    // Group queued concepts by product
    const queuedByProduct = new Map<string, typeof queued>();
    for (const q of queued) {
      const product = q.product ?? "unknown";
      const list = queuedByProduct.get(product) ?? [];
      list.push(q);
      queuedByProduct.set(product, list);
    }

    // Process each product
    for (const [product, productQueue] of queuedByProduct) {
      const testingCount = await getTestingCount(product);
      const testingSlots = await getTestingSlots(product);
      const availableSlots = Math.max(0, testingSlots - testingCount);

      if (availableSlots === 0) {
        console.log(`[Pipeline Push] ${product}: No testing slots available (${testingCount}/${testingSlots})`);
        continue;
      }

      // Push concepts up to available slots
      const toPush = productQueue.slice(0, availableSlots);

      for (const concept of toPush) {
        try {
          console.log(`[Pipeline Push] Pushing ${concept.name} (#${concept.conceptNumber}) to Meta...`);

          // Push to Meta
          const pushResult = await pushConceptToMeta(concept.imageJobId);

          // Check if any language succeeded
          const anySuccess = pushResult.results.some((r) => r.status === "pushed");
          const countries = pushResult.results
            .filter((r) => r.status === "pushed")
            .map((r) => r.country);

          if (anySuccess) {
            // Transition from "queued" to "testing"
            const now = new Date().toISOString();
            await db
              .from("concept_lifecycle")
              .update({ exited_at: now })
              .eq("image_job_id", concept.imageJobId)
              .eq("stage", "queued")
              .is("exited_at", null);

            await db.from("concept_lifecycle").insert({
              image_job_id: concept.imageJobId,
              stage: "testing",
              entered_at: now,
              signal: "auto_pushed",
            });

            results.push({ concept: concept.name, status: "pushed" });
            await notifyPushSuccess({
              number: concept.conceptNumber,
              name: concept.name,
              countries,
            });
          } else {
            // All languages failed
            const errors = pushResult.results
              .filter((r) => r.error)
              .map((r) => r.error)
              .join("; ");
            results.push({ concept: concept.name, status: "failed", error: errors });
            await notifyPushFailure(
              { number: concept.conceptNumber, name: concept.name },
              errors || "All languages failed"
            );
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[Pipeline Push] Failed to push ${concept.name}:`, err);
          results.push({ concept: concept.name, status: "failed", error: errorMsg });
          await notifyPushFailure(
            { number: concept.conceptNumber, name: concept.name },
            errorMsg
          );
        }
      }
    }

    // Send summary notification if anything happened
    const pushed = results.filter((r) => r.status === "pushed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    if (pushed > 0 || failed > 0) {
      const remainingQueued = await getQueuedConcepts();
      const testingCount = await getTestingCount();
      const firstProduct = queued[0]?.product ?? "happysleep";
      const slots = await getTestingSlots(firstProduct);

      await notifyPushSummary({
        pushed,
        failed,
        queueRemaining: remainingQueued.length,
        testingSlots: `${testingCount + pushed}/${slots}`,
      });
    }

    return NextResponse.json({
      syncedMetrics: syncResult.synced,
      stageTransitions: syncResult.transitions.length,
      results,
      pushed: results.filter((r) => r.status === "pushed").length,
      failed: results.filter((r) => r.status === "failed").length,
    });
  } catch (err) {
    console.error("[Pipeline Cron] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pipeline cron failed" },
      { status: 500 }
    );
  }
}
