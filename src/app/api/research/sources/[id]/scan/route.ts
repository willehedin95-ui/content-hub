import { NextResponse } from "next/server";
import { getWorkspaceId } from "@/lib/workspace";
import { createServerSupabase } from "@/lib/supabase-admin";
import { scanSingleSource } from "@/lib/research-scan";
import { safeError } from "@/lib/api-error";

export const maxDuration = 300; // 5 min — scraping + AI evaluation

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace" }, { status: 401 });
    }

    const url = new URL(req.url);
    const deep = url.searchParams.get("deep") === "true";

    const { id } = await params;
    const db = createServerSupabase();

    const { data: source } = await db
      .from("research_sources")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    if (source.platform === "manual_import" || source.platform === "facebook_group") {
      return NextResponse.json(
        { error: "Manual sources cannot be scanned automatically" },
        { status: 400 }
      );
    }

    const result = await scanSingleSource(source, workspaceId, { deep });
    return NextResponse.json(result);
  } catch (e) {
    return safeError(e, "Scan failed");
  }
}
