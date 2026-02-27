import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

// PATCH /api/saved-ads/[id] — update bookmark, notes, brand name
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  // Only allow updating these fields
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if ("is_bookmarked" in body) updates.is_bookmarked = body.is_bookmarked;
  if ("user_notes" in body) updates.user_notes = body.user_notes;
  if ("brand_name" in body) updates.brand_name = body.brand_name;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  const { data, error } = await db
    .from("saved_ads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return safeError(error, "Failed to update saved ad");

  return NextResponse.json(data);
}

// DELETE /api/saved-ads/[id] — delete a saved ad
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { error } = await db
    .from("saved_ads")
    .delete()
    .eq("id", id);

  if (error) return safeError(error, "Failed to delete saved ad");

  return NextResponse.json({ ok: true });
}
