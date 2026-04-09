import { NextResponse } from "next/server";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual trigger for the deliverability sync cron.
 * Calls the cron route with the ?manual=true param so it bypasses the
 * CRON_SECRET check, and runs it inline (not background) so the UI
 * can show the completion result.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("host");
  const proto = url.protocol;
  const cronUrl = `${proto}//${host}/api/cron/deliverability-sync?manual=true`;

  try {
    const res = await fetch(cronUrl, {
      method: "GET",
      signal: AbortSignal.timeout(55_000),
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    // If the sync takes > 55s, fall back to fire-and-forget via after()
    after(async () => {
      try {
        await fetch(cronUrl, { method: "GET" });
      } catch {
        // swallow
      }
    });
    return NextResponse.json({
      ok: true,
      queued: true,
      note: `Sync started in background: ${err instanceof Error ? err.message : "timeout"}`,
    });
  }
}
