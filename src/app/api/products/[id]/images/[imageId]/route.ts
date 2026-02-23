import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { id, imageId } = await params;
  if (!isValidUUID(id) || !isValidUUID(imageId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  // Get image URL to delete from storage
  const { data: image } = await db
    .from("product_images")
    .select("url")
    .eq("id", imageId)
    .eq("product_id", id)
    .single();

  if (image?.url) {
    // Extract storage path from public URL
    const match = image.url.match(/translated-images\/(.+)$/);
    if (match) {
      await db.storage.from("translated-images").remove([match[1]]);
    }
  }

  const { error } = await db
    .from("product_images")
    .delete()
    .eq("id", imageId)
    .eq("product_id", id);

  if (error) {
    return safeError(error, "Failed to delete image");
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { id, imageId } = await params;
  if (!isValidUUID(id) || !isValidUUID(imageId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const updateData: Record<string, unknown> = {};
  if (body.category !== undefined) updateData.category = body.category;
  if (body.alt_text !== undefined) updateData.alt_text = body.alt_text;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("product_images")
    .update(updateData)
    .eq("id", imageId)
    .eq("product_id", id)
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to update image");
  }

  return NextResponse.json(data);
}
