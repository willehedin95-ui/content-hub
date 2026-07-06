// Usage: npx tsx scripts/backfill-page-thumbnails.ts [--limit N]
// Renders thumbnails for every page missing one (published URL when available, otherwise the
// stored HTML via Puppeteer setContent). Local Chrome, resumable (skips pages with a thumbnail).

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
import { renderPageThumbnail } from "../src/lib/page-screenshot";

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 200;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: pages } = await db
    .from("pages")
    .select("id, name, product")
    .is("thumbnail_url", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  console.log(`${pages?.length ?? 0} pages missing thumbnails`);
  let ok = 0, failed = 0;
  for (const p of pages ?? []) {
    const t0 = Date.now();
    const result = await renderPageThumbnail(p.id);
    if ("error" in result) {
      failed++;
      console.log(`  FAIL ${p.name.slice(0, 50)} (${p.product}): ${result.error.slice(0, 80)}`);
    } else {
      ok++;
      console.log(`  ✓ ${p.name.slice(0, 50)} (${p.product}) [${result.method}] (${Math.round((Date.now() - t0) / 1000)}s)`);
    }
  }
  console.log(`\nDone: ${ok} rendered, ${failed} failed.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
