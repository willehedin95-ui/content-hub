import { NextResponse } from "next/server";
import { getPipelineData, getCampaignBudgets } from "@/lib/pipeline";

export async function GET() {
  try {
    const [data, campaignBudgets] = await Promise.all([
      getPipelineData(),
      getCampaignBudgets().catch(() => []),
    ]);
    return NextResponse.json({ ...data, campaignBudgets });
  } catch (err) {
    console.error("[Pipeline] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch pipeline data" },
      { status: 500 }
    );
  }
}
