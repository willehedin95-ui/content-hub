import { NextRequest, NextResponse } from "next/server";
import { listAdSets, setMetaConfig } from "@/lib/meta";
import { safeError } from "@/lib/api-error";
import { getWorkspace } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get("campaign_id");

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaign_id is required" },
      { status: 400 }
    );
  }

  try {
    const ws = await getWorkspace();
    setMetaConfig(ws.meta_config ?? null);
    const adSets = await listAdSets(campaignId);
    return NextResponse.json(adSets);
  } catch (err) {
    return safeError(err, "Failed to fetch ad sets");
  }
}
