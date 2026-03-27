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
  const wsSlug = req.nextUrl.searchParams.get("workspace");
  if (!wsSlug) {
    return NextResponse.json({ error: "workspace query param is required" }, { status: 400 });
  }

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

  // Determine which language to process
  // If ?lang= is specified, run only that language (used by per-language cron entries).
  // Otherwise fall back to all enabled languages (legacy behavior).
  const enabledLanguages = (settings.blog_autopilot_languages as string[]) || ["sv"];
  const langParam = req.nextUrl.searchParams.get("lang");
  const languagesToRun = langParam
    ? enabledLanguages.includes(langParam) ? [langParam] : []
    : enabledLanguages;

  if (langParam && !languagesToRun.length) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Language "${langParam}" not in enabled languages: ${enabledLanguages.join(", ")}`,
    });
  }

  const results: Record<string, unknown> = {};

  for (const lang of languagesToRun) {
    try {
      const result = await runBlogAutopilot(workspace.id, lang as Language, { force });
      results[lang] = result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Blog autopilot failed";
      console.error(`[blog-autopilot] Cron error (${lang}):`, message);
      results[lang] = { action: "error", message };
    }
  }

  return NextResponse.json({ ok: true, results });
}
