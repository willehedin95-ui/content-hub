import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
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

  // Fetch ALL landing pages with translations (published first, then unpublished)
  // so the user can assign a landing page before publishing it
  let query = db
    .from("translations")
    .select("id, language, slug, published_url, seo_title, status, pages!inner(id, name, slug, product, tags, page_type, angle, thumbnail_url)")
    .eq("language", language)
    .eq("pages.workspace_id", workspaceId)
    .or("content_type.eq.landing_page,content_type.is.null", { referencedTable: "pages" });

  if (product) {
    query = query.eq("pages.product", product);
  }

  const pagesResult = await query.order("updated_at", { ascending: false });

  if (pagesResult.error) {
    return safeError(pagesResult.error, "Failed to fetch landing page assets");
  }

  // Also fetch pages that have NO translations yet (ready pages)
  let pagesOnlyQuery = db
    .from("pages")
    .select("id, name, slug, product, tags, page_type, angle, thumbnail_url")
    .eq("workspace_id", workspaceId)
    .or("content_type.eq.landing_page,content_type.is.null");

  if (product) {
    pagesOnlyQuery = pagesOnlyQuery.eq("product", product);
  }

  const pagesOnlyResult = await pagesOnlyQuery.order("created_at", { ascending: false });

  // Merge: pages with translations first (published prioritized), then pages without translations
  const seenPageIds = new Set<string>();
  const allPages: Array<{
    pages: { id: string; name: string; slug: string; product: string; tags?: string[]; page_type?: string; angle?: string; thumbnail_url?: string | null };
    published_url: string | null;
    status: string;
  }> = [];

  // Sort: published first, then by status
  const sorted = [...(pagesResult.data ?? [])].sort((a, b) => {
    if (a.published_url && !b.published_url) return -1;
    if (!a.published_url && b.published_url) return 1;
    return 0;
  });

  for (const t of sorted) {
    const page = t.pages as unknown as { id: string; name: string; slug: string; product: string; tags?: string[]; page_type?: string; angle?: string; thumbnail_url?: string | null };
    if (!seenPageIds.has(page.id)) {
      seenPageIds.add(page.id);
      allPages.push({ pages: page, published_url: t.published_url, status: t.status });
    }
  }

  // Add pages that have no translations at all
  for (const page of pagesOnlyResult.data ?? []) {
    if (!seenPageIds.has(page.id)) {
      seenPageIds.add(page.id);
      allPages.push({
        pages: page,
        published_url: null,
        status: "no_translation",
      });
    }
  }

  return NextResponse.json({
    pages: allPages,
  });
}
