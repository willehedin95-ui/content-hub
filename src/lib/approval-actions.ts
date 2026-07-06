/**
 * Shared approval/rejection logic for concepts, videos, iterations, and translations.
 * Used by both the Telegram webhook and the /review page API.
 * All functions are workspace-independent (no cookie dependency).
 */

import { createServerSupabase } from "@/lib/supabase-admin";
import { findBestLandingPage } from "@/lib/landing-page-recommender";

export interface ApprovalResult {
  ok: boolean;
  action: string;
  error?: string;
  jobId: string;
  jobName?: string;
  conceptNumber?: number | null;
  markets?: string;
  imagesDeleted?: number;
}

const COUNTRY_MAP: Record<string, string> = { sv: "SE", da: "DK", no: "NO" };

/**
 * Remove concepts from the push pipeline: clear per-market launchpad
 * priorities and exit their PRE-PUSH lifecycle rows (launchpad/queued only —
 * exiting killed/live history rows would make detectStageTransitions treat
 * the concept as brand-new and re-run learnings/duplicate lifecycle rows).
 * Shared by reject (here) and the bulk-archive route so the two never drift.
 */
export async function clearFromPushPipeline(
  db: ReturnType<typeof createServerSupabase>,
  jobIds: string[],
): Promise<void> {
  if (!jobIds.length) return;
  const { data: markets } = await db
    .from("image_job_markets")
    .update({ launchpad_priority: null })
    .in("image_job_id", jobIds)
    .select("id");
  const marketIds = (markets ?? []).map((m) => m.id);
  if (marketIds.length) {
    await db
      .from("concept_lifecycle")
      .update({ exited_at: new Date().toISOString() })
      .in("image_job_market_id", marketIds)
      .in("stage", ["launchpad", "queued"])
      .is("exited_at", null);
  }
}

// ---------------------------------------------------------------------------
// CONCEPT APPROVE / REJECT
// ---------------------------------------------------------------------------

