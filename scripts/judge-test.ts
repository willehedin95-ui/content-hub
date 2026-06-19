// Usage: npx tsx scripts/judge-test.ts
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
import { judgeCopy, deterministicChecks } from "../src/lib/creative-judge";

const BAD = `Din hud satisfies inte av ännu en burk. Din nattserum når inte djupare än ytan. Spara 200 kr idag — boost din glow på 14 dagar.`;
const GOOD = `Hon tränar fem dagar i veckan, äter rent och sover åtta timmar... men spegeln visar en annan person. Det är inte bristande disciplin. Efter 40 tappar kroppen sitt eget kollagen, ungefär en procent per år, och ingen kräm i världen kan bygga upp det inifrån.`;

async function main() {
  console.log("=== deterministic-only on BAD copy ===");
  console.log(deterministicChecks(BAD, { language: "Swedish" }));

  console.log("\n=== full judge: BAD copy ===");
  const bad = await judgeCopy(BAD, { language: "Swedish", productName: "Hydro13" });
  console.log("verdict:", bad.verdict, "| score:", bad.score, "| blocked:", bad.blocked);
  bad.issues.forEach((i) => console.log(`  [${i.severity}] ${i.type}: "${i.quote}" -> ${i.fix}`));

  console.log("\n=== full judge: GOOD copy ===");
  const good = await judgeCopy(GOOD, { language: "Swedish", productName: "Hydro13" });
  console.log("verdict:", good.verdict, "| score:", good.score, "| blocked:", good.blocked);
  good.issues.forEach((i) => console.log(`  [${i.severity}] ${i.type}: "${i.quote}" -> ${i.fix}`));

  const ok = bad.verdict === "REJECT" && good.verdict !== "REJECT";
  console.log("\n" + (ok ? "Judge works: BAD rejected, GOOD not rejected ✓" : "UNEXPECTED verdicts"));
}
main().catch((e) => { console.error(e); process.exit(1); });
