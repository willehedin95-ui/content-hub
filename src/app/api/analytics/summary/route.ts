import { NextRequest, NextResponse } from "next/server";
import { fetchAnalyticsSummary } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "7") || 7;

  try {
    const summary = await fetchAnalyticsSummary(days);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
