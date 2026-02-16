import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";

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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const testId = url.searchParams.get("t");
  const variant = url.searchParams.get("v");
  const event = url.searchParams.get("e");

  // Fire-and-forget: insert event, don't block the pixel response
  if (
    testId &&
    isValidUUID(testId) &&
    variant &&
    ["a", "b"].includes(variant) &&
    event &&
    ["view", "click"].includes(event)
  ) {
    const db = createServerSupabase();
    db.from("ab_events")
      .insert({ test_id: testId, variant, event })
      .then(({ error }) => {
        if (error) console.error("Failed to log AB event:", error.message);
      });
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      ...CORS_HEADERS,
    },
  });
}

// sendBeacon uses POST
export async function POST(req: NextRequest) {
  const url = req.nextUrl;
  const testId = url.searchParams.get("t");
  const variant = url.searchParams.get("v");
  const event = url.searchParams.get("e");

  if (
    testId &&
    isValidUUID(testId) &&
    variant &&
    ["a", "b"].includes(variant) &&
    event &&
    ["view", "click"].includes(event)
  ) {
    const db = createServerSupabase();
    db.from("ab_events")
      .insert({ test_id: testId, variant, event })
      .then(({ error }) => {
        if (error) console.error("Failed to log AB event:", error.message);
      });
  }

  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
