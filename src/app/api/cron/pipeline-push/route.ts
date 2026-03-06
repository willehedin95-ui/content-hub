import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { calculateAvailableBudget, getLaunchpadConcepts, syncPipelineMetrics } from "@/lib/pipeline";
import { pushConceptToMeta } from "@/lib/meta-push";
import { notifyStageTransitions } from "@/lib/telegram-notify";
import { sendMessage } from "@/lib/telegram";
import { getConversionsForTest, isShopifyConfigured } from "@/lib/shopify";

export const maxDuration = 300;

/**
 * Daily pipeline cron (03:00 UTC):
 * 1. Sync metrics from Meta → detect stage transitions (auto-kill, promote to review/active)
 * 2. Push launch pad concepts to Meta when budget allows (per market)
 */
export async function GET(req: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  try {
    // Step 1: Sync metrics and detect stage transitions
    // This auto-kills underperformers and promotes winners, freeing up budget
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

    // Step 2: Push from launch pad based on available budget per market
    const budgets = await calculateAvailableBudget();
    const launchpadConcepts = await getLaunchpadConcepts();

    if (launchpadConcepts.length === 0) {
      return NextResponse.json({
        message: "Sync complete, no concepts on launch pad",
        syncedMetrics: syncResult.synced,
        stageTransitions: syncResult.transitions.length,
        pushed: 0,
      });
    }

    const MARKET_TO_LANG: Record<string, string> = { NO: "no", DK: "da", SE: "sv", DE: "de" };
    const results: Array<{ concept: string; market: string; status: string; error?: string }> = [];

    for (const [market, budget] of Object.entries(budgets)) {
      if (budget.canPush <= 0) {
        console.log(`[Pipeline Push] ${market}: No budget for testing (${budget.available} ${budget.currency} available, need 150)`);
        continue;
      }

      let pushCount = 0;
      for (const concept of launchpadConcepts) {
        if (pushCount >= budget.canPush) break;

        const marketEntry = concept.markets.find((m) => m.market === market);
        if (!marketEntry || marketEntry.stage !== "launchpad") continue;

        const lang = MARKET_TO_LANG[market];
        if (!lang) continue;

        try {
          console.log(`[Pipeline Push] Pushing ${concept.name} to ${market} (budget: ${budget.available} ${budget.currency})...`);
          const pushResult = await pushConceptToMeta(concept.imageJobId, { languages: [lang] });
          const langResult = pushResult.results.find((r) => r.language === lang);

          if (langResult?.status === "pushed") {
            const now = new Date().toISOString();

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

            results.push({ concept: concept.name, market, status: "pushed" });
            pushCount++;

            // Check if concept fully pushed → clear from launch pad
            const { data: remaining } = await db
              .from("concept_lifecycle")
              .select("stage")
              .in("image_job_market_id", concept.markets.map((m) => m.imageJobMarketId))
              .eq("stage", "launchpad")
              .is("exited_at", null);

            if (!remaining || remaining.length === 0) {
              await db.from("image_jobs").update({ launchpad_priority: null }).eq("id", concept.imageJobId);
            }
          } else {
            results.push({ concept: concept.name, market, status: "failed", error: langResult?.error ?? "Unknown" });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          results.push({ concept: concept.name, market, status: "failed", error: errorMsg });
        }
      }
    }

    // Send Telegram summary
    if (results.length > 0) {
      const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
      if (chatId) {
        const pushed = results.filter((r) => r.status === "pushed");
        const failed = results.filter((r) => r.status === "failed");
        const remaining = await getLaunchpadConcepts();

        const lines = [
          `🚀 Auto-push results:`,
          ...pushed.map((r) => `  ✅ ${r.concept} → ${r.market}`),
          ...failed.map((r) => `  ❌ ${r.concept} → ${r.market}: ${r.error}`),
          ``,
          `📋 Launch pad: ${remaining.length} concepts remaining`,
          ...Object.entries(budgets).map(([m, b]) => `  ${m}: ${b.available} ${b.currency} available`),
        ];

        await sendMessage(chatId, lines.join("\n"));
      }
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
