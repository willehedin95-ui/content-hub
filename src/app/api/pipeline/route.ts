import { NextResponse } from "next/server";
import { getPipelineData } from "@/lib/pipeline";

export async function GET() {
  try {
    const data = await getPipelineData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[Pipeline] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch pipeline data" },
      { status: 500 }
    );
  }
}
