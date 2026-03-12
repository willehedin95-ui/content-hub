import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10)));
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    db
      .from("ab_tests")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    db.from("ab_tests").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
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
  const { name, slug, language, control_id, variant_id, split, description, mode } =
    await req.json();

  const isVariationMode = mode === "variation";

  // In variation mode, variant_id is not required (we duplicate the control)
  if (!name || !slug || !language || !control_id || (!isVariationMode && !variant_id)) {
    return NextResponse.json(
      {
        error: isVariationMode
          ? "name, slug, language, and control_id are required"
          : "name, slug, language, control_id, and variant_id are required",
      },
      { status: 400 }
    );
  }

  // In compare mode, control and variant must differ
  if (!isVariationMode && control_id === variant_id) {
    return NextResponse.json(
      { error: "Variant A and Variant B must be different translations" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  let resolvedVariantId = variant_id;
  let variantTranslationId: string | undefined;
  let variantPageId: string | undefined;
  let variantLanguage: string | undefined;

  if (isVariationMode) {
    // --- Variation mode: duplicate the control translation as variant "b" ---
    const { data: controlT, error: controlErr } = await db
      .from("translations")
      .select("id, page_id, language, translated_html, translated_texts, seo_title, seo_description, slug")
      .eq("id", control_id)
      .single();

    if (controlErr || !controlT) {
      return NextResponse.json(
        { error: "Control translation not found" },
        { status: 404 }
      );
    }

    if (!controlT.translated_html) {
      return NextResponse.json(
        { error: "Control translation must have HTML content" },
        { status: 400 }
      );
    }

    if (controlT.language !== language) {
      return NextResponse.json(
        { error: "Control translation must match the selected language" },
        { status: 400 }
      );
    }

    // Duplicate as variant "b"
    const { data: duplicate, error: dupErr } = await db
      .from("translations")
      .insert({
        page_id: controlT.page_id,
        language: controlT.language,
        variant: "b",
        translated_html: controlT.translated_html,
        translated_texts: controlT.translated_texts,
        seo_title: controlT.seo_title,
        seo_description: controlT.seo_description,
        slug: controlT.slug,
        status: "draft",
      })
      .select()
      .single();

    if (dupErr || !duplicate) {
      return safeError(dupErr, "Failed to duplicate control translation");
    }

    resolvedVariantId = duplicate.id;
    variantTranslationId = duplicate.id;
    variantPageId = duplicate.page_id;
    variantLanguage = duplicate.language;
  } else {
    // --- Compare mode: validate both translations exist ---
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
  }

  // Check slug uniqueness for this language
  const { data: existing } = await db
    .from("ab_tests")
    .select("id")
    .eq("slug", slug)
    .eq("language", language)
    .eq("workspace_id", workspaceId)
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
      variant_id: resolvedVariantId,
      split: split ?? 50,
      status: "draft",
      workspace_id: workspaceId,
    })
    .select()
    .single();

  if (tErr || !test) {
    return safeError(tErr, "Failed to create A/B test");
  }

  // In variation mode, include extra fields so the UI can redirect to the editor
  if (isVariationMode) {
    return NextResponse.json(
      { ...test, variant_translation_id: variantTranslationId, variant_page_id: variantPageId, variant_language: variantLanguage },
      { status: 201 }
    );
  }

  return NextResponse.json(test, { status: 201 });
}
