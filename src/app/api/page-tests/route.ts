import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("page_tests")
    .select(`
      *,
      image_jobs!inner(id, name, product, concept_number, source_images(original_url)),
      page_a:pages!page_tests_page_a_id_fkey(id, name, slug, thumbnail_url),
      page_b:pages!page_tests_page_b_id_fkey(id, name, slug, thumbnail_url),
      page_test_adsets(id, variant, meta_adset_id, language, country)
    `)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return safeError(error, "Failed to fetch page tests");
  }

  return NextResponse.json({ tests: data ?? [] });
}
