import { NextResponse } from "next/server";
import { verifyConnection, setMetaConfig } from "@/lib/meta";
import { safeError } from "@/lib/api-error";
import { getWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const ws = await getWorkspace();
    setMetaConfig(ws.meta_config ?? null);
    const info = await verifyConnection();
    return NextResponse.json(info);
  } catch (error) {
    return safeError(error, "Connection failed");
  }
}
