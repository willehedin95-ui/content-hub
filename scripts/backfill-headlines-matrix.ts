// One-off: replace the string-split junk headlines on the matrix-2026-07-06 batch
// with real ones from headline-bot- (2026-07-06).
// Run: npx --yes -p dotenv-cli@7 dotenv -e .env.local -- npx --yes tsx scripts/backfill-headlines-matrix.ts

import { createServerSupabase } from "../src/lib/supabase-admin";
import { generateHeadlines } from "../src/lib/genesis-concepts";

const WORKSPACE_ID = "0150243c-c33c-40d9-a780-dc41291d18f9";

async function main() {
  const db = createServerSupabase();
  const { data: jobs } = await db
    .from("image_jobs")
    .select("id, concept_number, name, cash_dna, ad_copy_primary, ad_copy_headline")
    .eq("workspace_id", WORKSPACE_ID)
    .contains("tags", ["matrix-2026-07-06"])
    .order("concept_number");

  for (const job of jobs ?? []) {
    const body: string = (job.ad_copy_primary as string[])?.[0] ?? "";
    const hook: string = (job.cash_dna as { hooks?: string[] })?.hooks?.[0] ?? body.split("\n")[0] ?? "";
    if (!body) {
      console.log(`#${job.concept_number} SKIP (no body)`);
      continue;
    }
    const headlines = await generateHeadlines(
      { productName: "Valpakademin", language: "Swedish", awarenessLevel: "Problem Aware" },
      hook,
      body,
    );
    // Fallback = the old junk (single clause). Only write if we got real ones.
    if (headlines.length < 2) {
      console.log(`#${job.concept_number} FALLBACK ONLY - kept old (${headlines[0]})`);
      continue;
    }
    await db.from("image_jobs").update({ ad_copy_headline: headlines }).eq("id", job.id);
    console.log(`#${job.concept_number} ${job.name?.slice(0, 40)}`);
    headlines.forEach((h) => console.log(`    - ${h}`));
  }
  console.log("DONE");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
