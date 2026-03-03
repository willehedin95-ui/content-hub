import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getQueuedConcepts, getLiveConceptCount, getTestingSlots, syncPipelineMetrics } from "@/lib/pipeline";
import { pushConceptToMeta } from "@/lib/meta-push";
import { notifyPushSuccess, notifyPushFailure, notifyPushSummary, notifyStageTransitions } from "@/lib/telegram-notify";
import { getConversionsForTest, isShopifyConfigured } from "@/lib/shopify";

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

    // Step 1.5: Sync AB test conversions from Shopify
    if (isShopifyConfigured()) {
      console.log("[Pipeline Cron] Syncing AB test conversions...");
      const { data: activeTests } = await db
        .from("ab_tests")
        .select("id, created_at")
        .eq("status", "active");

      for (const test of activeTests ?? []) {
        try {
          const conversions = await getConversionsForTest(test.id, test.created_at);
          if (conversions.length > 0) {
            await db
              .from("ab_conversions")
              .upsert(
                conversions.map((c) => ({
                  test_id: test.id,
                  variant: c.variant,
                  shopify_order_id: c.shopifyOrderId,
                  revenue: c.revenue,
                  currency: c.currency,
                })),
                { onConflict: "test_id,shopify_order_id", ignoreDuplicates: true }
              );
            console.log(`[Pipeline Cron] AB test ${test.id}: synced ${conversions.length} conversions`);
          }
        } catch (err) {
          console.error(`[Pipeline Cron] AB test ${test.id} sync failed:`, err);
        }
      }
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
      const testingCount = await getLiveConceptCount(product);
      const testingSlots = await getTestingSlots(product);
      const availableSlots = Math.max(0, testingSlots - testingCount);

      if (availableSlots === 0) {
        console.log(`[Pipeline Push] ${product}: No testing slots available (${testingCount}/${testingSlots})`);
        continue;
      }

      // Push concepts up to available slots (each slot = one market)
      const toPush = productQueue.slice(0, availableSlots);

      // Group by imageJobId (pushConceptToMeta works per image job)
      const MARKET_TO_LANG: Record<string, string> = { NO: "no", DK: "da", SE: "sv", DE: "de" };
      const groupedByJob = new Map<string, typeof toPush>();
      for (const concept of toPush) {
        const list = groupedByJob.get(concept.imageJobId) ?? [];
        list.push(concept);
        groupedByJob.set(concept.imageJobId, list);
      }

      for (const [imageJobId, marketConcepts] of groupedByJob) {
        const firstConcept = marketConcepts[0];
        try {
          const languages = marketConcepts
            .map((c) => MARKET_TO_LANG[c.market])
            .filter(Boolean);

          console.log(`[Pipeline Push] Pushing ${firstConcept.name} (#${firstConcept.conceptNumber}) markets [${marketConcepts.map((c) => c.market).join(", ")}] to Meta...`);

          // Push only the queued languages to Meta
          const pushResult = await pushConceptToMeta(imageJobId, { languages });

          // Transition lifecycle per-market
          const now = new Date().toISOString();
          const pushedCountries: string[] = [];

          for (const mc of marketConcepts) {
            const lang = MARKET_TO_LANG[mc.market];
            const langResult = pushResult.results.find((r) => r.language === lang);

            if (langResult?.status === "pushed") {
              // Close queued lifecycle
              await db
                .from("concept_lifecycle")
                .update({ exited_at: now })
                .eq("image_job_market_id", mc.imageJobMarketId)
                .eq("stage", "queued")
                .is("exited_at", null);

              // Create testing lifecycle
              await db.from("concept_lifecycle").insert({
                image_job_market_id: mc.imageJobMarketId,
                stage: "testing",
                entered_at: now,
                signal: "auto_pushed",
              });

              pushedCountries.push(mc.market);
            }
          }

          if (pushedCountries.length > 0) {
            results.push({ concept: firstConcept.name, status: "pushed" });
            await notifyPushSuccess({
              number: firstConcept.conceptNumber,
              name: firstConcept.name,
              countries: pushedCountries,
            });
          } else {
            const errors = pushResult.results
              .filter((r) => r.error)
              .map((r) => r.error)
              .join("; ");
            results.push({ concept: firstConcept.name, status: "failed", error: errors });
            await notifyPushFailure(
              { number: firstConcept.conceptNumber, name: firstConcept.name },
              errors || "All languages failed"
            );
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          console.error(`[Pipeline Push] Failed to push ${firstConcept.name}:`, err);
          results.push({ concept: firstConcept.name, status: "failed", error: errorMsg });
          await notifyPushFailure(
            { number: firstConcept.conceptNumber, name: firstConcept.name },
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
      const testingCount = await getLiveConceptCount();
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
