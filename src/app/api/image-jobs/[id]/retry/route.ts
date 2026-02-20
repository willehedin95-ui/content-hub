import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const includeStalled = _req.nextUrl.searchParams.get("include_stalled") === "true";
  const db = createServerSupabase();

  // Find all failed translations for this job
  const { data: failed, error: findError } = await db
    .from("image_translations")
    .select("id, source_images!inner(job_id)")
    .eq("source_images.job_id", jobId)
    .eq("status", "failed");

  if (findError) {
    return safeError(findError, "Failed to find failed translations");
  }

  let ids = (failed ?? []).map((t) => t.id);

  // Also include stalled "processing" translations when requested
  if (includeStalled) {
    const { data: stalled, error: stalledError } = await db
      .from("image_translations")
      .select("id, source_images!inner(job_id)")
      .eq("source_images.job_id", jobId)
      .eq("status", "processing");

    if (stalledError) {
      return safeError(stalledError, "Failed to find stalled translations");
    }

    if (stalled?.length) {
      ids = [...ids, ...stalled.map((t) => t.id)];
    }
  }

  if (!ids.length) {
    return NextResponse.json({ message: "No translations to retry", ids: [] });
  }

  // Reset to pending
  const { error: updateError } = await db
    .from("image_translations")
    .update({
      status: "pending",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (updateError) {
    return safeError(updateError, "Failed to reset translations for retry");
  }

  // Set job back to processing
  await db
    .from("image_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  return NextResponse.json({ ids });
}
