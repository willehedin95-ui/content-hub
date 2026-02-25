import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

// GET /api/spy/ads/[id]
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
    .from("spy_ads")
    .select("*, brand:spy_brands(id, name, category)")
    .eq("id", id)
    .single();

  if (error || !data) return safeError(error ?? new Error("Not found"), "Ad not found", 404);
  return NextResponse.json({ data });
}

// PATCH /api/spy/ads/[id] — update bookmark, notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const allowed = ["is_bookmarked", "user_notes"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("spy_ads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return safeError(error, "Failed to update ad");
  return NextResponse.json({ data });
}
