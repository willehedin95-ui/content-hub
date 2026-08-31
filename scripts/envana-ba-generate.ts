/**
 * Generate Before/After images for the Envana PDP transformation section.
 *
 * The /assets Before/After tool is hardcoded to 16:9 (two near-square halves
 * side by side). The Envana PDP cards are 1:1 with 1:2 portrait halves, so this
 * script drives the same prompt logic at a configurable aspect ratio.
 *
 * The prompt logic lives inside the API route and cannot be imported (Next.js
 * route files may only export HTTP handlers), so the pure part of the module is
 * extracted to a temp file at run time and removed afterwards.
 *
 *   npx tsx scripts/envana-ba-generate.ts --plan sample
 *   npx tsx scripts/envana-ba-generate.ts --plan full
 */
process.loadEnvFile?.(".env.local");

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createImageTask, pollTaskResult } from "../src/lib/kie";

const ROUTE = "src/app/api/assets/before-after/route.ts";
const TMP = "src/app/api/assets/before-after/_envana-prompt.tmp.ts";
const OUT = "/private/tmp/claude-501/-Users-williamhedin-Claude-Code/dabb60f3-6575-4148-bce2-1e0179af819f/scratchpad/envana-ba";

// 1:1 output => each half is 1:2 portrait, matching the existing Envana cards.
const ASPECT = process.argv.includes("--aspect")
  ? process.argv[process.argv.indexOf("--aspect") + 1]
  : "16:9";
const RESOLUTION = "1K";
const MODEL = process.argv.includes("--model")
  ? process.argv[process.argv.indexOf("--model") + 1]
  : "nano-banana-2";

type Shot = {
  id: string;
  zoneKey: string;
  gender: "woman" | "man";
  age: string;
  ethnicity?: string;
  intensity: "subtle" | "moderate" | "dramatic";
  cameraAngle?: string;
  label: string;
};

// 12 cards. Zone mix follows the competitor benchmark: eyes/forehead are the
// biggest zone in the category, hair is second and we had none, neck and nails
// were missing entirely. Card 12 is deliberately a non-transformation.
const PLAN: Shot[] = [
  { id: "m-eye", zoneKey: "eye_area", gender: "woman", age: "56-60", intensity: "moderate", cameraAngle: "tight_crop", label: "Ogonparti" },
  { id: "m-neck", zoneKey: "neck_decolletage", gender: "woman", age: "61-65", intensity: "moderate", cameraAngle: "head_on", label: "Hals" },
];

const SAMPLE_IDS = ["05-neck"];

function extractPromptLogic() {
  const py = `
import re
src = open(${JSON.stringify(ROUTE)}, encoding="utf-8").read()
head = src[:src.index("export async function POST")]
for pat in [
    r'import \\{ NextRequest, NextResponse \\} from "next/server";',
    r'import Anthropic from "@anthropic-ai/sdk";',
    r'import \\{ createServerSupabase \\} from "@/lib/supabase-admin";',
    r'import \\{ CLAUDE_MODEL \\} from "@/lib/constants";',
    r'import \\{ calcClaudeCost, KIE_IMAGE_COST \\} from "@/lib/pricing";',
    r'import \\{ createImageTask, pollTaskResult \\} from "@/lib/kie";',
]:
    head = re.sub(pat, "", head)
head = head.replace("client: Anthropic", "client: any").replace("Anthropic.Messages.Usage", "any")
head += "\\nexport { buildPrompt, randomDemographic, BODY_ZONE_PRESETS };\\n"
open(${JSON.stringify(TMP)}, "w").write(head)
`;
  execFileSync("python3", ["-c", py], { stdio: "inherit" });
}

async function main() {
  const planArg = process.argv.includes("--plan")
    ? process.argv[process.argv.indexOf("--plan") + 1]
    : "sample";
  let shots = planArg === "full" ? PLAN : PLAN.filter((s) => SAMPLE_IDS.includes(s.id));

  mkdirSync(OUT, { recursive: true });
  // Don't pay twice for shots already rendered in an earlier run.
  if (process.argv.includes("--skip-existing")) {
    shots = shots.filter((s) => !existsSync(join(OUT, `${s.id}.png`)));
  }
  extractPromptLogic();

  // Indirect specifier on purpose: the temp module only exists while this
  // script runs, so a literal import path would fail `npm run build`.
  const tmpSpecifier = "../src/app/api/assets/before-after/_envana-prompt.tmp";
  const mod = (await import(tmpSpecifier)) as any;
  const { buildPrompt, randomDemographic, BODY_ZONE_PRESETS } = mod;
  if (!buildPrompt || !BODY_ZONE_PRESETS) throw new Error("prompt-extraktionen misslyckades");

  console.log(`Plan: ${planArg} (${shots.length} bilder), format ${ASPECT} @ ${RESOLUTION}`);
  console.log(`Uppskattad kostnad: $${(shots.length * 0.06).toFixed(2)}\n`);

  const results: { id: string; label: string; file: string | null; error?: string }[] = [];

  for (const shot of shots) {
    const demographic = randomDemographic({
      gender: shot.gender,
      age: shot.age,
      ethnicity: shot.ethnicity as never,
    });
    const zone = BODY_ZONE_PRESETS[shot.zoneKey] ?? shot.zoneKey;
    const prompt = buildPrompt({
      zone,
      zoneKey: shot.zoneKey,
      demographic,
      intensity: shot.intensity,
      vision: null,
      hasSource: false,
      cameraAngle: shot.cameraAngle,
    });

    process.stdout.write(`  ${shot.id.padEnd(13)} ${shot.label.padEnd(30)} `);
    try {
      const taskId = await createImageTask(prompt, [], ASPECT, RESOLUTION, MODEL);
      const { urls } = await pollTaskResult(taskId);
      if (!urls.length) throw new Error("inga bilder tillbaka");
      const res = await fetch(urls[0]);
      const buf = Buffer.from(await res.arrayBuffer());
      const suffix = process.argv.includes("--suffix") ? process.argv[process.argv.indexOf("--suffix") + 1] : "";
      const file = join(OUT, `${shot.id}${suffix}.png`);
      writeFileSync(file, buf);
      results.push({ id: shot.id, label: shot.label, file });
      console.log(`OK  ${(buf.length / 1024).toFixed(0)} KB`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: shot.id, label: shot.label, file: null, error: msg });
      console.log(`FEL ${msg}`);
    }
  }

  rmSync(TMP, { force: true });
  const ok = results.filter((r) => r.file).length;
  console.log(`\n${ok}/${results.length} genererade -> ${OUT}`);
  for (const r of results.filter((r) => !r.file)) console.log(`  FEL ${r.id}: ${r.error}`);
}

main().catch((e) => {
  rmSync(TMP, { force: true });
  console.error(e);
  process.exit(1);
});
