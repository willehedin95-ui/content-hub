import { NextRequest, NextResponse } from "next/server";
import { listAdSets } from "@/lib/meta";
import { safeError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get("campaign_id");

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaign_id is required" },
      { status: 400 }
    );
  }

  try {
    const adSets = await listAdSets(campaignId);
    return NextResponse.json(adSets);
  } catch (err) {
    return safeError(err, "Failed to fetch ad sets");
  }
}
