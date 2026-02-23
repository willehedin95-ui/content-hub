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
      .from("ab_tests")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    db.from("ab_tests").select("id", { count: "exact", head: true }),
  ]);

  if (dataResult.error) {
    return safeError(dataResult.error, "Failed to fetch A/B tests");
  }

  return NextResponse.json({
    tests: dataResult.data,
    total: countResult.count ?? 0,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  const { name, slug, language, control_id, variant_id, split, description } = await req.json();

  if (!name || !slug || !language || !control_id || !variant_id) {
    return NextResponse.json(
      { error: "name, slug, language, control_id, and variant_id are required" },
      { status: 400 }
    );
  }

  if (control_id === variant_id) {
    return NextResponse.json(
      { error: "Variant A and Variant B must be different translations" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // Validate both translations exist and have HTML
  const [{ data: controlT }, { data: variantT }] = await Promise.all([
    db.from("translations").select("id, translated_html, language").eq("id", control_id).single(),
    db.from("translations").select("id, translated_html, language").eq("id", variant_id).single(),
  ]);

  if (!controlT || !variantT) {
    return NextResponse.json(
      { error: "One or both translations not found" },
      { status: 404 }
    );
  }

  if (!controlT.translated_html || !variantT.translated_html) {
    return NextResponse.json(
      { error: "Both translations must have HTML content" },
      { status: 400 }
    );
  }

  if (controlT.language !== language || variantT.language !== language) {
    return NextResponse.json(
      { error: "Both translations must match the selected language" },
      { status: 400 }
    );
  }

  // Check slug uniqueness for this language
  const { data: existing } = await db
    .from("ab_tests")
    .select("id")
    .eq("slug", slug)
    .eq("language", language)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "A test with this slug already exists for this language" },
      { status: 409 }
    );
  }

  // Create the A/B test
  const { data: test, error: tErr } = await db
    .from("ab_tests")
    .insert({
      name,
      slug,
      language,
      description: description || null,
      control_id,
      variant_id,
      split: split ?? 50,
      status: "draft",
    })
    .select()
    .single();

  if (tErr || !test) {
    return safeError(tErr, "Failed to create A/B test");
  }

  return NextResponse.json(test, { status: 201 });
}
