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

  // Fetch published landing pages
  let query = db
    .from("translations")
    .select("id, language, slug, published_url, seo_title, pages!inner(id, name, slug, product, tags, page_type)")
    .eq("status", "published")
    .eq("language", language)
    .not("published_url", "is", null);

  if (product) {
    query = query.eq("pages.product", product);
  }

  // Fetch active AB tests for this language
  const [pagesResult, abTestsResult] = await Promise.all([
    query.order("updated_at", { ascending: false }),
    db
      .from("ab_tests")
      .select("id, name, slug, language, router_url, status")
      .eq("language", language)
      .eq("status", "active")
      .not("router_url", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  if (pagesResult.error) {
    return safeError(pagesResult.error, "Failed to fetch landing page assets");
  }

  return NextResponse.json({
    pages: pagesResult.data ?? [],
    abTests: abTestsResult.data ?? [],
  });
}
