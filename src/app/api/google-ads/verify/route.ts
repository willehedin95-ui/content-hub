import { NextResponse } from "next/server";
import { isGoogleAdsConfigured, verifyGoogleAdsConnection } from "@/lib/google-ads";

export async function GET() {
  if (!isGoogleAdsConfigured()) {
    return NextResponse.json(
      { error: "Google Ads not configured (missing GOOGLE_ADS_* or GDRIVE_OAUTH_* env vars)" },
      { status: 500 }
    );
  }

  try {
    const result = await verifyGoogleAdsConnection();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Connection failed" },
      { status: 500 }
    );
  }
}
