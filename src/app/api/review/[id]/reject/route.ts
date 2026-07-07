import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

// Rejects a pending_review article. Deletes the generated page + translation
// rows (BL4: leaving them behind caused slug duplicates on regen, and the
// leftover rows matched the orphan-resume query) and frees the content_plan
// row so the autopilot can regenerate later.
//
// If deletion fails (unexpected FK), we fall back to a terminal "rejected"
// status — the orphan-resume filter (D1) explicitly excludes it, so it can
// never be auto-published.

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

  // Free the plan row FIRST (and null its page_id) so a page delete can't
  // trip over a blog_content_plan → pages reference.
  const { error: planErr } = await db
    .from("blog_content_plan")
    .update({
      status: "planned",
      page_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", page.workspace_id)
    .eq("language", page.source_language)
    .eq("slug", trans.slug);
  if (planErr) {
    console.error("[review-reject] Failed to reset plan row:", planErr.message);
  }

  // Delete the translation, then the page (translation references the page).
  const { error: delTransErr } = await db.from("translations").delete().eq("id", id);
  if (delTransErr) {
    console.error("[review-reject] Failed to delete translation:", delTransErr.message);
    // Fallback: terminal status that the D1 orphan-resume filter excludes
    const { error: markErr } = await db
      .from("translations")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (markErr) {
      console.error("[review-reject] Fallback status update also failed:", markErr.message);
      return NextResponse.json(
        { error: `Reject failed: ${delTransErr.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, mode: "marked_rejected" });
  }

  // Only delete the page when no other translations still reference it
  // (blog pages are 1:1 with their translation, but guard anyway).
  const { count: remaining, error: cntErr } = await db
    .from("translations")
    .select("id", { count: "exact", head: true })
    .eq("page_id", page.id);
  if (cntErr) {
    console.error("[review-reject] Failed to count sibling translations:", cntErr.message);
  } else if ((remaining ?? 0) === 0) {
    const { error: delPageErr } = await db.from("pages").delete().eq("id", page.id);
    if (delPageErr) {
      console.error("[review-reject] Failed to delete page:", delPageErr.message);
    }
  }

  return NextResponse.json({ ok: true, mode: "deleted" });
}
