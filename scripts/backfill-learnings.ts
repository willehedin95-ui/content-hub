// Usage: npx tsx scripts/backfill-learnings.ts
// Requires ANTHROPIC_API_KEY and SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in .env.local

import { readFileSync } from "fs";

// Load .env.local manually (no dotenv dependency)
const envContent = readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function generateLearning(opts: {
  name: string;
  conceptNumber: number | null;
  product: string;
  market: string;
  outcome: "winner" | "loser";
  daysTested: number;
  totalSpend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa: number;
  roas: number | null;
  revenue: number;
  signal: string;
  cashDna: Record<string, unknown> | null;
  originalHypothesis: string | null;
}) {
  const cashDnaSection = opts.cashDna
    ? `
CASH DNA:
- Angle: ${opts.cashDna.angle ?? "unknown"}
- Awareness Level: ${opts.cashDna.awareness_level ?? "unknown"}
- Style: ${opts.cashDna.style ?? "unknown"}
- Concept Type: ${opts.cashDna.concept_type ?? "unknown"}`
    : "CASH DNA: Not available";

  const hypothesisSection = opts.originalHypothesis
    ? `Original Hypothesis: "${opts.originalHypothesis}"`
    : "No original hypothesis recorded.";

  const prompt = `You are a performance marketing analyst reviewing ad test results to extract learnings.

Concept: "${opts.name}"${opts.conceptNumber ? ` (#${opts.conceptNumber})` : ""}
Product: ${opts.product}
Market: ${opts.market}
Outcome: ${opts.outcome.toUpperCase()}

${cashDnaSection}

${hypothesisSection}

Performance:
- Days tested: ${opts.daysTested}
- Total spend: ${opts.totalSpend.toFixed(0)}
- Impressions: ${opts.impressions.toLocaleString()}
- Clicks: ${opts.clicks.toLocaleString()}
- CTR: ${opts.ctr.toFixed(2)}%
- Conversions: ${opts.conversions}
- CPA: ${opts.conversions > 0 ? opts.cpa.toFixed(0) : "N/A (no conversions)"}
- ROAS: ${opts.roas !== null ? `${opts.roas.toFixed(2)}x` : "N/A"}
- Revenue: ${opts.revenue.toFixed(0)}
- Signal: ${opts.signal}

Return a JSON object with exactly these fields:
{
  "hypothesis": "2-3 sentences explaining why this concept ${opts.outcome === "winner" ? "succeeded" : "underperformed"}. Be specific about which CASH DNA variables likely contributed to the outcome.",
  "takeaway": "2-3 sentences describing the reusable learning. Frame it as: 'We learned that [variable combination] [does/doesn't] work for [product] in [market] because [reason].' Focus on what to do differently or repeat next time.",
  "tags": ["2-5 lowercase keywords describing the key variables and themes"]
}

Return ONLY the JSON, no markdown fences or extra text.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });
  let text = response.content.find((b) => b.type === "text")?.text ?? "";
  // Strip markdown fences if present
  text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return JSON.parse(text);
}

