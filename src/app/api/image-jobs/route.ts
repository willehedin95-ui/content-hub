import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { Language, MetaCampaignStatus } from "@/types";
import { isValidLanguage, isValidAspectRatio } from "@/lib/validation";
import { computeCounts } from "@/lib/image-utils";
import { safeError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const url = new URL(req.url);
  // V3.4: If iteration_of filter provided, return lightweight child list
  const iterationOf = url.searchParams.get("iteration_of");
  if (iterationOf) {
    const { data, error: iterErr } = await db
      .from("image_jobs")
      .select("id, name, iteration_type, iteration_of, created_at")
      .eq("workspace_id", workspaceId)
      .eq("iteration_of", iterationOf)
      .order("created_at", { ascending: true });
    if (iterErr) return safeError(iterErr, "Failed to fetch iterations");
    return NextResponse.json(data ?? []);
  }

  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;
  const showArchived = url.searchParams.get("archived") === "true";

  // List page only needs translation status, not full version history
  const [jobsResult, countResult, campaignsResult] = await Promise.all([
    (() => {
      const q = db
        .from("image_jobs")
        .select(`*, source_images(id, filename, original_url, skip_translation, image_translations(id, language, status, aspect_ratio, translated_url, active_version_id, updated_at))`)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      return showArchived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    })(),
    (() => {
      const q = db
        .from("image_jobs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      return showArchived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    })(),
    db
      .from("meta_campaigns")
      .select("image_job_id, countries, language, status")
      .not("image_job_id", "is", null),
  ]);

  const { data: jobs, error } = jobsResult;
  const totalCount = countResult.count ?? 0;

  if (error) {
    return safeError(error, "Failed to fetch image jobs");
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
  const { name, target_languages, source_folder_id, target_ratios, product, tags } = body as {
    name?: string;
    target_languages?: string[];
    source_folder_id?: string;
    target_ratios?: string[];
    product?: string;
    tags?: string[];
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
  const workspaceId = await getWorkspaceId();

  // Extract concept number from name like "#002 Bold Text" or "#019 - Swipes 2"
  const trimmedName = name.trim();
  const conceptNumberMatch = trimmedName.match(/^#(\d+)\s*[-–—]?\s*/);
  const conceptNumber = conceptNumberMatch ? parseInt(conceptNumberMatch[1], 10) : null;
  const cleanName = trimmedName.replace(/^#\d+\s*[-–—]?\s*/, "");

  const insertData: {
    name: string;
    status: string;
    target_languages: string[];
    target_ratios: string[];
    source_folder_id?: string;
    product?: string;
    concept_number?: number;
    source: string;
    workspace_id: string;
  } = {
    name: cleanName,
    status: "draft",
    target_languages: target_languages?.length ? target_languages : [],
    target_ratios: target_ratios?.length ? target_ratios : ["4:5", "9:16"],
    source: "external",
    workspace_id: workspaceId,
  };
  if (source_folder_id) insertData.source_folder_id = source_folder_id;
  if (product) insertData.product = product;
  if (conceptNumber !== null) insertData.concept_number = conceptNumber;
  if (tags?.length) (insertData as Record<string, unknown>).tags = tags;

  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .insert(insertData)
    .select()
    .single();

  if (jobError || !job) {
    return safeError(jobError, "Failed to create job");
  }

  return NextResponse.json(job);
}