export async function approveConceptAction(jobId: string, source: string = "review_page"): Promise<ApprovalResult> {
  const db = createServerSupabase();

  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, concept_number, workspace_id, target_languages, landing_page_id, launchpad_priority, product, ad_copy_primary, ad_copy_headline, status, tags, archived_at")
    .eq("id", jobId)
    .single();

  if (!job) {
    return { ok: false, action: "approve", error: "Concept not found", jobId };
  }

  // Judge-REJECT = hard brand-rule violation (e.g. English in Swedish copy,
  // price in copy). The tag was previously write-only, so REJECT concepts
  // could ride the approve → launchpad → cron chain straight to Meta.
  // startsWith: the tag can carry a "-norubric" suffix which must still gate.
  if (job.status === "rejected" || ((job.tags as string[] | null) ?? []).some((t) => t.startsWith("judge:REJECT"))) {
    return {
      ok: false,
      action: "approve",
      error: "Judge REJECT — granska copyn i konceptet och ta bort judge:REJECT-taggen innan godkännande.",
      jobId,
      jobName: job.name,
    };
  }

  // A stale Approve tap (e.g. old Telegram button) on an already-rejected/
  // archived concept must not silently re-enter it into the push queue.
  if (job.archived_at || job.status === "archived") {
    return {
      ok: false,
      action: "approve",
      error: "Konceptet är arkiverat/avvisat — avarkivera det först om det ska godkännas.",
      jobId,
      jobName: job.name,
    };
  }

  if (job.launchpad_priority != null) {
    return { ok: true, action: "already_approved", jobId, jobName: job.name, conceptNumber: job.concept_number };
  }

  // Auto-assign landing page if missing
  if (!job.landing_page_id) {
    const autoPageId = await findBestLandingPage(db, job.workspace_id, job.product as string, {
      adCopyPrimary: job.ad_copy_primary as string | string[],
      adCopyHeadline: job.ad_copy_headline as string | string[],
      conceptName: job.name,
    });
    if (autoPageId) {
      await db.from("image_jobs").update({ landing_page_id: autoPageId }).eq("id", jobId);
      job.landing_page_id = autoPageId;
    }
  }

  if (!job.landing_page_id) {
    return {
      ok: false,
      action: "approve",
      error: "No published landing page found. Go to Landing Pages, publish one for this product, then approve again.",
      jobId,
      jobName: job.name,
    };
  }

  // Get next launchpad priority - APPEND (max+1), same convention as the manual
  // launchpad add (it used to insert at top with min-1, jumping the queue), and
  // scoped to the concept's workspace (the query was previously cross-workspace).
  const [{ data: maxImagePriority }, { data: maxVideoPriority }] = await Promise.all([
    db.from("image_jobs")
      .select("launchpad_priority")
      .eq("workspace_id", job.workspace_id)
      .not("launchpad_priority", "is", null)
      .order("launchpad_priority", { ascending: false })
      .limit(1)
      .single(),
    db.from("video_jobs")
      .select("launchpad_priority")
      .eq("workspace_id", job.workspace_id)
      .not("launchpad_priority", "is", null)
      .order("launchpad_priority", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const priority = Math.max(
    (maxImagePriority?.launchpad_priority as number) ?? 0,
    (maxVideoPriority?.launchpad_priority as number) ?? 0,
  ) + 1;

  await db.from("image_jobs").update({
    launchpad_priority: priority,
    marked_ready_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  // Create/update market records + lifecycle entries
  const targetLangs = (job.target_languages as string[]) ?? ["sv", "da", "no"];
  const now = new Date().toISOString();

  for (const lang of targetLangs) {
    const market = COUNTRY_MAP[lang] ?? lang.toUpperCase();
    const { data: existing } = await db
      .from("image_job_markets")
      .select("id")
      .eq("image_job_id", jobId)
      .eq("market", market)
      .single();

    let marketId: string;
    if (!existing) {
      const { data: inserted } = await db.from("image_job_markets").insert({
        image_job_id: jobId,
        market,
        launchpad_priority: priority,
      }).select("id").single();
      marketId = inserted?.id ?? "";
    } else {
      await db.from("image_job_markets").update({
        launchpad_priority: priority,
      }).eq("id", existing.id);
      marketId = existing.id;
    }

    if (marketId) {
      const { data: activeLifecycle } = await db
        .from("concept_lifecycle")
        .select("stage")
        .eq("image_job_market_id", marketId)
        .is("exited_at", null)
        .single();

      if (!activeLifecycle) {
        await db.from("concept_lifecycle").insert({
          image_job_market_id: marketId,
          stage: "launchpad",
          entered_at: now,
          signal: "autopilot_approved",
        });
      }
    }
  }

  const markets = targetLangs.map((l) => COUNTRY_MAP[l] ?? l.toUpperCase()).join(", ");

  // Log to autopilot_actions
  await db.from("autopilot_actions").insert({
    workspace_id: job.workspace_id,
    action_type: "concept_approved",
    target_id: jobId,
    target_name: job.name,
    details: { concept_number: job.concept_number, markets, source },
    success: true,
  });

  return { ok: true, action: "approved", jobId, jobName: job.name, conceptNumber: job.concept_number, markets };
}

export async function rejectConceptAction(jobId: string, source: string = "review_page"): Promise<ApprovalResult> {
  const db = createServerSupabase();

  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, concept_number, workspace_id")
    .eq("id", jobId)
    .single();

  if (!job) {
    return { ok: false, action: "reject", error: "Concept not found", jobId };
  }

  // Set both archived_at AND status='archived' to keep them in sync.
  // /review/pending filters on archived_at IS NULL — without this both must agree.
  // Also clear launchpad_priority + exit pre-push lifecycle rows: a rejected
  // concept left on the pad would still be pushed by the nightly cron.
  const { error: rejectErr } = await db.from("image_jobs").update({
    archived_at: new Date().toISOString(),
    status: "archived",
    launchpad_priority: null,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  if (rejectErr) {
    // Reporting success on a failed update would let the nightly cron push a
    // creative the reviewer believes is rejected.
    return { ok: false, action: "reject", error: `Reject failed: ${rejectErr.message}`, jobId, jobName: job.name };
  }

  await clearFromPushPipeline(db, [jobId]);

  await db.from("autopilot_actions").insert({
    workspace_id: job.workspace_id,
    action_type: "concept_rejected",
    target_id: jobId,
    target_name: job.name,
    details: { concept_number: job.concept_number, source },
    success: true,
  });

  return { ok: true, action: "rejected", jobId, jobName: job.name, conceptNumber: job.concept_number };
}

// ---------------------------------------------------------------------------
// VIDEO APPROVE / REJECT
// ---------------------------------------------------------------------------

export async function approveVideoAction(jobId: string, source: string = "review_page"): Promise<ApprovalResult> {
  const db = createServerSupabase();

  const { data: job } = await db
    .from("video_jobs")
    .select("id, concept_name, concept_number, workspace_id, target_languages")
    .eq("id", jobId)
    .single();

  if (!job) {
    return { ok: false, action: "approve", error: "Video concept not found", jobId };
  }

  // APPEND (max+1) across both tables, workspace-scoped - same convention as
  // approveConceptAction and the manual launchpad add.
  const [{ data: maxImagePriority }, { data: maxVideoPriority }] = await Promise.all([
    db.from("image_jobs")
      .select("launchpad_priority")
      .eq("workspace_id", job.workspace_id)
      .not("launchpad_priority", "is", null)
      .order("launchpad_priority", { ascending: false })
      .limit(1)
      .single(),
    db.from("video_jobs")
      .select("launchpad_priority")
      .eq("workspace_id", job.workspace_id)
      .not("launchpad_priority", "is", null)
      .order("launchpad_priority", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const priority = Math.max(
    (maxImagePriority?.launchpad_priority as number) ?? 0,
    (maxVideoPriority?.launchpad_priority as number) ?? 0,
  ) + 1;

  const targetLangs = (job.target_languages as string[]) ?? ["sv", "da", "no"];
  const marketPriorities: Record<string, number> = {};
  for (const lang of targetLangs) {
    const market = COUNTRY_MAP[lang] ?? lang.toUpperCase();
    marketPriorities[market] = priority;
  }

  await db.from("video_jobs").update({
    launchpad_priority: priority,
    launchpad_market_priorities: marketPriorities,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  const markets = targetLangs.map((l) => COUNTRY_MAP[l] ?? l.toUpperCase()).join(", ");

  await db.from("autopilot_actions").insert({
    workspace_id: job.workspace_id,
    action_type: "video_approved",
    target_id: jobId,
    target_name: job.concept_name,
    details: { concept_number: job.concept_number, markets, source },
    success: true,
  });

  return { ok: true, action: "approved", jobId, jobName: job.concept_name, conceptNumber: job.concept_number, markets };
}

export async function rejectVideoAction(jobId: string, source: string = "review_page"): Promise<ApprovalResult> {
  const db = createServerSupabase();

  const { data: job } = await db
    .from("video_jobs")
    .select("id, concept_name, concept_number, workspace_id")
    .eq("id", jobId)
    .single();

  if (!job) {
    return { ok: false, action: "reject", error: "Video concept not found", jobId };
  }

  await db.from("video_jobs").update({
    status: "killed",
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  await db.from("autopilot_actions").insert({
    workspace_id: job.workspace_id,
    action_type: "video_rejected",
    target_id: jobId,
    target_name: job.concept_name,
    details: { concept_number: job.concept_number, source },
    success: true,
  });

  return { ok: true, action: "rejected", jobId, jobName: job.concept_name, conceptNumber: job.concept_number };
}

// ---------------------------------------------------------------------------
// ITERATION APPROVE / REJECT
// ---------------------------------------------------------------------------

export async function approveIterationAction(jobId: string, source: string = "review_page"): Promise<ApprovalResult> {
  const db = createServerSupabase();

  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, concept_number, workspace_id")
    .eq("id", jobId)
    .single();

  if (!job) {
    return { ok: false, action: "approve", error: "Concept not found", jobId };
  }

  await db.from("autopilot_actions").insert({
    workspace_id: job.workspace_id,
    action_type: "iterate_approved",
    target_id: jobId,
    target_name: job.name,
    details: { concept_number: job.concept_number, source },
    success: true,
  });

  return { ok: true, action: "approved", jobId, jobName: job.name, conceptNumber: job.concept_number };
}

export async function rejectIterationAction(jobId: string, source: string = "review_page"): Promise<ApprovalResult> {
  const db = createServerSupabase();

  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, concept_number, workspace_id")
    .eq("id", jobId)
    .single();

  if (!job) {
    return { ok: false, action: "reject", error: "Concept not found", jobId };
  }

  const { cleanupIterationImages } = await import("@/lib/autopilot-iterate");
  const deleted = await cleanupIterationImages(jobId, db);

  await db.from("autopilot_actions").insert({
    workspace_id: job.workspace_id,
    action_type: "iterate_rejected",
    target_id: jobId,
    target_name: job.name,
    details: { concept_number: job.concept_number, images_deleted: deleted, source },
    success: true,
  });

  return { ok: true, action: "rejected", jobId, jobName: job.name, conceptNumber: job.concept_number, imagesDeleted: deleted };
}

// ---------------------------------------------------------------------------
// TRANSLATION QUALITY APPROVE
// ---------------------------------------------------------------------------

export async function approveTranslationsAction(jobId: string): Promise<ApprovalResult> {
  const db = createServerSupabase();

  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, concept_number")
    .eq("id", jobId)
    .single();

  if (!job) {
    return { ok: false, action: "approve", error: "Concept not found", jobId };
  }

  // 2026-04-16: Flip review -> completed server-side via RPC to avoid
  // read-modify-write races with the autopilot-translate cron, which can
  // insert new language entries concurrently. See resilience-audit-2026-04-16.md.
  const { error } = await db.rpc("approve_ad_copy_translations", {
    p_job_id: jobId,
    p_language: null,
  });
  if (error) {
    return { ok: false, action: "approve", error: error.message, jobId };
  }

  return { ok: true, action: "translations_approved", jobId, jobName: job.name, conceptNumber: job.concept_number };
}
