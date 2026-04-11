import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceId } from "@/lib/workspace";
import { STATIC_STYLES } from "@/lib/static-ad-prompt";
import type { StaticStyleId } from "@/lib/constants";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { generateStaticImages } from "@/lib/generate-static-images";

export const maxDuration = 800;

// POST /api/image-jobs/[id]/generate-static — Generate diverse static ad images
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const validStyleIds = new Set<string>(STATIC_STYLES.map((s) => s.id));
  const requestedStyles: StaticStyleId[] | undefined = Array.isArray(body.styles)
    ? body.styles.filter((s: string) => validStyleIds.has(s)) as StaticStyleId[]
    : undefined;

  const workspaceId = await getWorkspaceId();

  try {
    const result = await generateStaticImages({
      jobId: id,
      workspaceId,
      count: body.count,
      styles: requestedStyles,
      batch: typeof body.batch === "number" ? body.batch : undefined,
      batchLabel: typeof body.batch_label === "string" ? body.batch_label : undefined,
      iterationContext: body.iteration_context as Record<string, unknown> | undefined,
      targetMarket: typeof body.target_market === "string" ? body.target_market : undefined,
      segmentId: body.segment_id,
    });

    return NextResponse.json({
      generated: result.generated,
      failed: result.failed,
      batch: result.batch,
      batch_label: result.batchLabel,
      source_images: result.sourceImages,
      errors: result.errors.length > 0 ? result.errors : undefined,
      cost_usd: result.costUsd,
    });
  } catch (err) {
    return safeError(err, "Failed to generate images");
  }
}
