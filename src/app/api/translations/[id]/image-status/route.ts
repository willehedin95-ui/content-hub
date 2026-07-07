import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

/**
 * Lightweight polling endpoint for background image translation progress.
 * Returns { image_status, images_done, images_total, image_error }.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid translation ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const { data, error } = await db
    .from("translations")
    .select("image_status, images_done, images_total, error_message, pages!inner(workspace_id)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  // Workspace scoping via pages join (audit 2026-07-07, P3)
  const statusPages = data.pages as unknown as { workspace_id?: string } | null;
  if (statusPages?.workspace_id && statusPages.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  return NextResponse.json({
    image_status: data.image_status,
    images_done: data.images_done ?? 0,
    images_total: data.images_total ?? 0,
    // Failure summary written by the batch drain (e.g. "3 of 8 images failed")
    image_error: data.image_status === "error" ? data.error_message || null : null,
  });
}
