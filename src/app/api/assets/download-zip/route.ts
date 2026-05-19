import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createServerSupabase } from "@/lib/supabase-admin";

// Bulk-download: takes an array of asset ids, fetches each asset's url
// server-side, packs them into a single ZIP, returns as attachment. Used by
// the Assets grid's multi-select toolbar.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_ASSETS_PER_ZIP = 100;

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "asset";
}

function inferExtension(url: string, mediaType: string | null | undefined): string {
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
  if (match && match[1].length <= 5) return match[1].toLowerCase();
  if (mediaType === "video") return "mp4";
  return "png";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.asset_ids) ? body.asset_ids : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "asset_ids array required" },
      { status: 400 },
    );
  }
  if (ids.length > MAX_ASSETS_PER_ZIP) {
    return NextResponse.json(
      { error: `Max ${MAX_ASSETS_PER_ZIP} assets per zip (got ${ids.length})` },
      { status: 400 },
    );
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("assets")
    .select("id, name, url, media_type")
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "No assets found for given ids" }, { status: 404 });
  }

  const zip = new JSZip();
  const usedFilenames = new Set<string>();
  const failed: { id: string; reason: string }[] = [];

  await Promise.all(
    data.map(async (asset, idx) => {
      try {
        const upstream = await fetch(asset.url);
        if (!upstream.ok) {
          failed.push({ id: asset.id, reason: `upstream ${upstream.status}` });
          return;
        }
        const buf = await upstream.arrayBuffer();
        const ext = inferExtension(asset.url, asset.media_type);
        const base = sanitize(asset.name || `asset-${idx + 1}`);
        let filename = `${base}.${ext}`;
        let counter = 1;
        while (usedFilenames.has(filename)) {
          filename = `${base}-${counter}.${ext}`;
          counter += 1;
        }
        usedFilenames.add(filename);
        zip.file(filename, buf);
      } catch (err) {
        failed.push({
          id: asset.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  if (usedFilenames.size === 0) {
    return NextResponse.json(
      { error: "All asset fetches failed", failed },
      { status: 502 },
    );
  }

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const today = new Date().toISOString().slice(0, 10);
  const zipName = `assets-${today}-${usedFilenames.size}.zip`;

  // Note: failed assets are silently omitted from the zip. The X-Failed-Count
  // header lets the client surface a warning if any uploads were skipped.
  return new NextResponse(zipBlob, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "no-store",
      ...(failed.length > 0
        ? { "X-Failed-Count": String(failed.length) }
        : {}),
    },
  });
}
