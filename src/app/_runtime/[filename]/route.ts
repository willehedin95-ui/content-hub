// GET /_runtime/[filename]
//
// Serves the compiled quiz-runtime JS bundle from runtime/quiz-runtime/dist/
// to the editor preview iframe (`/quizzes/[id]/preview` -> renders HTML
// with `<script src="/_runtime/quiz-runtime.{hash}.js">`). Without this
// route the preview iframe got 404 on the bundle and stayed blank.
//
// Public route (no auth) since preview pages embed it as a script tag.
// Only serves files matching the quiz-runtime pattern, never arbitrary
// filesystem reads.

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const BUNDLE_DIR = join(process.cwd(), "runtime", "quiz-runtime", "dist");
// Match the file naming Vite produces: quiz-runtime.<hash>.js
const ALLOWED_PATTERN = /^quiz-runtime\.[A-Za-z0-9_-]+\.js$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (!ALLOWED_PATTERN.test(filename)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const path = join(BUNDLE_DIR, filename);
  if (!existsSync(path)) {
    return new NextResponse("Bundle not found", { status: 404 });
  }

  let contents: Buffer;
  try {
    contents = readFileSync(path);
  } catch {
    return new NextResponse("Failed to read bundle", { status: 500 });
  }

  return new NextResponse(contents as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Hash-named -> immutable cache for a year
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
