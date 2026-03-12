import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_VIDEO_EXTENSIONS,
} from "@/lib/validation";
import type { AssetCategory, MediaType } from "@/types";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { url, name, category, product } = body as {
    url?: string;
    name?: string;
    category?: AssetCategory;
    product?: string;
  };

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Fetch the file
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "ContentHub/1.0" },
      redirect: "follow",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: `Failed to fetch URL: ${msg}` }, { status: 400 });
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: `URL returned ${response.status}` },
      { status: 400 }
    );
  }

  // Validate content type
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "";
  let ext = ALLOWED_CONTENT_TYPES[contentType];

  // Fallback: try extension from URL
  if (!ext) {
    const urlExt = parsedUrl.pathname.split(".").pop()?.toLowerCase() || "";
    if (ALLOWED_IMAGE_EXTENSIONS.has(urlExt) || ALLOWED_VIDEO_EXTENSIONS.has(urlExt)) {
      ext = urlExt;
    }
  }

  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported file type: ${contentType}` },
      { status: 400 }
    );
  }

  const isVideo = ALLOWED_VIDEO_EXTENSIONS.has(ext);
  const mediaType: MediaType = isVideo ? "video" : "image";

  // Download file
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 200 MB)" }, { status: 413 });
  }

  // Derive filename
  const assetName = name?.trim() || parsedUrl.pathname.split("/").pop()?.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") || "imported-asset";
  const assetCategory: AssetCategory = category || "other";

  // Upload to Supabase Storage
  const db = createServerSupabase();
  const storagePath = `assets/${mediaType}/${assetCategory}/${Date.now()}-imported.${ext}`;

  const { error: uploadError } = await db.storage
    .from("translated-images")
    .upload(storagePath, buffer, {
      contentType: contentType || `${mediaType}/${ext}`,
      upsert: false,
    });

  if (uploadError) return safeError(uploadError, "Failed to store file");

  const { data: { publicUrl } } = db.storage.from("translated-images").getPublicUrl(storagePath);

  // Create asset record
  const workspaceId = await getWorkspaceId();
  const { data, error } = await db
    .from("assets")
    .insert({
      name: assetName,
      category: assetCategory,
      media_type: mediaType,
      product: product || null,
      tags: [],
      url: publicUrl,
      file_size: buffer.length,
      source_url: url,
      workspace_id: workspaceId,
    })
    .select()
    .single();

  if (error) return safeError(error, "Failed to save asset");
  return NextResponse.json(data, { status: 201 });
}
