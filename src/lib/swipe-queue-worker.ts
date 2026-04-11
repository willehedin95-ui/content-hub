import { createServerSupabase } from "@/lib/supabase-admin";
import { swipeCompetitorAd } from "@/lib/swipe-competitor";

export type ProcessOneResult =
  | { status: "done"; jobId: string; conceptName: string; conceptNumber: number }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string }
  | { status: "idle" }; // nothing to process

/**
 * Process the oldest queued discovered_ad for a given workspace.
 * Used by both the client-triggered /api/ad-spy/process-next route
 * and the server-side /api/cron/process-swipe-queue cron.
 *
 * Safe to call repeatedly — each call picks one queued item and runs it
 * to completion (or marks it skipped on failure).
 */
export async function processOneQueueItem(
  workspaceId: string,
  productSlug: string,
): Promise<ProcessOneResult> {
  const db = createServerSupabase();

  // Find the oldest queued ad for this workspace
  const { data: next } = await db
    .from("discovered_ads")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!next) {
    return { status: "idle" };
  }

  // Mark as swiping
  await db
    .from("discovered_ads")
    .update({ status: "swiping", updated_at: new Date().toISOString() })
    .eq("id", next.id);

  const mediaUrls = (next.media_urls as string[]) ?? [];
  if (mediaUrls.length === 0) {
    await db
      .from("discovered_ads")
      .update({ status: "skipped", updated_at: new Date().toISOString() })
      .eq("id", next.id);
    return { status: "skipped", reason: "No images" };
  }

  try {
    const boardName = (next.source_board_name as string) || "";
    const result = await swipeCompetitorAd({
      workspaceId,
      productSlug,
      // Single competitor image — see autopilot-concepts/route.ts for rationale
      competitorImageUrls: mediaUrls.slice(0, 1),
      competitorAdCopy: next.body ?? undefined,
      brandName: next.brand_name ?? "Unknown",
      gethookdAdId: next.gethookd_ad_id,
      notifyTelegram: false,
      painPoint: (next.pain_point as string) || undefined,
      forceNoProduct: /native/i.test(boardName),
    });

    await db
      .from("discovered_ads")
      .update({
        status: "swiped",
        image_job_id: result.jobId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", next.id);

    return {
      status: "done",
      jobId: result.jobId,
      conceptName: result.conceptName,
      conceptNumber: result.conceptNumber,
    };
  } catch (err) {
    console.error("[swipe-queue-worker] Swipe failed:", err);

    await db
      .from("discovered_ads")
      .update({ status: "skipped", updated_at: new Date().toISOString() })
      .eq("id", next.id);

    return {
      status: "error",
      error: err instanceof Error ? err.message : "Swipe failed",
    };
  }
}

/**
 * Reset any "swiping" discovered_ads rows that have been stuck for longer
 * than `maxAgeMinutes` back to "skipped". These are orphaned swipes from
 * a cron/function that hit the 300s Vercel timeout before its catch block
 * could run.
 *
 * Returns the number of rows reconciled.
 */
export async function reconcileStuckSwipes(
  maxAgeMinutes: number = 15,
): Promise<number> {
  const db = createServerSupabase();

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("discovered_ads")
    .update({ status: "skipped", updated_at: new Date().toISOString() })
    .eq("status", "swiping")
    .lt("updated_at", cutoff)
    .select("id");

  if (error) {
    console.error("[swipe-queue-worker] Reconcile failed:", error);
    return 0;
  }

  return data?.length ?? 0;
}
