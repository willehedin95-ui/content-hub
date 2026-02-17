import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET() {
  const db = createServerSupabase();

  const { data: jobs, error } = await db
    .from("image_jobs")
    .select("id, status, source_images(id, image_translations(status))")
    .eq("status", "processing");

  if (error) {
    return NextResponse.json({ processing: false, completed: 0, total: 0 });
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ processing: false, completed: 0, total: 0 });
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

  return NextResponse.json({ processing: true, completed, total });
}
