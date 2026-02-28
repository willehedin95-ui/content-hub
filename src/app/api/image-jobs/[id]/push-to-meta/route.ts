import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { pushConceptToMeta } from "@/lib/meta-push";

export const maxDuration = 300;

/**
 * Push a concept (image_job) to Meta Ads — one ad set per target language/market.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const { results, scheduled_time } = await pushConceptToMeta(jobId);
    return NextResponse.json({ results, scheduled_time });
  } catch (err) {
    console.error("[Push to Meta] Error:", err);
    const message = err instanceof Error ? err.message : "Push failed";
    const status =
      message === "Concept not found" ? 404 :
      message === "A push is already in progress for this concept" ? 409 :
      message.includes("is required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
