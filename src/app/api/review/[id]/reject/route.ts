import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

// Rejects a pending_review article. Marks the translation as rejected (not
// deleted so you can see the history later) and frees the content_plan row
// so the autopilot can try again later with a different article, or you can
// manually trigger a regen.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: trans } = await db
    .from("translations")
    .select("id, slug, status, pages!inner(id, workspace_id, source_language)")
    .eq("id", id)
    .single();
  if (!trans) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (trans.status !== "pending_review") {
    return NextResponse.json(
      { error: `Not pending_review (status=${trans.status})` },
      { status: 400 }
    );
  }

  const page = trans.pages as unknown as { id: string; workspace_id: string; source_language: string };

  // Mark translation as rejected (keep data for audit)
  await db
    .from("translations")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", id);

  // Free the plan row so autopilot can retry it later with a regen
  await db
    .from("blog_content_plan")
    .update({
      status: "planned",
      page_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", page.workspace_id)
    .eq("language", page.source_language)
    .eq("slug", trans.slug);

  return NextResponse.json({ ok: true });
}
