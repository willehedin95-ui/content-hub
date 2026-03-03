import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const adId = req.nextUrl.searchParams.get("ad_id");

  let query = db
    .from("ad_learnings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (adId) {
    query = query.eq("meta_ad_id", adId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ learnings: data ?? [] });
}
