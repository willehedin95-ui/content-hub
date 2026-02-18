import { NextRequest, NextResponse } from "next/server";
import { listAdSets } from "@/lib/meta";

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch ad sets" },
      { status: 500 }
    );
  }
}
