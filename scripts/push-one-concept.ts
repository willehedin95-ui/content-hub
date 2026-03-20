#!/usr/bin/env npx tsx
/**
 * Push a single concept to specific markets from the command line.
 * Bypasses Next.js cookie requirements by passing workspace config directly.
 *
 * Usage: npx tsx scripts/push-one-concept.ts <conceptId> [markets]
 * Example: npx tsx scripts/push-one-concept.ts 700aa45a-... SE
 *          npx tsx scripts/push-one-concept.ts 700aa45a-... SE,DK,NO
 */
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const MARKET_TO_LANG: Record<string, string> = { NO: "no", DK: "da", SE: "sv", DE: "de" };
const WORKSPACE_SLUG = "happysleep";

async function main() {
  const conceptId = process.argv[2];
  const marketsArg = process.argv[3] || "SE";

  if (!conceptId) {
    console.error("Usage: npx tsx scripts/push-one-concept.ts <conceptId> [markets]");
    process.exit(1);
  }

  const markets = marketsArg.split(",").map((m) => m.trim().toUpperCase());
  const languages = markets.map((m) => MARKET_TO_LANG[m]).filter(Boolean);

  // Fetch workspace from DB to get ID and meta_config
  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const db = createServerSupabase();

  const { data: ws } = await db
    .from("workspaces")
    .select("id, meta_config, settings")
    .eq("slug", WORKSPACE_SLUG)
    .single();

  if (!ws) {
    console.error("Workspace not found");
    process.exit(1);
  }

  console.log(`Pushing concept ${conceptId} to ${markets.join(", ")} (languages: ${languages.join(", ")})...`);

  const { pushConceptToMeta } = await import("../src/lib/meta-push");
  const result = await pushConceptToMeta(conceptId, {
    languages,
    workspaceId: ws.id,
    metaConfig: ws.meta_config ?? null,
    wsSettings: (ws.settings ?? {}) as Record<string, unknown>,
  });

  console.log("Result:", JSON.stringify(result, null, 2));

  // Update lifecycle: launchpad -> testing
  const now = new Date().toISOString();
  const { data: marketRows } = await db
    .from("image_job_markets")
    .select("id, market")
    .eq("image_job_id", conceptId);

  for (const row of marketRows ?? []) {
    const lang = MARKET_TO_LANG[row.market];
    const langResult = result.results.find((r: any) => r.language === lang);

    if (langResult?.status === "pushed") {
      await db
        .from("concept_lifecycle")
        .update({ exited_at: now })
        .eq("image_job_market_id", row.id)
        .eq("stage", "launchpad")
        .is("exited_at", null);

      await db.from("concept_lifecycle").insert({
        image_job_market_id: row.id,
        stage: "testing",
        entered_at: now,
        signal: "manual_push_script",
      });

      console.log(`Lifecycle updated: ${row.market} -> testing`);
    }
  }

  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
