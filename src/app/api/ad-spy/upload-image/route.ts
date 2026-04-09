import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { STORAGE_BUCKET } from "@/lib/constants";

const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const CONTENT_TYPE_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/**
 * GET: Return a signed upload URL so the client can upload an image directly
 * to Supabase Storage. Mirrors /api/ad-spy/upload-video but for images.
 *
 * Query params: ?filename=competitor.png&size=512000
 */
export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get("filename") || "image.png";
  const sizeStr = req.nextUrl.searchParams.get("size");
  const size = sizeStr ? parseInt(sizeStr, 10) : 0;

  const ext = filename.split(".").pop()?.toLowerCase() || "png";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: png, jpg, jpeg, gif, webp" },
      { status: 400 }
    );
  }

  if (size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum 20MB" },
      { status: 400 }
    );
  }

  const fileId = crypto.randomUUID();
  const storagePath = `image-uploads/${fileId}.${ext}`;
  const db = createServerSupabase();

  const { data: signedUrl, error: signError } = await db.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (signError || !signedUrl) {
    return NextResponse.json(
      { error: `Failed to create upload URL: ${signError?.message}` },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = db.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return NextResponse.json({
    signed_url: signedUrl.signedUrl,
    token: signedUrl.token,
    path: signedUrl.path,
    public_url: publicUrlData.publicUrl,
    content_type: CONTENT_TYPE_MAP[ext] || "image/png",
  });
}
