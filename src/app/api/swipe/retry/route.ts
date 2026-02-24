import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
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
