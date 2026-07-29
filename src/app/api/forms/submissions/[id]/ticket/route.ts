// Internal (session-gated): live helpdesk status for one delivered
// submission - lets the /forms inbox show whether SCC has handled the
// ticket without anyone logging into Freshdesk.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import type { HelpdeskConfig } from "@/types/forms";

export const maxDuration = 15;

// https://developers.freshdesk.com/api/#tickets - status field
const FRESHDESK_STATUS: Record<number, string> = {
  2: "Öppen",
  3: "Väntar",
  4: "Löst",
  5: "Stängd",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const workspaceId = await getWorkspaceId();
  const supabase = createServerSupabase();
  const { data: row } = await supabase
    .from("form_submissions")
    .select("id, workspace_id, ticket_id")
    .eq("id", id)
    .single<{ id: string; workspace_id: string; ticket_id: string | null }>();
  if (!row || row.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!row.ticket_id) {
    return NextResponse.json({ ticket: null });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single<{ settings: Record<string, unknown> | null }>();
  const helpdesk = (workspace?.settings?.forms_helpdesk as HelpdeskConfig | undefined) ?? {
    type: "freshdesk",
    account: "renew",
  };
  if (helpdesk.type !== "freshdesk") {
    // E-mail adapter has no ticket concept to look up
    return NextResponse.json({ ticket: null });
  }

  const { resolveFreshdeskCreds } = await import("@/lib/form-delivery");
  const creds = resolveFreshdeskCreds(helpdesk);
  if (!creds) {
    return NextResponse.json({ ticket: null, error: "Freshdesk not configured" });
  }
  const { domain, apiKey } = creds;

  const agentUrl = `https://${domain}.freshdesk.com/a/tickets/${row.ticket_id}`;
  try {
    const res = await fetch(`https://${domain}.freshdesk.com/api/v2/tickets/${row.ticket_id}`, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${apiKey}:X`).toString("base64"),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) {
      return NextResponse.json({ ticket: { deleted: true, url: agentUrl } });
    }
    if (!res.ok) {
      return NextResponse.json({ ticket: { url: agentUrl }, error: `Freshdesk ${res.status}` });
    }
    const t = (await res.json()) as { status: number; updated_at?: string };
    return NextResponse.json({
      ticket: {
        url: agentUrl,
        status: t.status,
        statusLabel: FRESHDESK_STATUS[t.status] ?? `Status ${t.status}`,
        updatedAt: t.updated_at ?? null,
      },
    });
  } catch {
    // Freshdesk unreachable - still hand back the deep link
    return NextResponse.json({ ticket: { url: agentUrl }, error: "Freshdesk unreachable" });
  }
}
