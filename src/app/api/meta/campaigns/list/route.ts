import { NextResponse } from "next/server";
import { listCampaigns, setMetaConfig } from "@/lib/meta";
import { safeError } from "@/lib/api-error";
import { getWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const ws = await getWorkspace();
    setMetaConfig(ws.meta_config ?? null);
    const campaigns = await listCampaigns();
    return NextResponse.json(campaigns);
  } catch (err) {
    return safeError(err, "Failed to list campaigns");
  }
}
