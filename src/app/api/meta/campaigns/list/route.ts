import { NextResponse } from "next/server";
import { listCampaigns } from "@/lib/meta";
import { safeError } from "@/lib/api-error";

export async function GET() {
  try {
    const campaigns = await listCampaigns();
    return NextResponse.json(campaigns);
  } catch (err) {
    return safeError(err, "Failed to list campaigns");
  }
}
