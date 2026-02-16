import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET() {
  const db = createServerSupabase();

  const { data: pages, error } = await db
    .from("pages")
    .select(
      `
      *,
      translations (id, language, status, published_url, seo_title)
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(pages);
}

export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const body = await req.json();

  const { name, product, page_type, source_url, original_html, slug } = body;

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
    .insert({ name, product, page_type, source_url, original_html, slug })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(page, { status: 201 });
}
