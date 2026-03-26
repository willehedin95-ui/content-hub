/**
 * Shared theme/pattern analysis logic.
 * Used by both the weekly cron and the manual "Detect Patterns" button.
 */

import { createServerSupabase } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";

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

export async function analyzeThemes(
  workspaceId: string,
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
    max_tokens: 8000,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: `You are analyzing customer review data for a collagen supplement brand's research intelligence system. Your job: identify PATTERNS that repeat across multiple reviews.

## Recent Review Nuggets (last 30 days)
${nuggetSummaries}

## Existing Patterns
${existingThemeSummaries}

## Your Task
1. **Identify new patterns** that appear in 3+ nuggets but aren't in existing patterns
2. **Update existing patterns** — adjust strength if evidence supports it, add new example phrases
3. **Write copy_implications** — specific, actionable advice for ad copywriters

Return JSON array (no markdown fences):
[
  {
    "name": "Short memorable name",
    "description": "What this pattern captures",
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
- Each pattern must have at least 3 supporting nuggets (reference them by their [index])
- nugget_ids should be the actual IDs from the nugget data
- Don't create patterns that are too generic ("people like good products")
- Focus on patterns that a copywriter can ACT on
- Keep existing pattern names when updating (don't rename)
- Maximum 15 patterns total`,
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
      const idx = parseInt(ref, 10);
      if (!isNaN(idx) && nuggetIdByIndex[idx]) {
        resolvedNuggetIds.push(nuggetIdByIndex[idx]);
      } else if (typeof ref === "string" && ref.length > 10) {
        resolvedNuggetIds.push(ref);
      }
    }

    const evidenceCount = Math.max(resolvedNuggetIds.length, 3);
    const existing = existingByName.get(theme.name.toLowerCase());

    if (existing) {
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
