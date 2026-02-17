import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language");

  if (!language) {
    return NextResponse.json({ error: "language is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data, error } = await db
    .from("translations")
    .select("id, language, slug, published_url, seo_title, pages!inner(id, name, slug)")
    .eq("status", "published")
    .eq("language", language)
    .not("published_url", "is", null)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
