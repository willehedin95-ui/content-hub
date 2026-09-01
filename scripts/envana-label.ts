/**
 * Bränn in dag-etiketter + divider på de utvalda korten, via samma
 * post-production-modul som UI:t använder.
 *   npx tsx scripts/envana-label.ts
 */
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const IN = process.env.HOME + "/Downloads/envana-ALLA-before-after/URVAL 12";
const OUT = process.env.HOME + "/Downloads/envana-ALLA-before-after/URVAL 12 med etiketter";
const RUNNER = "/private/tmp/claude-501/-Users-williamhedin-Claude-Code/dabb60f3-6575-4148-bce2-1e0179af819f/scratchpad/pp/runner.html";
const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  process.env.HOME + "/.cache/puppeteer/chrome-headless-shell/mac_arm-146.0.7680.76/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  process.env.HOME + "/.cache/puppeteer/chrome-headless-shell/mac_arm-145.0.7632.67/chrome-headless-shell-mac-arm64/chrome-headless-shell",
];

// Tidsspann per kort. Zooki och Absolute varierar mellan 30 och 90 dagar,
// aldrig samma siffra pa alla korten.
const DAYS: Record<string, string> = {
  "1 Hals senor": "dag 90",
  "2 Ogonparti kraksparkar": "dag 60",
  "3 Harfaste bena": "dag 90",
  "4 Naglar": "dag 60",
  "5 Panna remsa": "dag 90",
  "6 Profil kaklinje": "dag 60",
  "7 Panna 46-50": "dag 45",
  "8 Ben och lar": "dag 90",
  "9 Helansikte MINIMAL": "dag 70",
  "10 Hander 66-70": "dag 90",
  "11 Ogonparti afrikansk": "dag 60",
  "12 Ogonparti MAN": "dag 30",
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const exe = CHROME.find((p) => existsSync(p));
  if (!exe) throw new Error("hittade ingen Chrome");
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto("file://" + resolve(RUNNER), { waitUntil: "load" });

  for (const [base, after] of Object.entries(DAYS)) {
    const src = [".jpg", ".png"].map((e) => join(IN, base + e)).find(existsSync);
    if (!src) { console.log(`  SAKNAS ${base}`); continue; }
    const dataUrl = `data:image/${src.endsWith(".png") ? "png" : "jpeg"};base64,` + readFileSync(src).toString("base64");
    const res = (await page.evaluate((d: { url: string; before: string; after: string }) =>
      (window as any).run(d.url, { before: d.before, after: d.after }),
      { url: dataUrl, before: "dag 0", after })) as { b64: string; w: number; h: number };
    const buf = Buffer.from(res.b64, "base64");
    writeFileSync(join(OUT, base + ".jpg"), buf);
    console.log(`  ${base.padEnd(26)} ${res.w}x${res.h}  dag 0 / ${after}  ${(buf.length/1024).toFixed(0)}KB`);
  }
  await browser.close();
  console.log(`\nklart -> ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
