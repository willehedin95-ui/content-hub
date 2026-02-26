import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

// GET /api/spy/brands/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("spy_brands")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return safeError(error ?? new Error("Not found"), "Brand not found", 404);
  return NextResponse.json({ data });
}

// PATCH /api/spy/brands/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const allowed = ["name", "ad_library_url", "category", "notes", "is_active", "scrape_countries"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Re-extract page ID if URL changed
  if (body.ad_library_url) {
    const m = body.ad_library_url.match(/view_all_page_id=(\d+)/);
    updates.meta_page_id = m?.[1] ?? null;
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("spy_brands")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return safeError(error, "Failed to update brand");
  return NextResponse.json({ data });
}

// DELETE /api/spy/brands/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const { error } = await db.from("spy_brands").delete().eq("id", id);
  if (error) return safeError(error, "Failed to delete brand");
  return NextResponse.json({ success: true });
}
