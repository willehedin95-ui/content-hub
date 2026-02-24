import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Public endpoint called by landing pages to check if the visitor's IP
 * is in the exclusion list. Returns { optout: true/false }.
 * Supports CORS for cross-origin requests from landing page domains.
 */
export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "";

  if (!ip) {
    return corsResponse(req, { optout: false });
  }

  const db = createServerSupabase();
  const { data: settingsRow } = await db
    .from("app_settings")
    .select("settings")
    .limit(1)
    .single();

  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const excludedIps = (settings.excluded_ips ?? []) as string[];

  return corsResponse(req, { optout: excludedIps.includes(ip) });
}

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req, null, 204);
}

function corsResponse(req: NextRequest, body: unknown, status = 200) {
  const origin = req.headers.get("origin") || "*";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
  };

  if (status === 204) {
    return new NextResponse(null, { status, headers });
  }
  return NextResponse.json(body, { status, headers });
}
