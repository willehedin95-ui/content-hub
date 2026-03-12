import { NextResponse } from "next/server";
import { listPages, setMetaConfig } from "@/lib/meta";
import { safeError } from "@/lib/api-error";
import { getWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const ws = await getWorkspace();
    setMetaConfig(ws.meta_config ?? null);
    const pages = await listPages();
    return NextResponse.json(pages);
  } catch (error) {
    return safeError(error, "Failed to fetch pages");
  }
}
