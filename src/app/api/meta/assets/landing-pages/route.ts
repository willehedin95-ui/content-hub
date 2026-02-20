import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language");
  const product = searchParams.get("product");

  if (!language) {
    return NextResponse.json({ error: "language is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  let query = db
    .from("translations")
    .select("id, language, slug, published_url, seo_title, pages!inner(id, name, slug, product)")
    .eq("status", "published")
    .eq("language", language)
    .not("published_url", "is", null);

  if (product) {
    query = query.eq("pages.product", product);
  }

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) {
    return safeError(error, "Failed to fetch landing page assets");
  }

  return NextResponse.json(data ?? []);
}
