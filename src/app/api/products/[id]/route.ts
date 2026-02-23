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
    .from("products")
    .select(
      "*, product_images(*), copywriting_guidelines(*), reference_pages(*)"
    )
    .eq("id", id)
    .single();

  if (error) {
    return safeError(error, "Failed to fetch product", 404);
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
  const allowed = [
    "name",
    "slug",
    "tagline",
    "description",
    "benefits",
    "usps",
    "claims",
    "certifications",
    "ingredients",
    "price_info",
    "target_audience",
    "competitor_keywords",
  ];

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (body[key] !== undefined) updateData[key] = body[key];
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("products")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to update product");
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

  const { error } = await db.from("products").delete().eq("id", id);
  if (error) {
    return safeError(error, "Failed to delete product");
  }

  return NextResponse.json({ success: true });
}
