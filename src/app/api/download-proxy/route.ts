import { NextRequest, NextResponse } from "next/server";

// Streams a whitelisted external URL back to the browser with a
// Content-Disposition: attachment header. This is the only reliable way to
// trigger a "real download" on a cross-origin URL - the HTML <a download>
// attribute is silently ignored by browsers when href is cross-origin.
//
// Whitelisted hosts only, to prevent SSRF.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_HOSTS = new Set<string>([
  "tempfile.aiquickdraw.com", // Kie AI temp file CDN (generated images)
  "fbpefeqqqfrcmfmjmeij.supabase.co", // our Supabase Storage
]);

function sanitizeFilename(name: string): string {
  // Strip path separators and control chars; cap length for header safety.
  return name.replace(/[\\/\r\n"]/g, "_").slice(0, 200) || "download";
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename");

  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only https URLs allowed" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json(
      { error: `Host ${parsed.hostname} not whitelisted` },
      { status: 403 }
    );
  }

  const upstream = await fetch(parsed.toString());
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Upstream returned ${upstream.status}` },
      { status: 502 }
    );
  }

  const safeFilename = sanitizeFilename(filename ?? "download");
  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "no-store",
    },
  });
}
