import { NextResponse } from "next/server";
import { syncPipelineMetrics, getPipelineData, getCampaignBudgets } from "@/lib/pipeline";

export const maxDuration = 60;

export async function POST() {
  try {
    await syncPipelineMetrics();
    const [data, campaignBudgets] = await Promise.all([
      getPipelineData(),
      getCampaignBudgets().catch(() => []),
    ]);
    return NextResponse.json({ ...data, campaignBudgets });
  } catch (err) {
    console.error("[Pipeline Sync] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
