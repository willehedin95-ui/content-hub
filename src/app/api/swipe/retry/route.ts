import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";

/**
 * POST /api/swipe/retry
 * Reset a failed/stale job to pending and re-ping the worker.
 */
export async function POST(req: NextRequest) {
  const { jobId } = await req.json();

  if (!jobId || !isValidUUID(jobId)) {
    return NextResponse.json({ error: "Valid jobId is required" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Workspace scoping via the job's product (same check as the status GET) -
  // this route could previously reset any workspace's job (audit P3).
  const { data: job, error: jobErr } = await db
    .from("swipe_jobs")
    .select("id, product_id")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.product_id) {
    const { data: product } = await db
      .from("products")
      .select("id")
      .eq("id", job.product_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!product) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
  }

  // Reset the job
  const { error } = await db
    .from("swipe_jobs")
    .update({
      status: "pending",
      error_message: null,
      progress_chars: 0,
      progress_message: "Retrying...",
      raw_output: null,
      rewritten_html: null,
      images: null,
      started_at: null,
      completed_at: null,
    })
    .eq("id", jobId);

  if (error) {
    return NextResponse.json({ error: "Failed to reset job" }, { status: 500 });
  }

  // Ping the worker
  const workerUrl = process.env.SWIPE_WORKER_URL;
  const workerSecret = process.env.SWIPE_WORKER_SECRET;

  if (workerUrl && workerSecret) {
    fetch(`${workerUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({ jobId }),
    }).catch((err) => {
      console.error("[Swipe Retry] Failed to ping worker:", err.message);
    });
  }

  return NextResponse.json({ ok: true, jobId });
}
