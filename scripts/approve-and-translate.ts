#!/usr/bin/env npx tsx
/**
 * Approve concepts and trigger autopilot translations for them.
 * Usage: npx tsx scripts/approve-and-translate.ts <conceptId1> <conceptId2> ...
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

async function main() {
  const conceptIds = process.argv.slice(2);
  if (conceptIds.length === 0) {
    console.error("Usage: npx tsx scripts/approve-and-translate.ts <conceptId1> ...");
    process.exit(1);
  }

  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const { approveConceptAction } = await import("../src/lib/approval-actions");
  const { triggerAutopilotTranslations } = await import("../src/lib/autopilot-translations");

  const db = createServerSupabase();

  for (const conceptId of conceptIds) {
    console.log(`\n=== Processing ${conceptId} ===`);

    // First make sure status is "ready" so approveConceptAction works
    const { data: job } = await db
      .from("image_jobs")
      .select("id, concept_number, name, status, launchpad_priority")
      .eq("id", conceptId)
      .single();

    if (!job) {
      console.error(`  Concept not found: ${conceptId}`);
      continue;
    }

    console.log(`  #${job.concept_number} "${job.name}" (status=${job.status})`);

    if (job.status === "draft") {
      console.log(`  Promoting draft -> ready`);
      await db.from("image_jobs").update({
        status: "ready",
        updated_at: new Date().toISOString(),
      }).eq("id", conceptId);
    }

    if (job.launchpad_priority == null) {
      console.log(`  Approving concept...`);
      const result = await approveConceptAction(conceptId, "manual_script");
      if (!result.ok) {
        console.error(`  ✗ Approval failed: ${result.error}`);
        continue;
      }
      console.log(`  ✓ Approved (markets: ${result.markets})`);
    } else {
      console.log(`  Already approved (priority=${job.launchpad_priority})`);
    }

    // Trigger translations
    console.log(`  Triggering translations...`);
    try {
      const tResult = await triggerAutopilotTranslations(conceptId);
      console.log(`  ✓ Translations triggered:`, tResult);
    } catch (err) {
      console.error(`  ✗ Translation trigger failed:`, err);
    }
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
