import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * GET /api/proxy-fetch?url=...
 *
 * Simple server-side proxy for fetching external URLs that would fail
 * client-side due to CORS (e.g. video files from competitor sites).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url parameter is required" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Remote server returned ${res.status}` },
        { status: res.status }
      );
    }

    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
        "Content-Length": res.headers.get("Content-Length") || "",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Fetch failed: ${msg}` }, { status: 502 });
  }
}
