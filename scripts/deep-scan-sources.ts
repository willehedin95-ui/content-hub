/**
 * Deep scan all research sources for a workspace.
 * Runs locally — no Vercel timeout limit.
 *
 * Usage: npx tsx scripts/deep-scan-sources.ts [workspace_id_prefix]
 */

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
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

import { createClient } from "@supabase/supabase-js";
import { scanSingleSource, type SourceRecord } from "../src/lib/research-scan";

const WORKSPACE_PREFIX = process.argv[2] || "6a18a542"; // hydro13 default

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find workspace by slug or id prefix
  const { data: all } = await db.from("workspaces").select("id, slug");
  const workspaces = (all ?? []).filter(
    (w) => w.slug === WORKSPACE_PREFIX || w.id.startsWith(WORKSPACE_PREFIX)
  );

  if (!workspaces?.length) {
    console.error(`No workspace found matching: ${WORKSPACE_PREFIX}`);
    process.exit(1);
  }

  const ws = workspaces[0];
  console.log(`\n🔬 Deep scanning workspace: ${ws.slug} (${ws.id})\n`);

  // Get all active auto-scan sources
  const { data: sources } = await db
    .from("research_sources")
    .select("*")
    .eq("workspace_id", ws.id)
    .in("platform", ["trustpilot", "amazon", "reddit", "apify_instagram", "apify_facebook", "apify_tiktok"])
    .eq("status", "active")
    .order("total_reviews_fetched", { ascending: true }); // smallest first

  if (!sources?.length) {
    console.log("No scannable sources found.");
    return;
  }

  console.log(`Found ${sources.length} sources to deep scan:\n`);
  for (const s of sources) {
    console.log(`  ${s.name.padEnd(30)} ${String(s.total_reviews_fetched).padStart(5)} fetched   (${s.platform})`);
  }
  console.log("");

  let totalScraped = 0;
  let totalNuggets = 0;

  for (const source of sources) {
    const startTime = Date.now();
    console.log(`\n━━━ ${source.name} (${source.platform}) ━━━`);
    console.log(`  Previously fetched: ${source.total_reviews_fetched}`);

    try {
      const result = await scanSingleSource(source as SourceRecord, ws.id, { deep: true });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  ✅ ${result.reviewsScraped} scraped, ${result.nuggetsStored} nuggets stored (${elapsed}s)`);
      if (result.error) {
        console.log(`  ⚠️  ${result.error}`);
      }
      totalScraped += result.reviewsScraped;
      totalNuggets += result.nuggetsStored;
    } catch (err) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.error(`  ❌ Failed after ${elapsed}s:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n━━━ Done ━━━`);
  console.log(`  Total scraped: ${totalScraped}`);
  console.log(`  Total nuggets stored: ${totalNuggets}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