async function main() {
  console.log("🔍 Finding killed/active concepts without learnings...\n");

  // Get distinct image_job_market_ids that reached killed or active
  const { data: lifecycleEntries, error: lcErr } = await db
    .from("concept_lifecycle")
    .select("image_job_market_id, stage, signal")
    .in("stage", ["killed", "active"]);

  if (lcErr || !lifecycleEntries) {
    console.error("Failed to fetch lifecycle entries:", lcErr?.message);
    return;
  }

  // Deduplicate by image_job_market_id (keep the latest stage)
  const uniqueMap = new Map<string, { stage: string; signal: string }>();
  for (const entry of lifecycleEntries) {
    uniqueMap.set(entry.image_job_market_id, {
      stage: entry.stage,
      signal: entry.signal,
    });
  }

  // Check which ones already have learnings
  const { data: existingLearnings } = await db
    .from("concept_learnings")
    .select("image_job_market_id");

  const existingSet = new Set(
    (existingLearnings ?? []).map((l) => l.image_job_market_id)
  );

  const toBackfill = [...uniqueMap.entries()].filter(
    ([id]) => !existingSet.has(id)
  );

  console.log(
    `Found ${toBackfill.length} concepts to backfill (${existingSet.size} already have learnings)\n`
  );

  if (toBackfill.length === 0) {
    console.log("Nothing to backfill!");
    return;
  }

  let success = 0;
  let failed = 0;

  for (const [imageJobMarketId, { stage, signal }] of toBackfill) {
    // Fetch market details
    const { data: ijm } = await db
      .from("image_job_markets")
      .select("market, image_job_id")
      .eq("id", imageJobMarketId)
      .single();

    if (!ijm) {
      console.log(`  ⚠ Skipping ${imageJobMarketId} — no market data`);
      failed++;
      continue;
    }

    // Fetch image job
    const { data: ij } = await db
      .from("image_jobs")
      .select("name, product, concept_number, cash_dna, pipeline_concept_id")
      .eq("id", ijm.image_job_id)
      .single();

    if (!ij) {
      console.log(`  ⚠ Skipping ${imageJobMarketId} — no image job data`);
      failed++;
      continue;
    }

    // Fetch aggregated metrics
    const { data: metrics } = await db
      .from("concept_metrics")
      .select("spend, impressions, clicks, conversions, revenue, ctr, cpa, roas, date")
      .eq("image_job_market_id", imageJobMarketId)
      .order("date", { ascending: true });

    const totalSpend = (metrics ?? []).reduce((s, m) => s + (m.spend || 0), 0);
    const totalImpressions = (metrics ?? []).reduce((s, m) => s + (m.impressions || 0), 0);
    const totalClicks = (metrics ?? []).reduce((s, m) => s + (m.clicks || 0), 0);
    const totalConversions = (metrics ?? []).reduce((s, m) => s + (m.conversions || 0), 0);
    const totalRevenue = (metrics ?? []).reduce((s, m) => s + (m.revenue || 0), 0);
    const daysTested = (metrics ?? []).length;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;

    // Fetch original hypothesis from pipeline_concepts
    let originalHypothesis: string | null = null;
    if (ij.pipeline_concept_id) {
      const { data: pc } = await db
        .from("pipeline_concepts")
        .select("hypothesis")
        .eq("id", ij.pipeline_concept_id)
        .single();
      originalHypothesis = pc?.hypothesis ?? null;
    }

    const outcome = stage === "active" ? "winner" : "loser";
    console.log(
      `  📝 ${ij.name} #${ij.concept_number || "?"} (${ijm.market}) — ${outcome} — $${totalSpend.toFixed(0)} spend, ${daysTested} days`
    );

    try {
      const learning = await generateLearning({
        name: ij.name,
        conceptNumber: ij.concept_number,
        product: ij.product,
        market: ijm.market,
        outcome,
        daysTested,
        totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr,
        conversions: totalConversions,
        cpa,
        roas,
        revenue: totalRevenue,
        signal,
        cashDna: ij.cash_dna,
        originalHypothesis,
      });

      // Insert learning
      const { error: insertErr } = await db.from("concept_learnings").insert({
        image_job_market_id: imageJobMarketId,
        image_job_id: ijm.image_job_id,
        product: ij.product,
        market: ijm.market,
        outcome,
        angle: ij.cash_dna?.angle ?? null,
        awareness_level: ij.cash_dna?.awareness_level ?? null,
        style: ij.cash_dna?.style ?? null,
        concept_type: ij.cash_dna?.concept_type ?? null,
        days_tested: daysTested,
        total_spend: totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr,
        conversions: totalConversions,
        cpa,
        roas,
        hypothesis_tested: learning.hypothesis,
        takeaway: learning.takeaway,
        tags: learning.tags,
        signal,
        concept_name: ij.name,
      });

      if (insertErr) {
        console.log(`    ❌ Insert failed: ${insertErr.message}`);
        failed++;
      } else {
        console.log(`    ✅ Learning saved: "${learning.takeaway.slice(0, 80)}..."`);
        success++;
      }
    } catch (err) {
      console.log(`    ❌ Generation failed: ${err}`);
      failed++;
    }

    // 1s delay between API calls
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n✅ Done! ${success} learnings created, ${failed} failed.`);
}

main().catch(console.error);
