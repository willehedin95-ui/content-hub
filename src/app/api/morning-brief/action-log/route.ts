import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

/**
 * GET /api/morning-brief/action-log?date=YYYY-MM-DD
 * Returns all applied/dismissed card IDs for a given brief date.
 */
export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const date = req.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date param required" }, { status: 400 });
  }

  const { data, error } = await db
    .from("brief_action_log")
    .select("card_id, status")
    .eq("brief_date", date);

  if (error) return safeError(error, "Failed to fetch action log");

  // Return as a map: { [card_id]: "applied" | "dismissed" }
  const log: Record<string, string> = {};
  for (const row of data ?? []) {
    log[row.card_id] = row.status;
  }

  return NextResponse.json(log);
}

/**
 * POST /api/morning-brief/action-log
 * Persist that an action card was applied or dismissed.
 * Body: { brief_date: "YYYY-MM-DD", card_id: "xxx", status: "applied" | "dismissed" }
 */
export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const body = await req.json();
  const { brief_date, card_id, status } = body;

  if (!brief_date || !card_id || !status) {
    return NextResponse.json(
      { error: "brief_date, card_id, and status are required" },
      { status: 400 }
    );
  }

  const { error } = await db
    .from("brief_action_log")
    .upsert(
      { brief_date, card_id, status },
      { onConflict: "brief_date,card_id" }
    );

  if (error) return safeError(error, "Failed to save action log");

  return NextResponse.json({ ok: true });
}
