import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Fetch processing jobs + average generation time in parallel.
  // The average uses versions.generation_time_seconds (actual render time)
  // instead of updated_at - created_at deltas, which measured queue wait and
  // mixed in other workspaces (audit ui8).
  const [jobsResult, avgResult] = await Promise.all([
    db
      .from("image_jobs")
      .select("id, status, source_images(id, image_translations(status))")
      .eq("workspace_id", workspaceId)
      .eq("status", "processing"),
    db
      .from("versions")
      .select(
        "generation_time_seconds, image_translations!inner(source_images!inner(image_jobs!inner(workspace_id)))"
      )
      .eq("image_translations.source_images.image_jobs.workspace_id", workspaceId)
      .not("generation_time_seconds", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Compute average seconds per image from recent renders
  let avgSeconds = 75; // fallback default
  const durations = (avgResult.data ?? [])
    .map((v) => v.generation_time_seconds as number | null)
    .filter((d): d is number => typeof d === "number" && d > 0 && d < 600); // ignore outliers > 10min
  if (durations.length >= 5) {
    avgSeconds = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  }

  const jobs = jobsResult.data;
  if (jobsResult.error || !jobs || jobs.length === 0) {
    return NextResponse.json({ processing: false, completed: 0, total: 0, avgSeconds });
  }

  let completed = 0;
  let total = 0;

  for (const job of jobs) {
    const images = (job as Record<string, unknown>).source_images as
      | { image_translations: { status: string }[] }[]
      | undefined;
    for (const si of images ?? []) {
      for (const t of si.image_translations ?? []) {
        total++;
        if (t.status === "completed" || t.status === "failed") completed++;
      }
    }
  }

  return NextResponse.json({ processing: true, completed, total, avgSeconds });
}
