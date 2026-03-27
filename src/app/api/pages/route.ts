import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/constants";
import { getWorkspaceId } from "@/lib/workspace";
import { BLOG_TEMPLATES } from "@/lib/blog-templates";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10)));
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    db
      .from("pages")
      .select(`*, translations (id, language, status, published_url, seo_title)`)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    db.from("pages").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
  ]);

  if (dataResult.error) {
    return safeError(dataResult.error, "Failed to fetch pages");
  }

  return NextResponse.json({
    pages: dataResult.data,
    total: countResult.count ?? 0,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const body = await req.json();

  const { name, product, page_type, source_url, original_html, slug, images_to_translate, source_language, tags, content_type, blog_category, template_id } = body;

  const isBlog = content_type === "seo_blog";

  // Blog pages only require name — we auto-generate slug and a blank HTML template
  if (isBlog) {
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
  } else if (!name || !product || !page_type || !source_url || !original_html || !slug) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const pageSlug = slug || name.toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  // Check for duplicate slug within workspace
  const { data: existingPage } = await db
    .from("pages")
    .select("id")
    .eq("slug", pageSlug)
    .eq("workspace_id", workspaceId)
    .single();

  if (existingPage) {
    return NextResponse.json(
      { error: `A page with slug "${pageSlug}" already exists` },
      { status: 409 }
    );
  }

  // For blog pages, use template HTML if specified
  const blogTemplate = isBlog && template_id
    ? BLOG_TEMPLATES.find((t) => t.id === template_id)
    : undefined;
  const blankHtml = blogTemplate
    ? blogTemplate.getHtml(name)
    : `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title></head><body><h1>${name}</h1><p>Start writing your article here.</p></body></html>`;

  const { data: page, error } = await db
    .from("pages")
    .insert({
      name,
      product: product || null,
      page_type: page_type || "listicle",
      source_url: source_url || "",
      original_html: original_html || blankHtml,
      slug: pageSlug,
      source_language: source_language || "sv",
      images_to_translate: images_to_translate || [],
      tags: tags || [],
      swiped_from_url: body.swiped_from_url || null,
      workspace_id: workspaceId,
      ...(content_type ? { content_type } : {}),
      ...(blog_category ? { blog_category } : {}),
    })
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to create page");
  }

  return NextResponse.json(page, { status: 201 });
}
