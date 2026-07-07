import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; refId: string }> }
) {
  const { id: productId, refId } = await params;
  if (!isValidUUID(refId)) {
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
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.url !== undefined) updateData.url = body.url;
  if (body.content !== undefined) updateData.content = body.content;
  if (body.notes !== undefined) updateData.notes = body.notes;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Ownership check: the row must belong to this product OR be a global
  // reference (product_id IS NULL - listed under every product, so an
  // unconditional product_id bind would no-op/500 on those). This still
  // blocks mutating another product's rows through this route.
  const { data: existing, error: existingErr } = await db
    .from("reference_pages")
    .select("id, product_id")
    .eq("id", refId)
    .single();
  if (existingErr || !existing || (existing.product_id !== null && existing.product_id !== productId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let updateQuery = db
    .from("reference_pages")
    .update(updateData)
    .eq("id", refId);
  if (existing.product_id !== null) {
    updateQuery = updateQuery.eq("product_id", productId);
  }
  const { data, error } = await updateQuery.select().single();

  if (error) {
    return safeError(error, "Failed to update reference page");
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; refId: string }> }
) {
  const { id: productId, refId } = await params;
  if (!isValidUUID(refId)) {
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

  // Ownership check: allow rows belonging to this product OR global rows
  // (product_id IS NULL) - see PATCH above for why.
  const { data: existing, error: existingErr } = await db
    .from("reference_pages")
    .select("id, product_id")
    .eq("id", refId)
    .single();
  if (existingErr || !existing || (existing.product_id !== null && existing.product_id !== productId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let deleteQuery = db
    .from("reference_pages")
    .delete()
    .eq("id", refId);
  if (existing.product_id !== null) {
    deleteQuery = deleteQuery.eq("product_id", productId);
  }
  const { error } = await deleteQuery;

  if (error) {
    return safeError(error, "Failed to delete reference page");
  }

  return NextResponse.json({ success: true });
}
