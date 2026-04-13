import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

// GET: count of all pending logs across all periods
export async function GET() {
  const db = createServerSupabase();
  const { count, error } = await db
    .from("invoice_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ count: count || 0 });
}

// POST: mark all pending logs as done (optionally filtered by period)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const db = createServerSupabase();

  let query = db
    .from("invoice_logs")
    .update({ status: "done" })
    .eq("status", "pending");

  if (body.period) {
    query = query.eq("period", body.period);
  }

  const { data, error } = await query.select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ updated: data?.length || 0 });
}
