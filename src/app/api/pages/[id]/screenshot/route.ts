import { NextRequest, NextResponse } from "next/server";
import { renderPageThumbnail } from "@/lib/page-screenshot";
import { isValidUUID } from "@/lib/validation";

export const maxDuration = 60;

// POST /api/pages/[id]/screenshot - (re)render the page thumbnail. Works for unpublished
// pages too (renders stored HTML directly when no published URL exists).
// NOTE: intentionally NOT workspace-scoped - the publish flow triggers this
// server-side (fire-and-forget fetch without the workspace cookie), so a
// cookie check would break thumbnails for non-default workspaces. It only
// re-renders the page's own thumbnail; UUID validation limits abuse.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const result = await renderPageThumbnail(id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.error.includes("No published") ? 404 : 500 });
  }
  return NextResponse.json(result);
}
