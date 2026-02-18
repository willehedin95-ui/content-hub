import { NextResponse } from "next/server";
import { listCampaigns } from "@/lib/meta";

export async function GET() {
  try {
    const campaigns = await listCampaigns();
    return NextResponse.json(campaigns);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list campaigns" },
      { status: 500 }
    );
  }
}
