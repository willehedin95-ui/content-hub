import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { runBlogAutopilot } from "@/lib/blog-autopilot";
import type { Language } from "@/types";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "true";
  const wsSlug = req.nextUrl.searchParams.get("workspace") || "happysleep";

  const db = createServerSupabase();

  // Get workspace
  const { data: workspace, error: wsError } = await db
    .from("workspaces")
    .select("id, slug, settings")
    .eq("slug", wsSlug)
    .single();

  if (wsError || !workspace) {
    return NextResponse.json(
      { error: `Workspace "${wsSlug}" not found` },
      { status: 404 }
    );
  }

  const settings = (workspace.settings ?? {}) as Record<string, unknown>;

  // Check if blog autopilot is enabled (skip with ?force=true)
  if (!force && !settings.blog_autopilot_enabled) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Blog autopilot not enabled for workspace "${wsSlug}". Enable in Settings > Blog.`,
    });
  }

  // Determine language from workspace
  // HappySleep → sv (halsobladet.com), future: could be per-workspace
  const languageMap: Record<string, Language> = {
    happysleep: "sv",
    hydro13: "sv",
  };
  const language = (settings.blog_language as Language) || languageMap[wsSlug] || "sv";

  try {
    const result = await runBlogAutopilot(workspace.id, language);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Blog autopilot failed";
    console.error("[blog-autopilot] Cron error:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
