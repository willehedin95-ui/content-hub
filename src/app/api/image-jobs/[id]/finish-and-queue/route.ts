import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { triggerAutopilotTranslations } from "@/lib/autopilot-translations";

export const maxDuration = 300;

/**
 * "Finish & Queue" — one-click pipeline for any concept.
 * Runs the full autopilot translation pipeline:
 *   1. Create image_translation rows (all languages × ratios)
 *   2. Translate ad copy via OpenAI
 *   3. Process 4:5 image translations (Kie AI)
 *   4. Process 9:16 outpainted versions
 *   5. Update job status + Telegram notification
 *
 * Optionally applies default Page B from workspace settings.
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
    .select("id, name, source_images(id), ad_copy_primary, landing_page_id, landing_page_id_b, status")
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

  // Apply default Page B from workspace settings if not already set
  const wsSettings = await getWorkspaceSettings();
  const defaultPageBId = wsSettings.default_page_b_id as string | undefined;
  if (!job.landing_page_id_b && defaultPageBId && job.landing_page_id !== defaultPageBId) {
    await db.from("image_jobs").update({ landing_page_id_b: defaultPageBId }).eq("id", jobId);
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

      // Auto-add to launchpad if has landing page
      const { data: freshJob } = await db
        .from("image_jobs")
        .select("landing_page_id, launchpad_priority")
        .eq("id", jobId)
        .single();

      if (freshJob?.landing_page_id && !freshJob.launchpad_priority) {
        await db.from("image_jobs").update({
          launchpad_priority: 999, // Will be sorted by launchpad UI
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
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
