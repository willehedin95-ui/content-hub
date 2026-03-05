import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { pushVideoToMeta } from "@/lib/meta-video-push";

export const maxDuration = 300;

/**
 * Push a video job's completed translations to Meta Ads.
 * Body: { ad_set_id: string, languages?: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  let body: { ad_set_id?: string; languages?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const adSetId = body.ad_set_id;
  if (!adSetId || typeof adSetId !== "string") {
    return NextResponse.json(
      { error: "ad_set_id is required" },
      { status: 400 }
    );
  }

  try {
    const results = await pushVideoToMeta(jobId, adSetId, {
      languages: body.languages,
    });
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[Video Push to Meta] Error:", err);
    const message = err instanceof Error ? err.message : "Push failed";
    const status =
      message === "Video job not found"
        ? 404
        : message.includes("is required")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
