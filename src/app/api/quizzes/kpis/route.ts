import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

type DateRange = "today" | "last_7d" | "last_30d" | "last_90d";

function resolveSince(range: DateRange): Date {
  const now = new Date();
  const days = range === "today" ? 1 : range === "last_7d" ? 7 : range === "last_30d" ? 30 : 90;
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  return since;
}

export async function GET(req: NextRequest) {
  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const url = req.nextUrl;
  const rangeParam = (url.searchParams.get("range") ?? "last_30d") as DateRange;
  const since = resolveSince(rangeParam);
  const until = new Date();

  const db = createServerSupabase();
  const { data, error } = await db.rpc("workspace_quizzes_kpis", {
    workspace_id_in: workspaceId,
    since: since.toISOString(),
    until: until.toISOString(),
  });

  if (error) return safeError(error, "Failed to load KPIs");

  const response = NextResponse.json(data ?? []);
  response.headers.set("Cache-Control", "private, max-age=60");
  return response;
}
