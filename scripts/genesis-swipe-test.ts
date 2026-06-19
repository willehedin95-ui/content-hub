// Usage: npx tsx scripts/genesis-swipe-test.ts
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
} catch {
  process.exit(1);
}
import { swipeConceptWithGenesis } from "../src/lib/genesis-concepts";

const COMPETITOR = `I was about to give up on my joints. 52 years old and my knees sounded like a bowl of Rice Krispies every morning.
Then my physiotherapist told me the real reason wasn't "wear and tear" - it was a collagen the body stops making after 40.
I tried this Norwegian marine peptide and after 3 weeks I walked down the stairs without holding the railing for the first time in years.`;

async function main() {
  console.log("Swiping a competitor ad via Genesis...\n");
  const { proposal, tags, error } = await swipeConceptWithGenesis({
    competitorAdText: COMPETITOR,
    productName: "Hydro13 (marint kollagen, get-renew.com)",
    language: "Swedish",
    brandBrief: "Premium marint kollagen-drink, marina peptider, mätbar fasthet/fukt ~14 dagar. Hud-fokus, kvinnor 35-60.",
    guardAgainst: "the competitor brand name and 'knees/joints' (ours is skin-focused)",
  });

  if (error) { console.error("ERROR:", error); process.exit(1); }
  console.log("DNA tags:\n", tags?.slice(0, 400), "\n");
  console.log("=== SWIPED CONCEPT ===");
  console.log("name:", proposal!.concept_name);
  console.log("cash_dna:", JSON.stringify({ angle: proposal!.cash_dna.angle, awareness: proposal!.cash_dna.awareness_level, ad_source: proposal!.cash_dna.ad_source, copy_blocks: proposal!.cash_dna.copy_blocks }));
  console.log("body[0]:\n", proposal!.ad_copy_primary[0].slice(0, 1400));
  const valid = !!(proposal!.concept_name && proposal!.cash_dna?.angle && proposal!.ad_copy_primary?.length);
  console.log("\nstructurally valid:", valid);
}
main().catch((e) => { console.error(e); process.exit(1); });
