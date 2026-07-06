import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { generateGenesisStaticImages } from "@/lib/genesis-images";
import { generateStaticImages } from "@/lib/generate-static-images";
import { STATIC_STYLES } from "@/lib/static-ad-prompt";
import type { StaticStyleId } from "@/lib/constants";

export const maxDuration = 800;

// POST /api/image-jobs/[id]/genesis-static — generate static ads via a Genesis image-format bot,
// or one of the hub's own built-in styles (botSlug "hub:<styleId>").
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const botSlug: string = body.botSlug || body.bot;
  if (!botSlug) return NextResponse.json({ error: "botSlug is required" }, { status: 400 });

  const workspaceId = await getWorkspaceId();
  const count = Math.min(Math.max(typeof body.count === "number" ? body.count : 3, 1), 5);
  try {
    // Own hub style: run the native brief pipeline, N briefs of the same style.
    if (botSlug.startsWith("hub:")) {
      const styleId = botSlug.slice(4);
      if (!STATIC_STYLES.some((s) => s.id === styleId)) {
        return NextResponse.json({ error: `Unknown style: ${styleId}` }, { status: 400 });
      }
      const result = await generateStaticImages({
        jobId: id,
        workspaceId,
        styles: Array(count).fill(styleId) as StaticStyleId[],
      });
      return NextResponse.json({
        generated: result.generated,
        failed: result.failed,
        batch: result.batch,
        source_images: result.sourceImages,
        errors: result.errors.length > 0 ? result.errors : undefined,
        cost_usd: result.costUsd,
      });
    }

    const result = await generateGenesisStaticImages({
      jobId: id,
      workspaceId,
      botSlug,
      count,
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
