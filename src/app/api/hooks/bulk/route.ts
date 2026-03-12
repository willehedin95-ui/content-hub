import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

const VALID_ACTIONS = new Set(["approve", "archive"]);

// POST /api/hooks/bulk — bulk approve or archive hooks
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { ids, action } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: "ids must be a non-empty array" },
      { status: 400 }
    );
  }

  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: 'action must be "approve" or "archive"' },
      { status: 400 }
    );
  }

  const statusMap: Record<string, string> = {
    approve: "approved",
    archive: "archived",
  };

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("hook_library")
    .update({
      status: statusMap[action],
      updated_at: new Date().toISOString(),
    })
    .in("id", ids)
    .eq("workspace_id", workspaceId)
    .select("id");

  if (error) return safeError(error, "Failed to bulk update hooks");

  return NextResponse.json({ success: true, updated: data?.length ?? 0 });
}
