import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

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

function extractParams(url: URL) {
  return {
    visitorId: url.searchParams.get("vid"),
    eventType: url.searchParams.get("e") || "view",
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

function logEvent(req: NextRequest) {
  const params = extractParams(req.nextUrl);

  if (!params.visitorId || !["view", "click"].includes(params.eventType)) return;

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
