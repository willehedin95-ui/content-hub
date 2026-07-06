import { NextRequest, NextResponse } from "next/server";
import { renderPageThumbnail } from "@/lib/page-screenshot";

export const maxDuration = 60;

// POST /api/pages/[id]/screenshot — (re)render the page thumbnail. Works for unpublished
// pages too (renders stored HTML directly when no published URL exists).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await renderPageThumbnail(id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.error.includes("No published") ? 404 : 500 });
  }
  return NextResponse.json(result);
}
