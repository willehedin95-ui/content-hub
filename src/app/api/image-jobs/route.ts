import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { ImageJob, Language, MetaCampaignStatus, SourceImage } from "@/types";
import { isValidLanguage, isValidAspectRatio } from "@/lib/validation";

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

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  // List page only needs translation status, not full version history
  const [jobsResult, countResult, campaignsResult] = await Promise.all([
    db
      .from("image_jobs")
      .select(`*, source_images(id, filename, original_url, skip_translation, image_translations(id, language, status, aspect_ratio, translated_url, active_version_id, updated_at))`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    db
      .from("image_jobs")
      .select("id", { count: "exact", head: true }),
    db
      .from("meta_campaigns")
      .select("image_job_id, countries, language, status")
      .not("image_job_id", "is", null),
  ]);

  const { data: jobs, error } = jobsResult;
  const totalCount = countResult.count ?? 0;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group deployments by image_job_id
  const deploymentsByJob = new Map<string, Array<{ country: string; language: Language; status: MetaCampaignStatus }>>();
  for (const c of campaignsResult.data ?? []) {
    const list = deploymentsByJob.get(c.image_job_id) ?? [];
    for (const country of c.countries) {
      list.push({ country, language: c.language, status: c.status });
    }
    deploymentsByJob.set(c.image_job_id, list);
  }

  const enriched = (jobs ?? []).map((job) => ({
    ...computeCounts(job),
    deployments: deploymentsByJob.get(job.id) ?? [],
  }));
  return NextResponse.json({ jobs: enriched, total: totalCount, page, limit });
}

// Creates a job, then images are uploaded individually via /api/image-jobs/[id]/upload
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, target_languages, source_folder_id, target_ratios, product } = body as {
    name?: string;
    target_languages?: string[];
    source_folder_id?: string;
    target_ratios?: string[];
    product?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (target_languages?.length && !target_languages.every(isValidLanguage)) {
    return NextResponse.json({ error: "Invalid language in target_languages" }, { status: 400 });
  }

  if (target_ratios?.length && !target_ratios.every(isValidAspectRatio)) {
    return NextResponse.json({ error: "Invalid ratio in target_ratios" }, { status: 400 });
  }

  const db = createServerSupabase();

  const insertData: Record<string, unknown> = {
    name: name.trim(),
    status: "draft",
    target_languages: target_languages?.length ? target_languages : [],
    target_ratios: target_ratios?.length ? target_ratios : ["1:1"],
  };
  if (source_folder_id) insertData.source_folder_id = source_folder_id;
  if (product) insertData.product = product;

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
