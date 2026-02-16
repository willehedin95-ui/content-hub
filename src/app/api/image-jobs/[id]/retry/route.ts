import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const db = createServerSupabase();

  // Find all failed translations for this job
  const { data: failed, error: findError } = await db
    .from("image_translations")
    .select("id, source_images!inner(job_id)")
    .eq("source_images.job_id", jobId)
    .eq("status", "failed");

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  if (!failed?.length) {
    return NextResponse.json({ message: "No failed translations to retry", ids: [] });
  }

  const ids = failed.map((t) => t.id);

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
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Set job back to processing
  await db
    .from("image_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  return NextResponse.json({ ids });
}
