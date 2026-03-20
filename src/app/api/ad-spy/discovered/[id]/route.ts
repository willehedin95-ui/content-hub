import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

/**
 * PATCH /api/ad-spy/discovered/[id] — update a discovered ad's status
 * Body: { action: "skip" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();
  const { action } = await req.json();

  if (action === "skip") {
    const { error } = await db
      .from("discovered_ads")
      .update({ status: "skipped", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
