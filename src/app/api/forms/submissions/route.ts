// Internal (session-gated by middleware): list form submissions for the
// current workspace - the visible "dead letter queue" behind /forms.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  const status = (req.nextUrl.searchParams.get("status") || "").trim();

  const supabase = createServerSupabase();
  let query = supabase
    .from("form_submissions")
    .select(
      "id, form_id, market, client_submission_id, email, name, order_number, gate_status, delivery_status, delivery_attempts, next_retry_at, delivered_at, ticket_id, last_error, is_test, created_at, payload, files"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("delivery_status", status);

  const { data: submissions, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: forms } = await supabase
    .from("forms")
    .select("id, slug, name, market, status")
    .eq("workspace_id", workspaceId)
    .order("slug");

  return NextResponse.json({ submissions: submissions ?? [], forms: forms ?? [] });
}
