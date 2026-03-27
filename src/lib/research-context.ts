/**
 * Build research context for injection into brainstorm/swipe/blog prompts.
 *
 * Follows the same pattern as buildLearningsContext() and buildHookInspiration()
 * in brainstorm.ts — async function that returns a markdown string.
 */

import { createServerSupabase } from "@/lib/supabase-admin";

/**
 * Build a research context string from stored nuggets.
 * Returns formatted markdown or empty string if no research data exists.
 */
export async function buildResearchContext(
  product: string,
  workspaceId: string
): Promise<string> {
  const db = createServerSupabase();

  // Fetch top nuggets by significance (last 90 days, significance >= 6)
  const ninetyDaysAgo = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [highSigRes, competitorRes, objectionsRes] = await Promise.all([
    // Top customer phrases — the gold for copywriters
    db
      .from("research_nuggets")
      .select(
        "customer_phrases, pain_points, desires, language, market_relevance, significance, review_text, competitor_name"
      )
      .eq("workspace_id", workspaceId)
      .gte("significance", 7)
      .gte("created_at", ninetyDaysAgo)
      .order("significance", { ascending: false })
      .limit(20),

    // Competitor weaknesses — negative reviews from competitor sources
    db
      .from("research_nuggets")
      .select(
        "summary, customer_phrases, pain_points, competitor_name, review_stars"
      )
      .eq("workspace_id", workspaceId)
      .in("sentiment", ["negative", "mixed"])
      .gte("significance", 5)
      .gte("created_at", ninetyDaysAgo)
      .order("significance", { ascending: false })
      .limit(15),

    // Common objections — skepticism tagged reviews
    db
      .from("research_nuggets")
      .select("summary, customer_phrases, tags, language")
      .eq("workspace_id", workspaceId)
      .contains("tags", ["skepticism"])
      .gte("significance", 5)
      .gte("created_at", ninetyDaysAgo)
      .order("significance", { ascending: false })
      .limit(10),
  ]);

  const highSig = highSigRes.data ?? [];
  const competitors = competitorRes.data ?? [];
  const objections = objectionsRes.data ?? [];

  // Also fetch active themes if any
  const { data: themes } = await db
    .from("research_themes")
    .select("name, description, copy_implications, strength, evidence_count")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .in("strength", ["growing", "established", "dominant"])
    .order("evidence_count", { ascending: false })
    .limit(8);

  // If no data at all, return empty (graceful degradation)
  if (
    highSig.length === 0 &&
    competitors.length === 0 &&
    objections.length === 0 &&
    (!themes || themes.length === 0)
  ) {
    return "";
  }

  const parts: string[] = [];
  parts.push("## CUSTOMER RESEARCH INTELLIGENCE");
  parts.push(
    "_Real quotes and patterns from Trustpilot reviews of competitor brands. Use this language — it's how actual customers talk._"
  );

  // Section 1: Real customer language
  if (highSig.length > 0) {
    parts.push("\n### Real Customer Language (use verbatim in copy)");

    // Collect unique phrases, prioritizing Nordic (primary) over English (reference)
    const primaryPhrases: string[] = [];
    const referencePhrases: string[] = [];
    const painPoints = new Set<string>();
    const desires = new Set<string>();

    for (const n of highSig) {
      const phrases: string[] = n.customer_phrases ?? [];
      if (n.market_relevance === "primary") {
        primaryPhrases.push(...phrases);
      } else {
        referencePhrases.push(...phrases);
      }
      for (const p of n.pain_points ?? []) painPoints.add(p);
      for (const d of n.desires ?? []) desires.add(d);
    }

    if (primaryPhrases.length > 0) {
      parts.push(
        "\n**Nordic customer quotes (direct ammunition):**"
      );
      for (const p of primaryPhrases.slice(0, 12)) {
        parts.push(`- "${p}"`);
      }
    }

    if (referencePhrases.length > 0) {
      parts.push(
        "\n**English-speaking market quotes (trend reference):**"
      );
      for (const p of referencePhrases.slice(0, 6)) {
        parts.push(`- "${p}"`);
      }
    }

    if (painPoints.size > 0) {
      parts.push(`\n**Top pain points:** ${[...painPoints].slice(0, 8).join(", ")}`);
    }
    if (desires.size > 0) {
      parts.push(`**Top desires:** ${[...desires].slice(0, 8).join(", ")}`);
    }
  }

  // Section 2: Competitor weaknesses
  if (competitors.length > 0) {
    parts.push("\n### Competitor Weaknesses (exploit in copy)");

    // Group by competitor
    const byCompetitor: Record<
      string,
      Array<{ summary: string; phrases: string[] }>
    > = {};
    for (const n of competitors) {
      const name = n.competitor_name ?? "Unknown";
      if (!byCompetitor[name]) byCompetitor[name] = [];
      byCompetitor[name].push({
        summary: n.summary ?? "",
        phrases: n.customer_phrases ?? [],
      });
    }

    for (const [name, items] of Object.entries(byCompetitor).slice(0, 5)) {
      parts.push(`\n**${name}** (${items.length} negative reviews):`);
      for (const item of items.slice(0, 3)) {
        parts.push(`- ${item.summary}`);
      }
    }
  }

  // Section 3: Customer objections
  if (objections.length > 0) {
    parts.push("\n### Customer Objections & Skepticism");
    parts.push(
      "_Address these in copy — they're the real barriers to purchase._"
    );
    for (const n of objections.slice(0, 6)) {
      const summary = n.summary ?? "";
      parts.push(`- ${summary}`);
    }
  }

  // Section 4: Active patterns
  if (themes && themes.length > 0) {
    parts.push("\n### Active Research Patterns");
    for (const t of themes) {
      parts.push(
        `- **${t.name}** (${t.strength}, ${t.evidence_count} mentions): ${t.copy_implications ?? t.description ?? ""}`
      );
    }
  }

  return parts.join("\n");
}
