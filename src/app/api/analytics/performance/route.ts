import { NextRequest, NextResponse } from "next/server";
import { fetchCampaignPerformance } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "7") || 7;

  try {
    const campaigns = await fetchCampaignPerformance(days);
    return NextResponse.json({ campaigns });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch performance data" },
      { status: 500 }
    );
  }
}
