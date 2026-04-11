import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { triggerAutopilotTranslations } from "@/lib/autopilot-translations";
import { approveConceptAction } from "@/lib/approval-actions";

export const maxDuration = 800;

/**
 * "Finish & Queue" — one-click pipeline for any concept.
 * Runs the full autopilot translation pipeline:
 *   1. Approve concept properly (creates image_job_markets + concept_lifecycle entries — REQUIRED for pipeline-push to find it)
 *   2. Create image_translation rows (all languages × ratios)
 *   3. Translate ad copy via OpenAI
 *   4. Process 4:5 image translations (Kie AI)
 *   5. Process 9:16 outpainted versions
 *   6. Update job status + Telegram notification
 *
 * Runs in background via after() — returns immediately.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Verify job exists and belongs to workspace
  const { data: job, error } = await db
    .from("image_jobs")
    .select("id, name, source_images(id), ad_copy_primary, landing_page_id, status")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  // Must have source images
  const sourceCount = (job.source_images as { id: string }[])?.length ?? 0;
  if (sourceCount === 0) {
    return NextResponse.json({ error: "No source images — generate or upload images first" }, { status: 422 });
  }

  // Must have ad copy
  const hasPrimary = (job.ad_copy_primary as string[] | null)?.some((t: string) => t.trim());
  if (!hasPrimary) {
    return NextResponse.json({ error: "No ad copy — write primary text first" }, { status: 422 });
  }

  // Approve concept properly: assigns LP, sets launchpad_priority, creates image_job_markets + concept_lifecycle entries.
  // This is REQUIRED for pipeline-push to find the concept later. Previously this route bypassed the approve step,
  // so concepts had launchpad_priority set but no markets/lifecycle, and pipeline-push couldn't push them.
  const approveResult = await approveConceptAction(jobId, "finish_and_queue");
  if (!approveResult.ok) {
    return NextResponse.json({ error: approveResult.error || "Approval failed" }, { status: 422 });
  }

  // Mark as processing immediately
  await db.from("image_jobs").update({
    status: "processing",
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  // Run the full pipeline in background
  after(async () => {
    try {
      const result = await triggerAutopilotTranslations(jobId);
      console.log(`[finish-and-queue] Pipeline complete for ${jobId}:`, result);
    } catch (err) {
      console.error(`[finish-and-queue] Pipeline failed for ${jobId}:`, err);
      await db.from("image_jobs").update({
        status: "failed",
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
  });

  return NextResponse.json({
    status: "processing",
    message: "Pipeline started — you'll get a Telegram notification when done",
  });
}
