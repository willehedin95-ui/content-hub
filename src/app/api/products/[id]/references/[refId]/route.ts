import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; refId: string }> }
) {
  const { refId } = await params;
  if (!isValidUUID(refId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.url !== undefined) updateData.url = body.url;
  if (body.content !== undefined) updateData.content = body.content;
  if (body.notes !== undefined) updateData.notes = body.notes;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("reference_pages")
    .update(updateData)
    .eq("id", refId)
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to update reference page");
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; refId: string }> }
) {
  const { refId } = await params;
  if (!isValidUUID(refId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  const { error } = await db
    .from("reference_pages")
    .delete()
    .eq("id", refId);

  if (error) {
    return safeError(error, "Failed to delete reference page");
  }

  return NextResponse.json({ success: true });
}
