import { NextRequest, NextResponse } from "next/server";
import { trackedCronRoute } from "@/lib/cron-tracker";
import { publishNextDue } from "@/lib/social-publish";

export const maxDuration = 300;

/**
 * Publishes the next APPROVED social post that is due (one per run), to
 * Instagram and Facebook. Runs every 15 minutes.
 *
 * Always requires CRON_SECRET - there is deliberately no ?manual=true bypass
 * like some other cron routes have: /api/cron is public in the middleware,
 * and a publish route must not be triggerable by anyone with the URL.
 */
async function handleCron(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await publishNextDue();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = trackedCronRoute("social-publish", handleCron);
