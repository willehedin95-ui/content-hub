/**
 * Run the Content Hub post-production pipeline over generated Before/After
 * images, headlessly.
 *
 * The pipeline in src/lib/post-production.ts is Canvas API code and cannot run
 * in Node, so instead of reimplementing it (which would drift from what the UI
 * produces) this drives the real module inside a headless Chromium via a
 * bundle built by esbuild.
 *
 * Applies the "Subtle" preset plus the vertical divider, i.e. exactly what the
 * UI does when you tick Enable, pick Subtle and turn the divider on.
 *
 *   npx tsx scripts/envana-postprod.ts <in-dir> <out-dir>
 */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

// puppeteer-core ships no browser. Use whatever Chrome is already on this
// machine, same list the project's own scrapers fall back through.
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  process.env.HOME + "/.cache/puppeteer/chrome-headless-shell/mac_arm-146.0.7680.76/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  process.env.HOME + "/.cache/puppeteer/chrome-headless-shell/mac_arm-145.0.7632.67/chrome-headless-shell-mac-arm64/chrome-headless-shell",
];
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const IN = process.argv[2];
const OUT = process.argv[3];
const RUNNER = process.argv[4] ?? "/private/tmp/claude-501/-Users-williamhedin-Claude-Code/dabb60f3-6575-4148-bce2-1e0179af819f/scratchpad/pp/runner.html";
if (!IN || !OUT) { console.error("ange in-dir och out-dir"); process.exit(1); }

async function main() {
  mkdirSync(OUT, { recursive: true });
  const files = readdirSync(IN).filter((f) => f.endsWith(".png") && !f.startsWith("_"));
  if (!files.length) { console.error("inga png i " + IN); process.exit(1); }

  const exe = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error("hittade ingen Chrome-binar - kolla CHROME_CANDIDATES");
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto("file://" + resolve(RUNNER), { waitUntil: "load" });
  const ready = await page.evaluate(() => typeof (window as any).run === "function" && !!(window as any).PP);
  if (!ready) throw new Error("runner-sidan laddade inte post-production-bundlen");

  console.log(`${files.length} bilder, Subtle + vertikal divider\n`);
  for (const f of files) {
    const raw = readFileSync(join(IN, f));
    const dataUrl = "data:image/png;base64," + raw.toString("base64");
    const res = (await page.evaluate((d: string) => (window as any).run(d), dataUrl)) as { b64: string; type: string; w: number; h: number };
    const outBuf = Buffer.from(res.b64, "base64");
    const outName = f.replace(/\.png$/, ".jpg");
    writeFileSync(join(OUT, outName), outBuf);
    const pct = Math.round((outBuf.length / raw.length) * 100);
    console.log(`  ${f.padEnd(26)} ${res.w}x${res.h}  ${(raw.length/1024/1024).toFixed(1)}MB -> ${(outBuf.length/1024).toFixed(0)}KB (${pct}%)  ${res.type}`);
  }
  await browser.close();
  console.log(`\nklart -> ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
