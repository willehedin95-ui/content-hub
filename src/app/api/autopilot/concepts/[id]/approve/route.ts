import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceLanguages } from "@/lib/workspace";
import { triggerAutopilotTranslations } from "@/lib/autopilot-translations";
import { findBestLandingPage } from "@/lib/landing-page-recommender";

export const maxDuration = 300;

// POST /api/autopilot/concepts/:id/approve
// body: { approved: boolean }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const body = await req.json().catch(() => ({}));
  const approved = body.approved !== false; // default true

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, concept_number, target_languages, landing_page_id, launchpad_priority, product")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  if (approved) {
    // Idempotency: already approved
    if (job.launchpad_priority != null) {
      return NextResponse.json({ ok: true, action: "already_approved" });
    }

    // Auto-assign landing page if missing
    if (!job.landing_page_id) {
      const autoPageId = await findBestLandingPage(db, workspaceId, job.product as string);
      if (autoPageId) {
        await db.from("image_jobs").update({ landing_page_id: autoPageId }).eq("id", jobId);
        job.landing_page_id = autoPageId;
      }
    }

    // Check landing page (still fail if none available at all)
    if (!job.landing_page_id) {
      return NextResponse.json(
        { error: "No landing page available. Create and publish a page first." },
        { status: 400 }
      );
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

    await db
      .from("image_jobs")
      .update({
        launchpad_priority: priority,
        marked_ready_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Create/update market records
    const COUNTRY_MAP: Record<string, string> = { sv: "SE", da: "DK", no: "NO" };
    const targetLangs = (job.target_languages as string[]) ?? await getWorkspaceLanguages();

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
        await db
          .from("image_job_markets")
          .update({ launchpad_priority: priority })
          .eq("id", existing.id);
        marketId = existing.id;
      }

      // Create concept_lifecycle entry so pipeline-push cron can find this concept
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

    // Log to autopilot_actions
    await db.from("autopilot_actions").insert({
      workspace_id: workspaceId,
      action_type: "concept_approved",
      target_id: jobId,
      target_name: job.name,
      details: { concept_number: job.concept_number, source: "hub_ui" },
      success: true,
    });

    // Trigger translation pipeline in background (after response is sent)
    after(async () => {
      try {
        console.log(`[autopilot-approve] Starting translations for job ${jobId}`);
        const result = await triggerAutopilotTranslations(jobId);
        console.log(`[autopilot-approve] Translations done:`, result);
      } catch (err) {
        console.error(`[autopilot-approve] Translation pipeline failed for ${jobId}:`, err);
      }
    });

    return NextResponse.json({ ok: true, action: "approved", priority, translationsStarted: true });
  } else {
    // Reject = archive
    await db
      .from("image_jobs")
      .update({
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("workspace_id", workspaceId);

    // Log to autopilot_actions
    await db.from("autopilot_actions").insert({
      workspace_id: workspaceId,
      action_type: "concept_rejected",
      target_id: jobId,
      target_name: job.name,
      details: { concept_number: job.concept_number, source: "hub_ui" },
      success: true,
    });

    return NextResponse.json({ ok: true, action: "rejected" });
  }
}
