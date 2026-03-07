import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { pushVideoToMeta } from "@/lib/meta-video-push";

export const maxDuration = 300;

/**
 * Push a video job's completed translations to Meta Ads.
 * Body: { markets?: string[] }
 *
 * Uses campaign mappings (format='video') to auto-create ad sets per market.
 * No longer requires a hardcoded adSetId.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  let body: { markets?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — defaults to all target markets
  }

  try {
    const { results } = await pushVideoToMeta(jobId, {
      markets: body.markets,
    });
    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[Video Push to Meta] Error:", err);
    const message = err instanceof Error ? err.message : "Push failed";
    const status =
      message === "Video job not found"
        ? 404
        : message === "A push is already in progress for this video concept"
          ? 409
          : message.includes("is required")
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
