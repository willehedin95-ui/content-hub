import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { sendMessage } from "@/lib/telegram";

export const maxDuration = 300;

const CLAUDE_SONNET_MODEL = "claude-sonnet-4-5-20250929";
const SONNET_INPUT_COST = 3.0;
const SONNET_OUTPUT_COST = 15.0;

interface ThemeOutput {
  name: string;
  description: string;
  theme_type: string;
  strength: string;
  tags: string[];
  example_phrases: string[];
  copy_implications: string;
  nugget_ids: string[];
}

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
      const result = await analyzeThemes(ws.id, ws.slug);
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

async function analyzeThemes(
  workspaceId: string,
  workspaceSlug: string
): Promise<{ themesCreated: number; themesUpdated: number }> {
  const db = createServerSupabase();

  // Fetch recent nuggets (last 30 days, significance >= 5)
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: nuggets } = await db
    .from("research_nuggets")
    .select(
      "id, summary, tags, customer_phrases, pain_points, desires, sentiment, significance, competitor_name, language, market_relevance"
    )
    .eq("workspace_id", workspaceId)
    .gte("significance", 5)
    .gte("created_at", thirtyDaysAgo)
    .order("significance", { ascending: false })
    .limit(200);

  if (!nuggets?.length) {
    return { themesCreated: 0, themesUpdated: 0 };
  }

  // Fetch existing themes
  const { data: existingThemes } = await db
    .from("research_themes")
    .select("id, name, description, theme_type, strength, evidence_count, tags, example_phrases, copy_implications")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });

  // Build prompt
  const nuggetSummaries = nuggets
    .map(
      (n, i) =>
        `[${i}] (sig:${n.significance}, ${n.sentiment}, ${n.competitor_name}, ${n.language}) ${n.summary}${
          n.customer_phrases?.length
            ? ` | Phrases: "${n.customer_phrases.slice(0, 2).join('", "')}"`
            : ""
        }${n.pain_points?.length ? ` | Pain: ${n.pain_points.join(", ")}` : ""}${
          n.desires?.length ? ` | Desire: ${n.desires.join(", ")}` : ""
        }`
    )
    .join("\n");

  const existingThemeSummaries = existingThemes?.length
    ? existingThemes
        .map(
          (t) =>
            `- "${t.name}" (${t.theme_type}, ${t.strength}, ${t.evidence_count} mentions): ${t.description ?? ""}`
        )
        .join("\n")
    : "None yet.";

  const response = await client.messages.create({
    model: CLAUDE_SONNET_MODEL,
    max_tokens: 3000,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: `You are analyzing customer review data for a collagen supplement brand's research intelligence system. Your job: identify PATTERNS that repeat across multiple reviews.

## Recent Review Nuggets (last 30 days)
${nuggetSummaries}

## Existing Themes
${existingThemeSummaries}

## Your Task
1. **Identify new themes** that appear in 3+ nuggets but aren't in existing themes
2. **Update existing themes** — adjust strength if evidence supports it, add new example phrases
3. **Write copy_implications** — specific, actionable advice for ad copywriters

Return JSON array (no markdown fences):
[
  {
    "name": "Short memorable name",
    "description": "What this theme captures",
    "theme_type": "pain_point" | "desire" | "objection" | "competitor_weakness" | "trend" | "language_pattern",
    "strength": "emerging" | "growing" | "established" | "dominant",
    "tags": ["relevant", "tags"],
    "example_phrases": ["exact customer quote 1", "exact customer quote 2"],
    "copy_implications": "How to use this in ad copy — specific, actionable",
    "nugget_ids": ["nugget_id_1", "nugget_id_2"]
  }
]

STRENGTH RULES:
- emerging: 3-5 nuggets mention it
- growing: 6-15 nuggets, trend accelerating
- established: 15+ nuggets, consistent pattern
- dominant: 25+ nuggets, defines the category conversation

IMPORTANT:
- Each theme must have at least 3 supporting nuggets (reference them by their [index])
- nugget_ids should be the actual IDs from the nugget data
- Don't create themes that are too generic ("people like good products")
- Focus on patterns that a copywriter can ACT on
- Keep existing theme names when updating (don't rename)
- Maximum 15 themes total`,
      },
    ],
  });

  const raw =
    response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Log usage
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd =
    (inputTokens * SONNET_INPUT_COST + outputTokens * SONNET_OUTPUT_COST) /
    1_000_000;

  await db.from("usage_logs").insert({
    type: "research_theme_analysis",
    model: "claude-sonnet-4-5",
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
    metadata: {
      workspace_id: workspaceId,
      nugget_count: nuggets.length,
      existing_theme_count: existingThemes?.length ?? 0,
    },
  });

  let themes: ThemeOutput[];
  try {
    themes = JSON.parse(cleaned) as ThemeOutput[];
  } catch {
    console.error("Failed to parse theme analysis response:", cleaned);
    return { themesCreated: 0, themesUpdated: 0 };
  }

  if (!Array.isArray(themes)) {
    return { themesCreated: 0, themesUpdated: 0 };
  }

  // Build nugget ID lookup by index
  const nuggetIdByIndex: Record<number, string> = {};
  for (let i = 0; i < nuggets.length; i++) {
    nuggetIdByIndex[i] = nuggets[i].id;
  }

  // Existing theme name lookup
  const existingByName = new Map(
    (existingThemes ?? []).map((t) => [t.name.toLowerCase(), t])
  );

  let themesCreated = 0;
  let themesUpdated = 0;
  const now = new Date().toISOString();

  for (const theme of themes) {
    // Resolve nugget IDs — accept both index references and actual UUIDs
    const resolvedNuggetIds: string[] = [];
    for (const ref of theme.nugget_ids ?? []) {
      // Check if it's an index reference like "0", "1", "2"
      const idx = parseInt(ref, 10);
      if (!isNaN(idx) && nuggetIdByIndex[idx]) {
        resolvedNuggetIds.push(nuggetIdByIndex[idx]);
      } else if (typeof ref === "string" && ref.length > 10) {
        // Likely a UUID
        resolvedNuggetIds.push(ref);
      }
    }

    const evidenceCount = Math.max(resolvedNuggetIds.length, 3);
    const existing = existingByName.get(theme.name.toLowerCase());

    if (existing) {
      // Update existing theme
      await db
        .from("research_themes")
        .update({
          description: theme.description || existing.description,
          strength: theme.strength,
          evidence_count: evidenceCount,
          tags: theme.tags,
          example_phrases: theme.example_phrases,
          copy_implications: theme.copy_implications || existing.copy_implications,
          last_seen_at: now,
          updated_at: now,
        })
        .eq("id", existing.id);

      // Update nugget-theme links
      await db
        .from("research_nugget_themes")
        .delete()
        .eq("theme_id", existing.id);

      if (resolvedNuggetIds.length > 0) {
        await db.from("research_nugget_themes").upsert(
          resolvedNuggetIds.map((nid) => ({
            nugget_id: nid,
            theme_id: existing.id,
            relevance: 1.0,
          })),
          { onConflict: "nugget_id,theme_id" }
        );
      }

      themesUpdated++;
    } else {
      // Create new theme
      const { data: newTheme, error } = await db
        .from("research_themes")
        .upsert(
          {
            workspace_id: workspaceId,
            name: theme.name,
            description: theme.description,
            theme_type: theme.theme_type,
            strength: theme.strength,
            evidence_count: evidenceCount,
            tags: theme.tags,
            example_phrases: theme.example_phrases,
            copy_implications: theme.copy_implications,
            first_seen_at: now,
            last_seen_at: now,
            status: "active",
          },
          { onConflict: "workspace_id,name" }
        )
        .select("id")
        .single();

      if (error) {
        console.error(`Failed to upsert theme "${theme.name}":`, error);
        continue;
      }

      if (newTheme && resolvedNuggetIds.length > 0) {
        await db.from("research_nugget_themes").upsert(
          resolvedNuggetIds.map((nid) => ({
            nugget_id: nid,
            theme_id: newTheme.id,
            relevance: 1.0,
          })),
          { onConflict: "nugget_id,theme_id" }
        );
      }

      themesCreated++;
    }
  }

  return { themesCreated, themesUpdated };
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
    `${themeResult.themesCreated} new themes, ${themeResult.themesUpdated} updated`
  );

  if (themes?.length) {
    lines.push("");
    lines.push("<b>Active Themes:</b>");
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
