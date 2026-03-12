import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { safeError } from "@/lib/api-error";

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

  const { data, error } = await db
    .from("image_jobs")
    .update({ archived_at })
    .eq("workspace_id", workspaceId)
    .in("id", ids)
    .select("id, archived_at");

  if (error) {
    return safeError(error, "Failed to update archive status");
  }

  return NextResponse.json({ updated: data?.length ?? 0 });
}
