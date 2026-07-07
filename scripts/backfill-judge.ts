/**
 * Backfill judge_meta (score + issues) on existing concepts that only have the
 * judge:VERDICT tag - the reasoning was discarded before judge_meta was persisted.
 * Re-runs the judge on each concept's primary copy (a FRESH judgment, not the
 * original), stores judge_meta, and syncs the judge: tag to the fresh verdict so
 * the pill and the reason agree. Does NOT touch status. Idempotent (skips rows
 * that already have judge_meta). Default scope: doginwork.
 *
 *   npx tsx scripts/backfill-judge.ts
 */
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const m = line.match(/^([^#=][^=]*)=(.*)$/);
  if (m) {
    const k = m[1].trim();
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

import { createClient } from "@supabase/supabase-js";
import { judgeCopy } from "../src/lib/creative-judge";

const WS = process.env.BACKFILL_WS || "0150243c-c33c-40d9-a780-dc41291d18f9"; // doginwork
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function firstString(v: unknown): string {
  if (Array.isArray(v)) return v.find((x) => typeof x === "string" && x.trim()) ?? "";
  if (typeof v === "string") return v;
  return "";
}

async function main() {
  const { data: jobs, error } = await db
    .from("image_jobs")
    .select("id, name, ad_copy_primary, source_language, tags")
    .eq("workspace_id", WS)
    .is("judge_meta", null);
  if (error) throw error;

  const targets = (jobs ?? []).filter((j) =>
    (j.tags ?? []).some((t: string) => t.startsWith("judge:") && !t.startsWith("judge:PASS")),
  );
  console.log(`Found ${targets.length} concept(s) needing judge backfill (of ${jobs?.length ?? 0} without judge_meta).`);

  const tally: Record<string, number> = {};
  for (let i = 0; i < targets.length; i++) {
    const j = targets[i];
    const copy = firstString(j.ad_copy_primary);
    if (!copy) {
      console.log(`  [${i + 1}/${targets.length}] "${j.name}" - no copy, skipping`);
      continue;
    }
    try {
      const judge = await judgeCopy(copy, {
        language: j.source_language || "sv",
        productName: "valpakademin",
      });
      const oldTag = (j.tags ?? []).find((t: string) => t.startsWith("judge:")) ?? "judge:?";
      const newTag = `judge:${judge.verdict}${judge.rubricRan ? "" : "-norubric"}`;
      const tags = [...(j.tags ?? []).filter((t: string) => !t.startsWith("judge:")), newTag];
      const { error: upErr } = await db
        .from("image_jobs")
        .update({
          judge_meta: { score: judge.score, issues: judge.issues, rubricRan: judge.rubricRan },
          tags,
        })
        .eq("id", j.id);
      if (upErr) throw upErr;
      tally[judge.verdict] = (tally[judge.verdict] ?? 0) + 1;
      console.log(
        `  [${i + 1}/${targets.length}] "${j.name}" ${oldTag} -> ${newTag}  score=${judge.score}  issues=${judge.issues.length}`,
      );
    } catch (e) {
      console.error(`  [${i + 1}/${targets.length}] "${j.name}" FAILED:`, (e as Error).message);
    }
  }
  console.log("Done. Fresh verdicts:", tally);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
