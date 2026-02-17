import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { ImageJob, SourceImage } from "@/types";

function computeCounts(job: ImageJob & { source_images: SourceImage[] }) {
  const allTranslations = job.source_images?.flatMap(
    (si) => si.image_translations ?? []
  ) ?? [];
  return {
    ...job,
    total_images: job.source_images?.length ?? 0,
    total_translations: allTranslations.length,
    completed_translations: allTranslations.filter((t) => t.status === "completed").length,
    failed_translations: allTranslations.filter((t) => t.status === "failed").length,
  };
}

export async function GET() {
  const db = createServerSupabase();

  let { data: jobs, error } = await db
    .from("image_jobs")
    .select(`*, source_images(*, image_translations(*, versions(*)))`)
    .order("created_at", { ascending: false });

  // Fall back to query without versions if table doesn't exist yet
  if (error && error.message?.includes("versions")) {
    const fallback = await db
      .from("image_jobs")
      .select(`*, source_images(*, image_translations(*))`)
      .order("created_at", { ascending: false });
    jobs = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = (jobs ?? []).map(computeCounts);
  return NextResponse.json(enriched);
}

// Creates a job, then images are uploaded individually via /api/image-jobs/[id]/upload
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, target_languages, source_folder_id } = body as {
    name?: string;
    target_languages?: string[];
    source_folder_id?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!target_languages?.length) {
    return NextResponse.json({ error: "Target languages required" }, { status: 400 });
  }

  const db = createServerSupabase();

  const insertData: Record<string, unknown> = {
    name: name.trim(),
    status: "draft",
    target_languages,
  };
  if (source_folder_id) insertData.source_folder_id = source_folder_id;

  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .insert(insertData)
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message ?? "Failed to create job" }, { status: 500 });
  }

  return NextResponse.json(job);
}
