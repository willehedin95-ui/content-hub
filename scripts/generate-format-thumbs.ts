// Usage: npx tsx scripts/generate-format-thumbs.ts [--only <botId>] [--force]
// One-time batch: for every Genesis image-format bot, generate ONE example thumbnail
// (bot writes 1 prompt for Hydro13 -> 1 KIE render -> upload to Supabase storage at
// genesis-format-thumbs/<botId>.png). The format picker shows these so you can see what each
// format roughly produces. Skips bots that already have a thumbnail unless --force.
// Sequential (Genesis 1-concurrent limit) - expect ~45-60 min for the full roster.

import { readFileSync } from "fs";
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

import { createClient } from "@supabase/supabase-js";
import { callGenesisBot } from "../src/lib/genesis";
import { generateImage } from "../src/lib/kie";
import { STORAGE_BUCKET } from "../src/lib/constants";

const THUMB_DIR = "genesis-format-thumbs";
const EXAMPLE = [
  `Ad copy:\nDu äter rätt, tränar och sover - men spegeln visar en trött hy. Efter 40 tappar kroppen kollagen varje år. Hydro13 ger huden marina kollagenpeptider inifrån - märkbar fasthet på ca 14 dagar.`,
  `Product visual (must match exactly): tall sleek WHITE 500ml plastic bottle, white screw cap, label "HYDRO13" with "Beauty Collagen Formula", tiny 30ml clear espresso-size glass with golden honey-colored liquid.`,
  ``,
  `Generate 1 static ad image concept in YOUR format for this ad: a complete, ready-to-render image-generation prompt. Output ONLY the prompt, no numbering, no preamble.`,
  `Any text in the image MUST be exact natural Swedish with correct å ä ö. Never invent product claims, flavors or figures.`,
].join("\n");

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const force = process.argv.includes("--force");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Live roster -> Image Prompts bots
  const res = await fetch(`${(process.env.GENESIS_BASE_URL || "https://gas.copycoders.ai/api/v1").replace(/\/+$/, "")}/models`, {
    headers: { Authorization: `Bearer ${process.env.GENESIS_API_KEY}` },
  });
  const json = (await res.json()) as { data?: Array<{ id: string; _genesis?: { category?: string; name?: string } }> };
  let bots = (json.data || []).filter((r) => (r._genesis?.category || "").toLowerCase() === "image prompts");
  if (only) bots = bots.filter((b) => b.id === only);
  console.log(`${bots.length} format bots to process`);

  // Existing thumbs (skip unless --force)
  const { data: existing } = await db.storage.from(STORAGE_BUCKET).list(THUMB_DIR, { limit: 200 });
  const have = new Set((existing ?? []).map((f) => f.name.replace(/\.png$/, "")));

  let done = 0, skipped = 0, failed = 0;
  for (const bot of bots) {
    if (!force && have.has(bot.id)) { skipped++; continue; }
    const t0 = Date.now();
    try {
      const prompt = (await callGenesisBot(bot.id, EXAMPLE, { maxTokens: 1500 }))
        .replace(/```[a-z]*/gi, "").replace(/\*+/g, "").trim();
      if (prompt.length < 40) throw new Error("prompt too short");
      const { urls } = await generateImage(prompt.slice(0, 4000), [], "1:1", "1K");
      if (!urls?.length) throw new Error("no image");
      const img = await fetch(urls[0]);
      const buffer = Buffer.from(await img.arrayBuffer());
      const { error } = await db.storage.from(STORAGE_BUCKET).upload(`${THUMB_DIR}/${bot.id}.png`, buffer, {
        contentType: "image/png",
        upsert: true,
      });
      if (error) throw new Error(error.message);
      done++;
      console.log(`[${done + skipped + failed}/${bots.length}] ${bot.id} ✓ (${Math.round((Date.now() - t0) / 1000)}s)`);
    } catch (e) {
      failed++;
      console.log(`[${done + skipped + failed}/${bots.length}] ${bot.id} FAILED: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  console.log(`\nDone: ${done} generated, ${skipped} skipped (already had thumb), ${failed} failed.`);
  console.log(`Re-run the script to retry failures (it skips completed ones).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
