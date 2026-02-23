import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10)));
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    db
      .from("pages")
      .select(`*, translations (id, language, status, published_url, seo_title)`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    db.from("pages").select("id", { count: "exact", head: true }),
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
  const body = await req.json();

  const { name, product, page_type, source_url, original_html, slug, images_to_translate, source_language, tags } = body;

  if (!name || !product || !page_type || !source_url || !original_html || !slug) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Check for duplicate slug
  const { data: existingPage } = await db
    .from("pages")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existingPage) {
    return NextResponse.json(
      { error: `A page with slug "${slug}" already exists` },
      { status: 409 }
    );
  }

  const { data: page, error } = await db
    .from("pages")
    .insert({
      name,
      product,
      page_type,
      source_url,
      original_html,
      slug,
      source_language: source_language || "en",
      images_to_translate: images_to_translate || [],
      tags: tags || [],
      swiped_from_url: body.swiped_from_url || null,
    })
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to create page");
  }

  return NextResponse.json(page, { status: 201 });
}
