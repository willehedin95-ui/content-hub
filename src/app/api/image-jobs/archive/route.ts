import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { safeError } from "@/lib/api-error";
import { clearFromPushPipeline } from "@/lib/approval-actions";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ids, action } = body as { ids?: string[]; action?: string };

  if (!ids?.length) {
    return NextResponse.json({ error: "ids array is required" }, { status: 400 });
  }
  if (action !== "archive" && action !== "unarchive") {
    return NextResponse.json({ error: 'action must be "archive" or "unarchive"' }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const archived_at = action === "archive" ? new Date().toISOString() : null;

  // Archiving must also remove the concept from the push pipeline: leaving
  // launchpad_priority/lifecycle rows meant the nightly cron could push an
  // ARCHIVED (i.e. rejected) creative to Meta with real budget.
  const update = action === "archive"
    ? { archived_at, launchpad_priority: null }
    : { archived_at };

  const { data, error } = await db
    .from("image_jobs")
    .update(update)
    .eq("workspace_id", workspaceId)
    .in("id", ids)
    .select("id, archived_at");

  if (error) {
    return safeError(error, "Failed to update archive status");
  }

  if (action === "archive" && data?.length) {
    // Note: unarchive does NOT restore priorities/lifecycle — re-approve or
    // re-add to Launch Pad to put an unarchived concept back in the queue.
    await clearFromPushPipeline(db, data.map((d) => d.id));
  }

  return NextResponse.json({ updated: data?.length ?? 0 });
}
