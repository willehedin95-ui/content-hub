import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { STORAGE_BUCKET } from "@/lib/constants";

// Allowed image types for temp uploads
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// POST /api/upload-temp — upload a file to temp storage, return public URL
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: "Invalid file type. Allowed: png, jpg, jpeg, gif, webp" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum 20MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileId = crypto.randomUUID();
  const filePath = `temp/${fileId}.${ext}`;

  const db = createServerSupabase();
  const { error } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json(
      { error: `Upload failed: ${error.message}` },
      { status: 500 }
    );
  }

  const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  return NextResponse.json({ url: data.publicUrl });
}
