import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET() {
  const db = createServerSupabase();

  const { data, error } = await db
    .from("app_settings")
    .select("settings")
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data?.settings ?? {});
}

export async function PUT(req: NextRequest) {
  const settings = await req.json();
  const db = createServerSupabase();

  // Check if a row exists
  const { data: existing } = await db
    .from("app_settings")
    .select("id")
    .limit(1)
    .single();

  if (existing) {
    const { error } = await db
      .from("app_settings")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await db
      .from("app_settings")
      .insert({ settings });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json(settings);
}
