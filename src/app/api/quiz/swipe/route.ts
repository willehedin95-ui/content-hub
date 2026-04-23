// POST /api/quiz/swipe
// Kick off a quiz import from a competitor URL.
// Returns: { quizId, method, importedSteps, warnings }

import { NextRequest, NextResponse } from "next/server";
import { isAllowedUrl, isValidMarket } from "@/lib/validation";
import { getWorkspaceId } from "@/lib/workspace";
import { swipeQuiz } from "@/lib/quiz-swipe";

// Heavy I/O: fetch page, spin up puppeteer, upload images to Supabase.
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  // 1. Resolve workspace from cookie
  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  // 2. Parse body
  const body = await req.json().catch(() => null) as {
    url?: string;
    market?: string;
    name?: string;
  } | null;

  if (!body || typeof body.url !== "string" || typeof body.market !== "string") {
    return NextResponse.json({ error: "url and market are required" }, { status: 400 });
  }

  const { url, market, name } = body;

  // 3. Validate URL
  const urlCheck = isAllowedUrl(url);
  if (!urlCheck.valid) {
    return NextResponse.json({ error: urlCheck.reason }, { status: 400 });
  }

  // 4. Validate market
  if (!isValidMarket(market)) {
    return NextResponse.json({ error: "market must be one of: se, dk, no" }, { status: 400 });
  }

  // 5. Run the swiper
  try {
    const result = await swipeQuiz(url, workspaceId, market, name ?? undefined);

    if (result.importedSteps === 0) {
      return NextResponse.json(
        { error: "No quiz steps could be extracted from this URL." },
        { status: 422 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quiz/swipe] Error:", message);
    return NextResponse.json(
      { error: `Import failed: ${message}` },
      { status: 500 }
    );
  }
}
