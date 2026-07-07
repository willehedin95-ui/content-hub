import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { safeError } from "@/lib/api-error";
import { slugify } from "@/lib/slugify";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Fetch source translation with workspace verification
  const { data: source, error: fetchErr } = await db
    .from("translations")
    .select("page_id, language, translated_html, seo_title, seo_description, slug, pages!inner(workspace_id)")
    .eq("id", id)
    .single();

  if (fetchErr || !source) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  // Verify workspace access through parent page
  const dupPages = source.pages as unknown as { workspace_id: string } | null;
  if (dupPages?.workspace_id && dupPages.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  if (!source.translated_html) {
    return NextResponse.json({ error: "Translation has no HTML content" }, { status: 400 });
  }

  // The duplicate must NOT inherit the source slug - publishing the variant
  // would silently overwrite the control's live page on the same CF path
  // (audit 2026-07-07, P2 slug). Suffix with -b (or -b2, -b3 … if taken).
  let duplicateSlug: string | null = null;
  if (source.slug) {
    const base = `${slugify(source.slug)}-b`;
    const candidates = [base, ...Array.from({ length: 8 }, (_, i) => `${base}${i + 2}`)];
    const { data: taken, error: takenErr } = await db
      .from("translations")
      .select("slug")
      .eq("language", source.language)
      .in("slug", candidates);
    if (takenErr) {
      return safeError(takenErr, "Failed to check for slug availability");
    }
    const takenSet = new Set((taken ?? []).map((t) => t.slug));
    duplicateSlug = candidates.find((c) => !takenSet.has(c)) ?? null;
    if (!duplicateSlug) {
      return NextResponse.json(
        { error: `Could not find a free variant slug based on "${source.slug}"` },
        { status: 409 }
      );
    }
  }

  // Create duplicate as variant "b"
  const { data: duplicate, error: insertErr } = await db
    .from("translations")
    .insert({
      page_id: source.page_id,
      language: source.language,
      variant: "b",
      translated_html: source.translated_html,
      seo_title: source.seo_title,
      seo_description: source.seo_description,
      slug: duplicateSlug,
      status: "draft",
    })
    .select("id, page_id, language")
    .single();

  if (insertErr || !duplicate) {
    return safeError(insertErr, "Failed to duplicate translation");
  }

  return NextResponse.json(duplicate, { status: 201 });
}
