import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();
  const showHistory = req.nextUrl.searchParams.get("history") === "true";

  // For history tab: show swiped items with their image_jobs
  if (showHistory) {
    const { data: items } = await db
      .from("discovered_ads")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in("status", ["swiped"])
      .order("updated_at", { ascending: false })
      .limit(50);

    // Fetch linked image_jobs
    const jobIds = (items ?? []).map((i) => i.image_job_id).filter(Boolean);
    const { data: jobs } = jobIds.length > 0
      ? await db.from("image_jobs")
          .select("id, name, concept_number, status, launchpad_priority, archived_at")
          .in("id", jobIds)
      : { data: [] };

    const jobMap = new Map((jobs ?? []).map((j) => [j.id, j]));

    return NextResponse.json({
      items: (items ?? []).map((item) => ({
        ...item,
        image_job: item.image_job_id ? jobMap.get(item.image_job_id) ?? null : null,
      })),
    });
  }

  // Queue view: queued + swiping + recently swiped (pending approval)
  const { data: items } = await db
    .from("discovered_ads")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", ["queued", "swiping", "swiped"])
    .order("created_at", { ascending: true })
    .limit(100);

  // Fetch linked image_jobs with source_images for swiped items
  const jobIds = (items ?? []).map((i) => i.image_job_id).filter(Boolean);
  const { data: jobs } = jobIds.length > 0
    ? await db.from("image_jobs")
        .select("id, name, concept_number, status, launchpad_priority, archived_at, source_images(id, original_url, processing_order)")
        .in("id", jobIds)
        .order("processing_order", { referencedTable: "source_images", ascending: true })
    : { data: [] };

  const jobMap = new Map((jobs ?? []).map((j) => [j.id, j]));

  const enriched = (items ?? []).map((item) => ({
    ...item,
    image_job: item.image_job_id ? jobMap.get(item.image_job_id) ?? null : null,
  }));

  const counts = {
    queued: enriched.filter((i) => i.status === "queued").length,
    swiping: enriched.filter((i) => i.status === "swiping").length,
    swiped: enriched.filter((i) => i.status === "swiped").length,
  };

  return NextResponse.json({ items: enriched, counts });
}
