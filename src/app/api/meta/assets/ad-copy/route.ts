import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language");

  if (!language) {
    return NextResponse.json({ error: "language is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data, error } = await db
    .from("ad_copy_translations")
    .select("id, language, translated_text, ad_copy_jobs!inner(id, name, source_text)")
    .eq("status", "completed")
    .eq("language", language)
    .not("translated_text", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    return safeError(error, "Failed to fetch ad copy assets");
  }

  return NextResponse.json(data ?? []);
}
