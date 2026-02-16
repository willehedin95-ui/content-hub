import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET() {
  const db = createServerSupabase();

  const { data, error } = await db
    .from("ab_tests")
    .select(`*, pages (name, slug)`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
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
    return NextResponse.json(
      { error: vErr?.message || "Failed to create variant" },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: tErr?.message || "Failed to create A/B test" },
      { status: 500 }
    );
  }

  return NextResponse.json(test, { status: 201 });
}
