import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET() {
  const db = createServerSupabase();

  const { data, error } = await db
    .from("meta_page_config")
    .select("*")
    .order("country");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const { country, meta_page_id, meta_page_name } = (await req.json()) as {
    country: string;
    meta_page_id: string;
    meta_page_name?: string;
  };

  if (!country || !meta_page_id) {
    return NextResponse.json(
      { error: "country and meta_page_id are required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  const { data, error } = await db
    .from("meta_page_config")
    .upsert(
      {
        country,
        meta_page_id,
        meta_page_name: meta_page_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "country" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
