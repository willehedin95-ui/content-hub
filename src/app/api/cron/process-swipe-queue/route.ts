import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import {
  processOneQueueItem,
  reconcileStuckSwipes,
} from "@/lib/swipe-queue-worker";
import { isTelegramDisabled } from "@/lib/telegram";

// 300s Vercel hobby cap. swipeCompetitorAd per item = ~60-120s with
// parallelized image gen. We budget ~250s of processing time so we fit
// roughly 2-3 items per run before bailing, leaving 50s of slack for the
// reconcile step + per-workspace iteration.
export const maxDuration = 800;

const TIME_BUDGET_MS = 250 * 1000;
const STUCK_SWIPE_MAX_AGE_MIN = 15;

/**
 * Server-side swipe queue processor.
 *
 * Runs on a schedule (see vercel.json). For each workspace:
 *   1. Reconciles stuck "swiping" rows (orphaned by prior 300s timeouts)
 *   2. Picks the oldest queued row and runs swipeCompetitorAd to completion
 *   3. Loops until either the queue is empty or the time budget is spent
 *
 * This is independent of the client-side SwipeQueue.tsx, which still
 * triggers /api/ad-spy/process-next when the Queue tab is open. The cron
 * is the safety net that makes sure queue processing happens even when
 * the browser tab is closed.
 */
export async function GET(req: NextRequest) {
  // Middleware-exempt (public /api/cron/ prefix) — this route spends Kie/AI
  // money, so it must verify the cron secret like every other cron route.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = createServerSupabase();

  // Step 1: global reconcile for stuck "swiping" rows across all workspaces.
  // This catches any swipe that got orphaned by a 300s Vercel timeout before
  // its try/catch could mark the row as "skipped".
  const reconciled = await reconcileStuckSwipes(STUCK_SWIPE_MAX_AGE_MIN);
  if (reconciled > 0) {
    console.log(
      `[process-swipe-queue] Reconciled ${reconciled} stuck 'swiping' row(s)`,
    );
  }

  // Step 2: iterate all workspaces with queued items
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, slug, settings");

  const processed: Array<{
    workspace: string;
    brand?: string;
    conceptNumber?: number;
    status: string;
    reason?: string;
    error?: string;
  }> = [];

  let bailedOnTime = false;

  // Round-robin: process one item per workspace at a time, so one workspace
  // with a big queue can't starve the others.
  let keepGoing = true;
  while (keepGoing) {
    keepGoing = false;

    for (const ws of workspaces ?? []) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        bailedOnTime = true;
        break;
      }

      if (isTelegramDisabled(ws)) continue;

      const productSlug = (ws.settings as Record<string, unknown> | null)
        ?.default_product as string | undefined;
      if (!productSlug) continue;

      const result = await processOneQueueItem(ws.id, productSlug);

      if (result.status === "idle") {
        // no queued items for this workspace — skip it on next loop
        continue;
      }

      keepGoing = true; // we did real work, try another pass

      if (result.status === "done") {
        processed.push({
          workspace: ws.slug,
          conceptNumber: result.conceptNumber,
          brand: result.conceptName,
          status: "done",
        });
        console.log(
          `[process-swipe-queue] ${ws.slug}: swiped #${result.conceptNumber} ${result.conceptName}`,
        );
      } else if (result.status === "skipped") {
        processed.push({
          workspace: ws.slug,
          status: "skipped",
          reason: result.reason,
        });
        console.log(
          `[process-swipe-queue] ${ws.slug}: skipped — ${result.reason}`,
        );
      } else if (result.status === "error") {
        processed.push({
          workspace: ws.slug,
          status: "error",
          error: result.error,
        });
        console.error(
          `[process-swipe-queue] ${ws.slug}: error — ${result.error}`,
        );
      }
    }

    if (bailedOnTime) break;
  }

  const elapsedMs = Date.now() - startedAt;
  return NextResponse.json({
    ok: true,
    reconciled,
    processed_count: processed.length,
    bailed_on_time: bailedOnTime,
    elapsed_ms: elapsedMs,
    results: processed,
  });
}
