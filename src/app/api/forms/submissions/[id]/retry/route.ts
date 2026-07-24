// Internal (session-gated): manually retry helpdesk delivery for one
// submission from the /forms inbox.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { deliverSubmission } from "@/lib/form-delivery";
import { isValidUUID } from "@/lib/validation";

export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Scope check: only submissions in the active workspace can be retried
  const workspaceId = await getWorkspaceId();
  const supabase = createServerSupabase();
  const { data: row } = await supabase
    .from("form_submissions")
    .select("id, workspace_id, delivery_status")
    .eq("id", id)
    .single<{ id: string; workspace_id: string; delivery_status: string }>();
  if (!row || row.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.delivery_status === "delivered") {
    return NextResponse.json({ ok: true, alreadyDelivered: true });
  }

  // Manual retry from the inbox also revives "failed"/"skipped" rows
  await supabase
    .from("form_submissions")
    .update({ delivery_status: "pending", next_retry_at: null })
    .eq("id", id);

  const result = await deliverSubmission(id);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
