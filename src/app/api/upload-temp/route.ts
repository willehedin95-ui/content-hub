import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase";
import { STORAGE_BUCKET } from "@/lib/constants";

// POST /api/upload-temp — upload a file to temp storage, return public URL
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() ?? "png";
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
