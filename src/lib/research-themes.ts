/**
 * Shared theme/pattern analysis logic.
 * Used by both the weekly cron and the manual "Detect Patterns" button.
 *
 * Two-phase approach:
 * 1. Sonnet identifies themes from a sample of high-significance nuggets
 * 2. Haiku classifies ALL nuggets against detected themes for accurate counts
 */

import { createServerSupabase } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_SONNET_MODEL = "claude-sonnet-4-5-20250929";
const CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_INPUT_COST = 3.0;
const SONNET_OUTPUT_COST = 15.0;
const HAIKU_INPUT_COST = 0.80;
const HAIKU_OUTPUT_COST = 4.0;

const CLASSIFY_BATCH_SIZE = 100;
const CLASSIFY_DELAY_MS = 200;

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

/**
 * Phase 1: Sonnet identifies themes from a sample of nuggets.
 * Phase 2: Haiku classifies ALL nuggets against detected themes.
 */
export async function analyzeThemes(
  workspaceId: string,
): Promise<{ themesCreated: number; themesUpdated: number; totalClassified: number }> {
  const db = createServerSupabase();

  // Fetch recent nuggets (last 30 days, significance >= 5) — sample for Sonnet
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
    .limit(500);

  if (!nuggets?.length) {
    return { themesCreated: 0, themesUpdated: 0, totalClassified: 0 };
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

NOTE: Don't worry about listing every matching nugget — just list enough to establish the pattern (5-10 examples).
A second pass will classify ALL nuggets against your themes automatically.

IMPORTANT:
- Each pattern must have at least 3 supporting nuggets (reference them by their [index])
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
    return { themesCreated: 0, themesUpdated: 0, totalClassified: 0 };
  }

  if (!Array.isArray(themes)) {
    return { themesCreated: 0, themesUpdated: 0, totalClassified: 0 };
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

      // Sonnet-phase links (will be replaced by Haiku classification)
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

  // Phase 2: Haiku classifies ALL nuggets against detected themes
  const classifyResult = await classifyAllNuggets(workspaceId, client);

  return { themesCreated, themesUpdated, totalClassified: classifyResult.totalClassified };
}

// ---------------------------------------------------------------------------
// Phase 2: Haiku batch-classifies ALL nuggets against detected themes
// ---------------------------------------------------------------------------

async function classifyAllNuggets(
  workspaceId: string,
  client: Anthropic,
): Promise<{ totalClassified: number }> {
  const db = createServerSupabase();

  // Fetch all active themes
  const { data: themes } = await db
    .from("research_themes")
    .select("id, name, description, tags")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  if (!themes?.length) return { totalClassified: 0 };

  // Fetch ALL nuggets with significance >= 5 (paginate past Supabase 1000 limit)
  const allNuggets: Array<{
    id: string;
    summary: string;
    tags: string[];
    pain_points: string[];
    desires: string[];
  }> = [];
  let offset = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data: batch } = await db
      .from("research_nuggets")
      .select("id, summary, tags, pain_points, desires")
      .eq("workspace_id", workspaceId)
      .gte("significance", 5)
      .order("significance", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (!batch?.length) break;
    allNuggets.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (!allNuggets.length) return { totalClassified: 0 };

  // Build compact theme reference for Haiku
  const themeRef = themes
    .map(
      (t, i) =>
        `[${i}] ${t.name}: ${t.description ?? ""}${t.tags?.length ? ` (${t.tags.join(", ")})` : ""}`
    )
    .join("\n");

  // Track which nuggets belong to which themes
  const themeNuggetMap = new Map<string, Set<string>>();
  for (const t of themes) themeNuggetMap.set(t.id, new Set());

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < allNuggets.length; i += CLASSIFY_BATCH_SIZE) {
    const batch = allNuggets.slice(i, i + CLASSIFY_BATCH_SIZE);

    if (i > 0) await new Promise((r) => setTimeout(r, CLASSIFY_DELAY_MS));

    const nuggetLines = batch
      .map(
        (n, j) =>
          `[${j}] ${n.summary}${n.pain_points?.length ? ` | Pain: ${n.pain_points.join(", ")}` : ""}${n.desires?.length ? ` | Desire: ${n.desires.join(", ")}` : ""}`
      )
      .join("\n");

    try {
      const response = await client.messages.create({
        model: CLAUDE_HAIKU_MODEL,
        max_tokens: 2000,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: `Classify each review nugget into the themes it belongs to. A nugget can match 0 or multiple themes.

## Themes
${themeRef}

## Nuggets
${nuggetLines}

Return JSON object mapping nugget index to array of matching theme indices (no markdown fences):
{"0":[1,3],"2":[0,2,4]}

Only include nuggets that match at least one theme. Omit nuggets with 0 matches.
Be inclusive — if a nugget is even partially relevant to a theme, include it.`,
          },
        ],
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const rawText =
        response.content[0].type === "text" ? response.content[0].text : "";
      const cleanedText = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const classifications = JSON.parse(cleanedText) as Record<
        string,
        number[]
      >;

      for (const [nuggetIdx, themeIndices] of Object.entries(classifications)) {
        const nugget = batch[parseInt(nuggetIdx, 10)];
        if (!nugget) continue;

        for (const themeIdx of themeIndices) {
          const theme = themes[themeIdx];
          if (!theme) continue;
          themeNuggetMap.get(theme.id)?.add(nugget.id);
        }
      }
    } catch (err) {
      console.error(
        `Classification batch ${Math.floor(i / CLASSIFY_BATCH_SIZE)} failed:`,
        err
      );
    }
  }

  // Log total Haiku usage
  const costUsd =
    (totalInputTokens * HAIKU_INPUT_COST +
      totalOutputTokens * HAIKU_OUTPUT_COST) /
    1_000_000;
  await db.from("usage_logs").insert({
    type: "research_theme_classification",
    model: "claude-haiku-4-5",
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cost_usd: costUsd,
    metadata: {
      workspace_id: workspaceId,
      nuggets_classified: allNuggets.length,
      themes_count: themes.length,
      batches: Math.ceil(allNuggets.length / CLASSIFY_BATCH_SIZE),
    },
  });

  // Replace all nugget-theme links and update evidence counts + strength
  let totalClassified = 0;

  for (const theme of themes) {
    const nuggetIds = themeNuggetMap.get(theme.id);
    if (!nuggetIds) continue;

    // Delete old links (from Sonnet phase)
    await db.from("research_nugget_themes").delete().eq("theme_id", theme.id);

    // Insert new links from Haiku classification
    if (nuggetIds.size > 0) {
      const links = Array.from(nuggetIds).map((nid) => ({
        nugget_id: nid,
        theme_id: theme.id,
        relevance: 1.0,
      }));

      for (let j = 0; j < links.length; j += 500) {
        await db
          .from("research_nugget_themes")
          .upsert(links.slice(j, j + 500), {
            onConflict: "nugget_id,theme_id",
          });
      }

      totalClassified += nuggetIds.size;
    }

    // Recalculate strength based on actual count
    const count = nuggetIds.size;
    let strength: string;
    if (count >= 100) strength = "dominant";
    else if (count >= 40) strength = "established";
    else if (count >= 15) strength = "growing";
    else strength = "emerging";

    await db
      .from("research_themes")
      .update({
        evidence_count: count,
        strength,
        updated_at: new Date().toISOString(),
      })
      .eq("id", theme.id);
  }

  return { totalClassified };
}
