import { NextResponse } from "next/server";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import { processOneQueueItem } from "@/lib/swipe-queue-worker";

export const maxDuration = 800;

export async function POST() {
  const workspaceId = await getWorkspaceId();
  const settings = await getWorkspaceSettings();
  const productSlug = (settings as Record<string, unknown>).default_product as string;
  if (!productSlug) {
    return NextResponse.json(
      { error: "No default_product configured in workspace settings" },
      { status: 400 },
    );
  }

  const result = await processOneQueueItem(workspaceId, productSlug);

  if (result.status === "idle") {
    return NextResponse.json({ ok: true, done: true });
  }
  if (result.status === "skipped") {
    return NextResponse.json({ ok: true, skipped: true, reason: result.reason });
  }
  if (result.status === "error") {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    jobId: result.jobId,
    conceptName: result.conceptName,
    conceptNumber: result.conceptNumber,
  });
}
