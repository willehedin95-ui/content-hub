import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const now = new Date();
  const period =
    url.searchParams.get("period") ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const db = createServerSupabase();

  const { data, error } = await db
    .from("invoice_logs")
    .select("*")
    .is("service_id", null)
    .eq("period", period)
    .eq("status", "unmatched")
    .order("email_date", { ascending: false });

  if (error) {
    return NextResponse.json([], { status: 200 });
  }

  return NextResponse.json(data || []);
}
