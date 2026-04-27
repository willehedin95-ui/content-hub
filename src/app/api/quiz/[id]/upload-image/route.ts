// POST /api/quiz/[id]/upload-image
// multipart/form-data { image: File }
// Saves to Supabase Storage at translated-images/quiz-assets/{quizId}/uploaded/{uuid}.{ext}
// Returns { url } - the public URL.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
// SVG intentionally excluded: SVGs can carry inline <script> and our bucket
// is publicly readable, so a crafted upload could phish via direct URL.
// Stick to raster formats; if SVG is needed later, sanitize via DOMPurify
// server-side before upload.
const ALLOWED = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
]);
const BUCKET = "translated-images";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  // Verify the quiz belongs to this workspace
  const db = createServerSupabase();
  const { data: quiz, error: qErr } = await db
    .from("quizzes")
    .select("id, workspace_id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (qErr || !quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "'image' field is required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image too large (${Math.round(file.size / 1024 / 1024)} MB; max 10 MB)` },
      { status: 413 },
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${file.type}` },
      { status: 415 },
    );
  }

  const ext = file.type.split("/")[1] || "bin";
  const path = `quiz-assets/${id}/uploaded/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) {
    return NextResponse.json(
      { error: `Upload failed: ${upErr.message}` },
      { status: 500 },
    );
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
