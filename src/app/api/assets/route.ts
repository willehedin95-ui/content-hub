import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { validateMediaFile } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import type { AssetCategory, MediaType } from "@/types";
import { ASSET_CATEGORIES } from "@/types";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const category = req.nextUrl.searchParams.get("category");
  const mediaType = req.nextUrl.searchParams.get("media_type");
  const product = req.nextUrl.searchParams.get("product");
  const search = req.nextUrl.searchParams.get("search");

  let query = db.from("assets").select("*").order("created_at", { ascending: false });

  if (category && ASSET_CATEGORIES.includes(category as AssetCategory)) {
    query = query.eq("category", category);
  }
  if (mediaType && (mediaType === "image" || mediaType === "video")) {
    query = query.eq("media_type", mediaType);
  }
  if (product) {
    if (product === "general") {
      query = query.is("product", null);
    } else {
      query = query.eq("product", product);
    }
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,tags.cs.{${search}}`);
  }

  const { data, error } = await query;
  if (error) return safeError(error, "Failed to fetch assets");
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string) || "";
  const category = ((formData.get("category") as string) || "other") as AssetCategory;
  const product = (formData.get("product") as string) || null;
  const altText = formData.get("alt_text") as string | null;
  const description = formData.get("description") as string | null;
  const tagsRaw = formData.get("tags") as string | null;

  if (!file) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }
  if (!name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const validation = validateMediaFile(file);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const isVideo = file.type.startsWith("video/") || ["mp4", "mov", "webm"].includes(validation.ext);
  const mediaType: MediaType = isVideo ? "video" : "image";

  const db = createServerSupabase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `assets/${mediaType}/${category}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await db.storage
    .from("translated-images")
    .upload(filename, buffer, { contentType: file.type, upsert: false });

  if (uploadError) return safeError(uploadError, "Failed to upload file");

  const { data: { publicUrl } } = db.storage.from("translated-images").getPublicUrl(filename);

  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const { data, error } = await db
    .from("assets")
    .insert({
      name: name.trim(),
      category,
      media_type: mediaType,
      product: product || null,
      tags,
      url: publicUrl,
      alt_text: altText,
      description,
      file_size: file.size,
      source_url: null,
    })
    .select()
    .single();

  if (error) return safeError(error, "Failed to save asset");
  return NextResponse.json(data, { status: 201 });
}
