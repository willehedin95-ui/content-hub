import { NextResponse } from "next/server";
import { getWorkspaceId } from "@/lib/workspace";
import { analyzeThemes } from "@/lib/research-themes";
import { safeError } from "@/lib/api-error";

export const maxDuration = 300; // 5 min — Sonnet analysis

export async function POST() {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace" }, { status: 401 });
    }

    const result = await analyzeThemes(workspaceId);
    return NextResponse.json(result);
  } catch (e) {
    return safeError(e, "Pattern detection failed");
  }
}
