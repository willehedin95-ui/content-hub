import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export interface FeedItem {
  id: string;
  type:
    | "kill_adset"
    | "increase_budget"
    | "concept_created"
    | "concept_approved"
    | "concept_rejected"
    | "video_created"
    | "video_approved"
    | "video_rejected"
    | "iterate_concept"
    | "iterate_approved"
    | "iterate_rejected"
    | "concept_pushed";
  timestamp: string;
  title: string;
  details?: string;
  success?: boolean;
  linkUrl?: string;
}

export async function GET(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "7");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [actionsRes, imageJobsRes, videoJobsRes] = await Promise.all([
    // 1. Autopilot actions (kills, budgets, approvals, iterations)
    db
      .from("autopilot_actions")
      .select("id, action_type, target_id, target_name, details, success, error_message, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),

    // 2. Autopilot-created image jobs
    db
      .from("image_jobs")
      .select("id, name, concept_number, status, source, created_at")
      .eq("workspace_id", workspaceId)
      .eq("source", "autopilot")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50),

    // 3. Autopilot-created video jobs
    db
      .from("video_jobs")
      .select("id, concept_name, status, source, created_at")
      .eq("workspace_id", workspaceId)
      .eq("source", "autopilot")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const items: FeedItem[] = [];

  // Map autopilot_actions
  for (const a of actionsRes.data ?? []) {
    const details = a.details as Record<string, unknown> | null;
    let title = "";
    let detailLine = "";

    switch (a.action_type) {
      case "kill_adset":
        title = `Killed ad set: ${a.target_name}`;
        detailLine = (details?.recommendation_title as string) ?? "";
        break;
      case "increase_budget": {
        const oldB = details?.old_budget_sek as number | undefined;
        const newB = details?.new_budget_sek as number | undefined;
        const pct = details?.change_pct as number | undefined;
        title = `Budget ${pct ? `+${pct}%` : "adjusted"} on ${a.target_name}`;
        detailLine = oldB && newB ? `${oldB} kr/d → ${newB} kr/d` : "";
        break;
      }
      case "concept_approved":
        title = `Approved concept: ${a.target_name}`;
        detailLine = (details?.concept_number ? `#${details.concept_number}` : "") as string;
        break;
      case "concept_rejected":
        title = `Rejected concept: ${a.target_name}`;
        break;
      case "video_approved":
        title = `Approved video: ${a.target_name}`;
        break;
      case "video_rejected":
        title = `Rejected video: ${a.target_name}`;
        break;
      case "iterate_concept":
        title = `Creative refresh started: ${a.target_name}`;
        detailLine = (details?.reason as string) ?? "";
        break;
      case "iterate_approved":
        title = `Creative refresh approved: ${a.target_name}`;
        break;
      case "iterate_rejected":
        title = `Creative refresh rejected: ${a.target_name}`;
        break;
      default:
        title = `${a.action_type}: ${a.target_name}`;
    }

    items.push({
      id: `action-${a.id}`,
      type: a.action_type,
      timestamp: a.created_at,
      title,
      details: a.error_message ? `Error: ${a.error_message}` : detailLine || undefined,
      success: a.success,
      linkUrl: a.target_id && (a.action_type.includes("concept") || a.action_type.includes("iterate"))
        ? `/concepts/${a.target_id}`
        : undefined,
    });
  }

  // Map image_jobs created by autopilot (concept_created entries)
  // Avoid duplicates with concept_approved/rejected already in autopilot_actions
  const actionTargetIds = new Set(
    (actionsRes.data ?? [])
      .filter((a) => a.action_type.startsWith("concept_"))
      .map((a) => a.target_id)
  );

  for (const j of imageJobsRes.data ?? []) {
    // Only add "created" entries — approvals/rejections come from autopilot_actions
    if (!actionTargetIds.has(j.id)) {
      items.push({
        id: `job-${j.id}`,
        type: "concept_created",
        timestamp: j.created_at,
        title: `New concept: ${j.name}`,
        details: j.concept_number ? `#${j.concept_number}` : undefined,
        linkUrl: `/concepts/${j.id}`,
      });
    }
  }

  // Map video jobs
  const videoActionIds = new Set(
    (actionsRes.data ?? [])
      .filter((a) => a.action_type.startsWith("video_"))
      .map((a) => a.target_id)
  );

  for (const v of videoJobsRes.data ?? []) {
    if (!videoActionIds.has(v.id)) {
      items.push({
        id: `video-${v.id}`,
        type: "video_created",
        timestamp: v.created_at,
        title: `New video concept: ${v.concept_name}`,
        linkUrl: `/video-ads/${v.id}`,
      });
    }
  }

  // Sort by timestamp descending
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ items });
}
