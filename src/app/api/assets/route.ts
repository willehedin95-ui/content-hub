import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { validateImageFile } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import type { AssetCategory } from "@/types";

const VALID_CATEGORIES: AssetCategory[] = ["logo", "icon", "badge", "background", "other"];

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const category = req.nextUrl.searchParams.get("category");

  let query = db.from("assets").select("*").order("created_at", { ascending: false });

  if (category && VALID_CATEGORIES.includes(category as AssetCategory)) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return safeError(error, "Failed to fetch assets");
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string) || "";
  const category = ((formData.get("category") as string) || "other") as AssetCategory;
  const altText = formData.get("alt_text") as string | null;
  const description = formData.get("description") as string | null;
  const tagsRaw = formData.get("tags") as string | null;

  if (!file) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  if (!name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
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
  const filename = `assets/${category}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await db.storage
    .from("translated-images")
    .upload(filename, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return safeError(uploadError, "Failed to upload file");
  }

  const {
    data: { publicUrl },
  } = db.storage.from("translated-images").getPublicUrl(filename);

  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const { data, error } = await db
    .from("assets")
    .insert({
      name: name.trim(),
      category,
      tags,
      url: publicUrl,
      alt_text: altText,
      description,
    })
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to save asset");
  }

  return NextResponse.json(data, { status: 201 });
}
