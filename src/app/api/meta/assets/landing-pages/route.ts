import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language");
  const product = searchParams.get("product");

  if (!language) {
    return NextResponse.json({ error: "language is required" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Fetch published landing pages
  let query = db
    .from("translations")
    .select("id, language, slug, published_url, seo_title, pages!inner(id, name, slug, product, tags, page_type, angle, thumbnail_url)")
    .eq("status", "published")
    .eq("language", language)
    .eq("pages.workspace_id", workspaceId)
    .not("published_url", "is", null);

  if (product) {
    query = query.eq("pages.product", product);
  }

  const pagesResult = await query.order("updated_at", { ascending: false });

  if (pagesResult.error) {
    return safeError(pagesResult.error, "Failed to fetch landing page assets");
  }

  return NextResponse.json({
    pages: pagesResult.data ?? [],
  });
}
