import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { STORAGE_BUCKET } from "@/lib/constants";

const ALLOWED_EXTENSIONS = new Set(["mp4", "mov", "webm", "avi"]);
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/**
 * GET: Return a signed upload URL so the client can upload directly to
 * Supabase Storage (bypasses Vercel's 4.5MB serverless body limit).
 *
 * Query params: ?filename=video.mp4&size=72900000
 */
export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get("filename") || "video.mp4";
  const sizeStr = req.nextUrl.searchParams.get("size");
  const size = sizeStr ? parseInt(sizeStr, 10) : 0;

  const ext = filename.split(".").pop()?.toLowerCase() || "mp4";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: mp4, mov, webm, avi" },
      { status: 400 }
    );
  }

  if (size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum 500MB" },
      { status: 400 }
    );
  }

  const fileId = crypto.randomUUID();
  const storagePath = `video-uploads/${fileId}.${ext}`;
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
    content_type: ext === "mov" ? "video/quicktime" : `video/${ext}`,
  });
}
