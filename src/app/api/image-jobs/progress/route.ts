import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET() {
  const db = createServerSupabase();

  // Fetch processing jobs + average generation time in parallel
  const [jobsResult, avgResult] = await Promise.all([
    db
      .from("image_jobs")
      .select("id, status, source_images(id, image_translations(status))")
      .eq("status", "processing"),
    db
      .from("image_translations")
      .select("created_at, updated_at")
      .eq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  // Compute average seconds per translation from recent completions
  let avgSeconds = 75; // fallback default
  const recentTranslations = avgResult.data ?? [];
  if (recentTranslations.length >= 5) {
    const durations = recentTranslations
      .map((t) => {
        const created = new Date(t.created_at).getTime();
        const updated = new Date(t.updated_at).getTime();
        const diff = (updated - created) / 1000;
        return diff > 0 && diff < 600 ? diff : null; // ignore outliers > 10min
      })
      .filter((d): d is number => d !== null);
    if (durations.length >= 5) {
      avgSeconds = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }
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
