// Shared IP block check for quiz tracking endpoints. Used by session +
// events to skip DB writes for internal/test traffic without breaking the
// runtime's API contract (we still return a 200 with a fake-looking shape so
// the runtime continues working normally - the user just doesn't get tracked).
//
// Configure via env var BLOCKED_TRACKING_IPS=ip1,ip2,ip3 (comma-separated).
// Set on Vercel for production + .env.local for dev.

import type { NextRequest } from "next/server";

const PARSED_BLOCKED_IPS: Set<string> = new Set(
  (process.env.BLOCKED_TRACKING_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export function getRequestIP(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "";
  return req.headers.get("x-real-ip") ?? "";
}

export function isBlockedIP(req: NextRequest): boolean {
  if (PARSED_BLOCKED_IPS.size === 0) return false;
  const ip = getRequestIP(req);
  return ip !== "" && PARSED_BLOCKED_IPS.has(ip);
}
