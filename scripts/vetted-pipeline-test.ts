// Usage: npx tsx scripts/vetted-pipeline-test.ts
// End-to-end capstone: standing rules -> generate (Genesis) -> judge -> regenerate REJECTs.
import { readFileSync } from "fs";
try {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
} catch { process.exit(1); }

import { generateVettedConcepts } from "../src/lib/genesis-pipeline";

async function main() {
  console.log("Generating 2 VETTED concepts (generate -> judge -> regen)...\n");

  const { vetted, rejected, errors } = await generateVettedConcepts(
    {
      productName: "Hydro13 (marint kollagen)",
      language: "Swedish",
      brandBrief: "Premium marint kollagen-drink, marina peptider, mätbar fasthet/fukt ~14 dagar.",
      segmentNote: "Kvinnor 45-60 som gör allt rätt men ser huden förändras",
      awarenessLevel: "Problem Aware",
      angle: "Root Cause",
      count: 2,
    },
    { rules: ["Never use the English word 'boost'.", "Never include prices."], judge: true },
  );

  if (errors.length) console.log("errors:", errors, "\n");
  console.log(`VETTED: ${vetted.length} | REJECTED: ${rejected.length}\n`);
  for (const v of [...vetted, ...rejected]) {
    console.log(`- "${v.proposal.concept_name}" :: ${v.judge.verdict} (score ${v.judge.score})${v.regenerated ? " [regenerated]" : ""}`);
    if (v.judge.issues.length) console.log("    issues:", v.judge.issues.map((i) => `${i.type}(${i.quote})`).join(", "));
  }
  console.log("\nall vetted are not REJECT:", vetted.every((v) => v.judge.verdict !== "REJECT"));
}
main().catch((e) => { console.error(e); process.exit(1); });
