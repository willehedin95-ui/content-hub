import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  const { segmentId } = await params;
  if (!isValidUUID(segmentId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.core_desire !== undefined) updateData.core_desire = body.core_desire;
  if (body.core_constraints !== undefined) updateData.core_constraints = body.core_constraints;
  if (body.demographics !== undefined) updateData.demographics = body.demographics;
  if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;

  const db = createServerSupabase();
  const { data, error } = await db
    .from("product_segments")
    .update(updateData)
    .eq("id", segmentId)
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to update segment");
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  const { segmentId } = await params;
  if (!isValidUUID(segmentId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  const { error } = await db
    .from("product_segments")
    .delete()
    .eq("id", segmentId);

  if (error) {
    return safeError(error, "Failed to delete segment");
  }

  return NextResponse.json({ success: true });
}
