import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

// GET /api/spy/brands — list all spy brands
export async function GET() {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("spy_brands")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return safeError(error, "Failed to load brands");
  return NextResponse.json({ data });
}

// POST /api/spy/brands — add a new brand
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, ad_library_url, category, notes } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!ad_library_url?.trim()) {
    return NextResponse.json(
      { error: "Meta Ad Library URL is required" },
      { status: 400 }
    );
  }

  // Try to extract page ID from the URL
  const pageIdMatch = ad_library_url.match(
    /view_all_page_id=(\d+)/
  );
  const metaPageId = pageIdMatch?.[1] ?? null;

  const db = createServerSupabase();
  const { data, error } = await db
    .from("spy_brands")
    .insert({
      name: name.trim(),
      ad_library_url: ad_library_url.trim(),
      meta_page_id: metaPageId,
      category: category || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return safeError(error, "Failed to add brand");
  return NextResponse.json({ data }, { status: 201 });
}
