// POST /api/quiz/swipe-video
// Upload a screen-recording video; Gemini extracts the quiz / onboarding
// structure and we import it as a draft quiz. Returns same shape as
// /api/quiz/swipe.

import { NextRequest, NextResponse } from "next/server";
import { isValidMarket } from "@/lib/validation";
import { getWorkspaceId } from "@/lib/workspace";
import { importVideoQuiz, uploadVideoToStorage } from "@/lib/quiz-video-swipe";

// Gemini video processing + upload can take 2-5 minutes for long recordings.
// Vercel Hobby caps at 300s; keep under it.
export const maxDuration = 300;

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
]);

export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  // Parse multipart/form-data
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Expected multipart/form-data body" }, { status: 400 });
  }

  const file = formData.get("video");
  const market = formData.get("market");
  const name = formData.get("name");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "'video' field must be a file upload" }, { status: 400 });
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: `Video too large (${Math.round(file.size / 1024 / 1024)} MB). Max is ${MAX_VIDEO_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported video type: ${file.type}. Use mp4, mov, or webm.` },
      { status: 415 },
    );
  }
  if (typeof market !== "string" || !isValidMarket(market)) {
    return NextResponse.json({ error: "market must be one of: se, dk, no" }, { status: 400 });
  }

  try {
    // 1. Persist the video so Gemini can fetch it (its Files API wants a URL)
    const buffer = Buffer.from(await file.arrayBuffer());
    const { publicUrl, storagePath } = await uploadVideoToStorage(
      buffer,
      file.name,
      file.type,
    );

    // 2. Run extraction
    const result = await importVideoQuiz({
      videoPublicUrl: publicUrl,
      videoStoragePath: storagePath,
      workspaceId,
      market,
      name: typeof name === "string" && name.trim() ? name.trim() : undefined,
    });

    if (result.importedSteps === 0) {
      return NextResponse.json(
        { error: "Gemini did not find any quiz steps in the video." },
        { status: 422 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quiz/swipe-video] Error:", message);
    return NextResponse.json({ error: `Video import failed: ${message}` }, { status: 500 });
  }
}
