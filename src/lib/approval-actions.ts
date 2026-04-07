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

// ---------------------------------------------------------------------------
// CONCEPT APPROVE / REJECT
// ---------------------------------------------------------------------------

export async function approveConceptAction(jobId: string, source: string = "review_page"): Promise<ApprovalResult> {
  const db = createServerSupabase();

  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, concept_number, workspace_id, target_languages, landing_page_id, launchpad_priority, product, ad_copy_primary, ad_copy_headline")
    .eq("id", jobId)
    .single();

  if (!job) {
    return { ok: false, action: "approve", error: "Concept not found", jobId };
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

  // Get next launchpad priority (top of queue)
  const { data: topLaunchpad } = await db
    .from("image_jobs")
    .select("launchpad_priority")
    .not("launchpad_priority", "is", null)
    .order("launchpad_priority", { ascending: true })
    .limit(1)
    .single();

  const priority = ((topLaunchpad?.launchpad_priority as number) ?? 10) - 1;

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
  await db.from("image_jobs").update({
    archived_at: new Date().toISOString(),
    status: "archived",
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

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

  const { data: topLaunchpad } = await db
    .from("video_jobs")
    .select("launchpad_priority")
    .not("launchpad_priority", "is", null)
    .order("launchpad_priority", { ascending: true })
    .limit(1)
    .single();

  const priority = ((topLaunchpad?.launchpad_priority as number) ?? 10) - 1;

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
    .select("id, name, concept_number, ad_copy_translations")
    .eq("id", jobId)
    .single();

  if (!job) {
    return { ok: false, action: "approve", error: "Concept not found", jobId };
  }

  if (job.ad_copy_translations) {
    const translations = { ...(job.ad_copy_translations as Record<string, { status?: string }>) };
    let changed = false;
    for (const value of Object.values(translations)) {
      if (value.status === "review") {
        value.status = "completed";
        changed = true;
      }
    }
    if (changed) {
      await db.from("image_jobs").update({ ad_copy_translations: translations }).eq("id", jobId);
    }
  }

  return { ok: true, action: "translations_approved", jobId, jobName: job.name, conceptNumber: job.concept_number };
}
