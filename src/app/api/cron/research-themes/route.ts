import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { sendMessage } from "@/lib/telegram";
import { analyzeThemes } from "@/lib/research-themes";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Get workspaces with research enabled
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, slug, settings");

  if (!workspaces?.length) {
    return NextResponse.json({ skipped: true, reason: "No workspaces" });
  }

  const results: Array<{
    workspace: string;
    themesCreated: number;
    themesUpdated: number;
    error?: string;
  }> = [];

  for (const ws of workspaces) {
    const settings = ws.settings as Record<string, unknown>;
    if (!settings?.research_enabled) continue;

    try {
      const result = await analyzeThemes(ws.id);
      results.push({ workspace: ws.slug, ...result });

      // Send Telegram digest
      if (result.themesCreated > 0 || result.themesUpdated > 0) {
        await sendWeeklyDigest(ws.id, ws.slug, result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`Theme analysis failed for ${ws.slug}:`, msg);
      results.push({
        workspace: ws.slug,
        themesCreated: 0,
        themesUpdated: 0,
        error: msg,
      });
    }
  }

  return NextResponse.json({
    analyzed_at: new Date().toISOString(),
    results,
  });
}

async function sendWeeklyDigest(
  workspaceId: string,
  workspaceSlug: string,
  themeResult: { themesCreated: number; themesUpdated: number }
) {
  const db = createServerSupabase();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  // Fetch top themes
  const { data: themes } = await db
    .from("research_themes")
    .select("name, strength, evidence_count, copy_implications, theme_type")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("evidence_count", { ascending: false })
    .limit(8);

  // Fetch top nuggets from the week
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: topNuggets } = await db
    .from("research_nuggets")
    .select("summary, customer_phrases, significance, competitor_name")
    .eq("workspace_id", workspaceId)
    .gte("significance", 7)
    .gte("created_at", sevenDaysAgo)
    .order("significance", { ascending: false })
    .limit(5);

  // Stats
  const { count: totalNuggets } = await db
    .from("research_nuggets")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  const { count: weekNuggets } = await db
    .from("research_nuggets")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("created_at", sevenDaysAgo);

  const lines: string[] = [];
  lines.push(`📊 <b>Research Weekly Digest — ${workspaceSlug}</b>`);
  lines.push("");
  lines.push(
    `${weekNuggets ?? 0} new nuggets this week (${totalNuggets ?? 0} total)`
  );
  lines.push(
    `${themeResult.themesCreated} new patterns, ${themeResult.themesUpdated} updated`
  );

  if (themes?.length) {
    lines.push("");
    lines.push("<b>Active Patterns:</b>");
    for (const t of themes) {
      const icon =
        t.strength === "dominant"
          ? "🔥"
          : t.strength === "established"
            ? "✅"
            : t.strength === "growing"
              ? "📈"
              : "🌱";
      lines.push(
        `${icon} <b>${t.name}</b> (${t.evidence_count} mentions)`
      );
      if (t.copy_implications) {
        lines.push(`   → ${t.copy_implications.slice(0, 120)}`);
      }
    }
  }

  if (topNuggets?.length) {
    lines.push("");
    lines.push("<b>Gold Nuggets This Week:</b>");
    for (const n of topNuggets) {
      const phrase = n.customer_phrases?.[0];
      lines.push(
        `⭐ [${n.significance}/10] ${n.summary}${
          phrase ? `\n   "${phrase}"` : ""
        }`
      );
    }
  }

  await sendMessage(chatId, lines.join("\n"), {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}
