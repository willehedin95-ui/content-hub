/**
 * Archive concepts #15-#18 (Hydro13) that were pushed with broken image
 * translations on 2026-04-07. Sets status=archived and launchpad_priority=null
 * so they can't accidentally be re-pushed by the pipeline cron.
 *
 * Bugs the concepts contained:
 *   - #15: (verified OK on final inspection - included out of caution)
 *   - #16: byte-identical passthrough (English text unchanged on 4:5)
 *   - #17: VATTEN 13 / Förnya brand-name translation hallucination
 *   - #18: €80 serum price baked into overlay text
 *
 * Safe to re-run: idempotent.
 */

import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

import { createClient } from "@supabase/supabase-js";

const JOB_IDS = [
  "0b0e478c-e9d5-45ea-8c28-3a6081c4519e", // #15
  "36de5ca3-579b-4480-9c0d-0348d5a3b234", // #16
  "27a4ee5d-2c0e-488e-b430-38a7837ab2fd", // #17
  "c6e71a18-7d40-42e0-9a67-d9858808d156", // #18
];

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  for (const id of JOB_IDS) {
    const { data: before, error: beforeErr } = await db
      .from("image_jobs")
      .select("id, concept_number, name, status, launchpad_priority, archived_at")
      .eq("id", id)
      .single();

    if (beforeErr || !before) {
      console.error(`[${id}] NOT FOUND: ${beforeErr?.message}`);
      continue;
    }

    console.log(
      `[#${before.concept_number} ${before.name}] before: status=${before.status} priority=${before.launchpad_priority} archived=${before.archived_at}`
    );

    // Set both archived_at AND status=archived so /review/pending and
    // pipeline-push both filter it out. See memory note in CLAUDE.md /
    // MEMORY.md about rejectConceptAction doing the same.
    const { error: updErr } = await db
      .from("image_jobs")
      .update({
        status: "archived",
        archived_at: new Date().toISOString(),
        launchpad_priority: null,
      })
      .eq("id", id);

    if (updErr) {
      console.error(`  FAILED: ${updErr.message}`);
      continue;
    }

    // Also null out per-market launchpad priorities so pipeline-push can't
    // find it through image_job_markets either.
    await db
      .from("image_job_markets")
      .update({ launchpad_priority: null })
      .eq("image_job_id", id);

    // Close any open concept_lifecycle entries so they don't look active.
    const { data: marketRows } = await db
      .from("image_job_markets")
      .select("id")
      .eq("image_job_id", id);
    const marketIds = (marketRows ?? []).map((m: { id: string }) => m.id);
    if (marketIds.length > 0) {
      await db
        .from("concept_lifecycle")
        .update({ exited_at: new Date().toISOString() })
        .in("image_job_market_id", marketIds)
        .is("exited_at", null);
    }

    console.log(`  ARCHIVED`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
