import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { generateGenesisStaticImages } from "@/lib/genesis-images";

export const maxDuration = 800;

// POST /api/image-jobs/[id]/genesis-static — generate static ads via a Genesis image-format bot.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const botSlug: string = body.botSlug || body.bot;
  if (!botSlug) return NextResponse.json({ error: "botSlug is required" }, { status: 400 });

  const workspaceId = await getWorkspaceId();
  try {
    const result = await generateGenesisStaticImages({
      jobId: id,
      workspaceId,
      botSlug,
      count: typeof body.count === "number" ? body.count : 3,
    });
    return NextResponse.json({
      generated: result.generated,
      failed: result.failed,
      batch: result.batch,
      source_images: result.sourceImages,
      errors: result.errors.length > 0 ? result.errors : undefined,
      cost_usd: result.costUsd,
    });
  } catch (err) {
    return safeError(err, "Failed to generate Genesis static ads");
  }
}
