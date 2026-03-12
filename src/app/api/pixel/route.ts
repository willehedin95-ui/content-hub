import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceSettings } from "@/lib/workspace";

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

const META_API_BASE = "https://graph.facebook.com/v22.0";

function extractParams(url: URL) {
  return {
    visitorId: url.searchParams.get("vid"),
    eventType: url.searchParams.get("e") || "view",
    eventId: url.searchParams.get("eid") || null,
    fbclid: url.searchParams.get("fbclid") || null,
    fbp: url.searchParams.get("fbp") || null,
    fbc: url.searchParams.get("fbc") || null,
    pageSlug: url.searchParams.get("slug") || null,
    pageUrl: url.searchParams.get("url") || null,
    referrer: url.searchParams.get("ref") || null,
    clickUrl: url.searchParams.get("click") || null,
    landingDomain: url.searchParams.get("domain") || null,
    utmSource: url.searchParams.get("utm_source") || null,
    utmMedium: url.searchParams.get("utm_medium") || null,
    utmCampaign: url.searchParams.get("utm_campaign") || null,
    utmContent: url.searchParams.get("utm_content") || null,
    utmTerm: url.searchParams.get("utm_term") || null,
  };
}

/** Fire-and-forget: send CAPI PageView event to Meta with matching eventID for deduplication */
function sendCAPIPageView(params: {
  eventId: string;
  eventSourceUrl: string | null;
  fbp: string | null;
  fbc: string | null;
  ip: string | null;
  userAgent: string | null;
}) {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) return;

  getWorkspaceSettings().then((settings) => {
      const pixelId = settings.meta_pixel_id as string;
      if (!pixelId) return;

      const userData: Record<string, unknown> = {};
      if (params.fbp) userData.fbp = params.fbp;
      if (params.fbc) userData.fbc = params.fbc;
      if (params.ip) userData.client_ip_address = params.ip;
      if (params.userAgent) userData.client_user_agent = params.userAgent;

      const event = {
        event_name: "PageView",
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        action_source: "website",
        ...(params.eventSourceUrl
          ? { event_source_url: params.eventSourceUrl }
          : {}),
        user_data: userData,
        custom_data: {},
      };

      fetch(`${META_API_BASE}/${pixelId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [event], access_token: token }),
        signal: AbortSignal.timeout(10_000),
      }).catch((err) => {
        console.error(
          "CAPI PageView failed:",
          err instanceof Error ? err.message : err
        );
      });
    });
}

function logEvent(req: NextRequest) {
  const params = extractParams(req.nextUrl);

  if (!params.visitorId || !["view", "click"].includes(params.eventType))
    return;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    null;
  const userAgent = req.headers.get("user-agent") || null;
  const country =
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("cf-ipcountry") ||
    null;

  // Insert into pixel_events (fire-and-forget)
  const db = createServerSupabase();
  db.from("pixel_events")
    .insert({
      visitor_id: params.visitorId,
      event_type: params.eventType,
      fbclid: params.fbclid,
      fbp: params.fbp,
      fbc: params.fbc,
      utm_source: params.utmSource,
      utm_medium: params.utmMedium,
      utm_campaign: params.utmCampaign,
      utm_content: params.utmContent,
      utm_term: params.utmTerm,
      page_slug: params.pageSlug,
      page_url: params.pageUrl,
      referrer: params.referrer,
      landing_domain: params.landingDomain,
      ip_address: ip,
      user_agent: userAgent,
      country,
      click_url: params.clickUrl,
    })
    .then(({ error }) => {
      if (error) console.error("Failed to log pixel event:", error.message);
    });

  // Forward PageView events to Meta CAPI for deduplication (fire-and-forget)
  if (params.eventType === "view" && params.eventId) {
    sendCAPIPageView({
      eventId: params.eventId,
      eventSourceUrl: params.pageUrl,
      fbp: params.fbp,
      fbc: params.fbc,
      ip,
      userAgent,
    });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  logEvent(req);
  return new NextResponse(PIXEL, {
    headers: { "Content-Type": "image/gif", ...CORS_HEADERS },
  });
}

export async function POST(req: NextRequest) {
  logEvent(req);
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
