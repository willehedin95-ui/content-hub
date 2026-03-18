import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { safeError } from "@/lib/api-error";

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
      slug: source.slug,
      status: "draft",
    })
    .select("id, page_id, language")
    .single();

  if (insertErr || !duplicate) {
    return safeError(insertErr, "Failed to duplicate translation");
  }

  return NextResponse.json(duplicate, { status: 201 });
}
