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
      .select(`*, pages (name, slug)`)
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
  const { translation_id } = await req.json();

  if (!translation_id) {
    return NextResponse.json(
      { error: "translation_id is required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // Fetch the control translation
  const { data: control, error: cErr } = await db
    .from("translations")
    .select("*")
    .eq("id", translation_id)
    .single();

  if (cErr || !control) {
    return NextResponse.json(
      { error: "Translation not found" },
      { status: 404 }
    );
  }

  if (!control.translated_html) {
    return NextResponse.json(
      { error: "Translation has no HTML. Translate first." },
      { status: 400 }
    );
  }

  // Check if an A/B test already exists for this page+language
  const { data: existing } = await db
    .from("ab_tests")
    .select("id")
    .eq("page_id", control.page_id)
    .eq("language", control.language)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "An A/B test already exists for this language", id: existing.id },
      { status: 409 }
    );
  }

  // Ensure the control has variant='control'
  await db
    .from("translations")
    .update({ variant: "control" })
    .eq("id", control.id);

  // Create variant B by duplicating the control translation
  const { data: variant, error: vErr } = await db
    .from("translations")
    .insert({
      page_id: control.page_id,
      language: control.language,
      variant: "b",
      translated_html: control.translated_html,
      translated_texts: control.translated_texts,
      seo_title: control.seo_title,
      seo_description: control.seo_description,
      status: "translated",
    })
    .select()
    .single();

  if (vErr || !variant) {
    return safeError(vErr, "Failed to create variant");
  }

  // Create the A/B test record
  const { data: test, error: tErr } = await db
    .from("ab_tests")
    .insert({
      page_id: control.page_id,
      language: control.language,
      control_id: control.id,
      variant_id: variant.id,
      split: 50,
      status: "draft",
    })
    .select()
    .single();

  if (tErr || !test) {
    // Clean up the variant if test creation fails
    await db.from("translations").delete().eq("id", variant.id);
    return safeError(tErr, "Failed to create A/B test");
  }

  return NextResponse.json(test, { status: 201 });
}
