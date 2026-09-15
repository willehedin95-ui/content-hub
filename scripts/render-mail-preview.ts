/**
 * Renderar mailmallarnas preview-utfall till PNG sa de gar att TITTA pa.
 *
 * En mailmall gar inte att bedoma som HTML-kall. Den ska granskas som bild,
 * i den bredd den faktiskt lases (600 px innehall pa desktop, ~390 pa mobil).
 *
 *   npx tsx scripts/render-mail-preview.ts
 */
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  process.env.HOME + "/.cache/puppeteer/chrome-headless-shell/mac_arm-146.0.7680.76/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  process.env.HOME + "/.cache/puppeteer/chrome-headless-shell/mac_arm-145.0.7632.67/chrome-headless-shell-mac-arm64/chrome-headless-shell",
];

const SRC = resolve("public/mailpreview");
const OUT = process.argv[2] ?? resolve("public/mailpreview/_png");

async function main() {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error("hittade ingen Chrome-binar");
  mkdirSync(OUT, { recursive: true });

  const files = readdirSync(SRC).filter((f) => f.endsWith(".preview.html"));
  if (!files.length) throw new Error("inga preview-mallar i " + SRC);

  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  for (const file of files) {
    for (const [label, width] of [["desktop", 680], ["mobil", 390]] as const) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900, deviceScaleFactor: 2 });
      await page.goto("file://" + resolve(SRC, file), { waitUntil: "networkidle0" });
      const name = file.replace(".preview.html", "") + "-" + label + ".png";
      await page.screenshot({ path: resolve(OUT, name), fullPage: true });
      console.log("renderade", name);
      await page.close();
    }
  }
  await browser.close();
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
