import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();
  const params = req.nextUrl.searchParams;

  const source = params.get("source"); // board | brand_spy | explore
  const status = params.get("status"); // queued | swiping | swiped | skipped
  const minScore = params.get("min_score"); // AI relevance score minimum
  const search = params.get("search"); // brand name search
  const limit = Math.min(parseInt(params.get("limit") || "100"), 200);
  const offset = parseInt(params.get("offset") || "0");

  let query = db
    .from("discovered_ads")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (source) query = query.eq("source", source);
  if (status) query = query.eq("status", status);
  if (minScore) query = query.gte("ai_relevance_score", parseInt(minScore));
  if (search) query = query.ilike("brand_name", `%${search}%`);

  const { data: ads, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch linked image_jobs for swiped ads
  const imageJobIds = (ads ?? []).map((a) => a.image_job_id).filter(Boolean);
  const { data: imageJobs } = imageJobIds.length > 0
    ? await db.from("image_jobs")
        .select("id, name, concept_number, status, launchpad_priority, archived_at")
        .in("id", imageJobIds)
    : { data: [] };

  const jobMap = new Map((imageJobs ?? []).map((j) => [j.id, j]));

  // Fetch linked video_jobs for video ad swipes
  const videoJobIds = (ads ?? []).map((a) => a.video_job_id).filter(Boolean);
  const { data: videoJobs } = videoJobIds.length > 0
    ? await db.from("video_jobs")
        .select("id, concept_name, concept_number, status, launchpad_priority")
        .in("id", videoJobIds)
    : { data: [] };

  const videoJobMap = new Map((videoJobs ?? []).map((j) => [j.id, j]));

  // Stats
  const { data: stats } = await db
    .from("discovered_ads")
    .select("status")
    .eq("workspace_id", workspaceId);

  const statCounts = {
    total: stats?.length ?? 0,
    queued: stats?.filter((s) => s.status === "queued").length ?? 0,
    swiping: stats?.filter((s) => s.status === "swiping").length ?? 0,
    swiped: stats?.filter((s) => s.status === "swiped").length ?? 0,
    skipped: stats?.filter((s) => s.status === "skipped").length ?? 0,
  };

  return NextResponse.json({
    ads: (ads ?? []).map((ad) => ({
      ...ad,
      image_job: ad.image_job_id ? jobMap.get(ad.image_job_id) ?? null : null,
      video_job: ad.video_job_id ? videoJobMap.get(ad.video_job_id) ?? null : null,
    })),
    total: count ?? 0,
    stats: statCounts,
  });
}
