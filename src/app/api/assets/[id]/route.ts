import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

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
    .from("assets")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return safeError(error, "Asset not found");
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.category !== undefined) updates.category = body.category;
  if (body.alt_text !== undefined) updates.alt_text = body.alt_text;
  if (body.description !== undefined) updates.description = body.description;
  if (body.tags !== undefined) updates.tags = body.tags;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("assets")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to update asset");
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Get the asset URL to delete from storage
  const { data: asset } = await db
    .from("assets")
    .select("url")
    .eq("id", id)
    .single();

  const { error } = await db.from("assets").delete().eq("id", id);

  if (error) {
    return safeError(error, "Failed to delete asset");
  }

  // Best-effort storage cleanup
  if (asset?.url) {
    const path = asset.url.split("/translated-images/")[1];
    if (path) {
      await db.storage.from("translated-images").remove([path]).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
