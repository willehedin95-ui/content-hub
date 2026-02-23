import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID, validateImageFile } from "@/lib/validation";
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
    .from("product_images")
    .select("*")
    .eq("product_id", id)
    .order("sort_order", { ascending: true });

  if (error) {
    return safeError(error, "Failed to fetch images");
  }

  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const category = (formData.get("category") as string) || "other";
  const altText = formData.get("alt_text") as string | null;
  const description = formData.get("description") as string | null;

  if (!file) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const validation = validateImageFile(file);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }

  const db = createServerSupabase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `product-bank/${id}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await db.storage
    .from("translated-images")
    .upload(filename, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return safeError(uploadError, "Failed to upload image");
  }

  const {
    data: { publicUrl },
  } = db.storage.from("translated-images").getPublicUrl(filename);

  const { data, error } = await db
    .from("product_images")
    .insert({
      product_id: id,
      category,
      url: publicUrl,
      alt_text: altText,
      description,
    })
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to save image record");
  }

  return NextResponse.json(data, { status: 201 });
}
