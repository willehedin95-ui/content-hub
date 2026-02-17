import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language");
  const ratio = searchParams.get("ratio");

  if (!language) {
    return NextResponse.json({ error: "language is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  let query = db
    .from("image_translations")
    .select("id, language, aspect_ratio, translated_url, source_images!inner(id, filename, original_url, image_jobs!inner(id, name))")
    .eq("status", "completed")
    .eq("language", language)
    .not("translated_url", "is", null);

  if (ratio) {
    query = query.eq("aspect_ratio", ratio);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
