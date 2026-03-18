import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; guidelineId: string }> }
) {
  const { id: productId, guidelineId } = await params;
  if (!isValidUUID(guidelineId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Verify product belongs to current workspace
  const { data: product } = await db
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.content !== undefined) updateData.content = body.content;
  if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;

  const { data, error } = await db
    .from("copywriting_guidelines")
    .update(updateData)
    .eq("id", guidelineId)
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to update guideline");
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; guidelineId: string }> }
) {
  const { id: productId, guidelineId } = await params;
  if (!isValidUUID(guidelineId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Verify product belongs to current workspace
  const { data: product } = await db
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await db
    .from("copywriting_guidelines")
    .delete()
    .eq("id", guidelineId);

  if (error) {
    return safeError(error, "Failed to delete guideline");
  }

  return NextResponse.json({ success: true });
}
