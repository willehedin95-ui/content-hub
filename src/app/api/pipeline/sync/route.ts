import { NextResponse } from "next/server";
import { syncPipelineMetrics, getPipelineData } from "@/lib/pipeline";

export const maxDuration = 60;

export async function POST() {
  try {
    await syncPipelineMetrics();
    const data = await getPipelineData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[Pipeline Sync] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
