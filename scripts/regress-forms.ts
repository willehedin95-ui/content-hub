/**
 * Regressionskoll av ALLA publicerade formular fore en produktionsdeploy.
 *
 * Progressbildsarbetet rorde generell kod som varje formular gar igenom:
 * stegvaxlingen (nextVisibleStep), vilket steg render() startar pa, och
 * knappetiketten. Angerratten ar tvastegs och lagstadgad - den far inte ta
 * skada av att progressbild fick en karusell.
 */
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

// Samma kandidatlista som de andra skripten. Google Chrome finns inte pa den
// har maskinen - bara puppeteers headless-shell.
const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  process.env.HOME + "/.cache/puppeteer/chrome-headless-shell/mac_arm-146.0.7680.76/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  process.env.HOME + "/.cache/puppeteer/chrome-headless-shell/mac_arm-145.0.7632.67/chrome-headless-shell-mac-arm64/chrome-headless-shell",
].find(existsSync)!;
const BAS = "http://localhost:3000";

// Workspace MASTE staa med. DK-formularen ligger under happysleep, inte
// hydro13, och utan det testade jag /f/hydro13/kontakt?market=dk - som inte
// finns, och rapporterade tre falska regressioner.
const FORMULAR = [
  { ws: "hydro13", slug: "kontakt", market: "se" },
  { ws: "hydro13", slug: "retur", market: "se" },
  { ws: "hydro13", slug: "garanti", market: "se" },
  { ws: "hydro13", slug: "angerratt", market: "se" },
  { ws: "hydro13", slug: "samtycke", market: "se" },
  { ws: "hydro13", slug: "progressbild", market: "se" },
  { ws: "happysleep", slug: "kontakt", market: "se" },
  { ws: "happysleep", slug: "kontakt", market: "dk" },
  { ws: "happysleep", slug: "retur", market: "se" },
  { ws: "happysleep", slug: "retur", market: "dk" },
  { ws: "happysleep", slug: "angerratt", market: "se" },
  { ws: "happysleep", slug: "angerratt", market: "dk" },
];

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  let fel = 0;
  for (const f of FORMULAR) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    const konsolfel: string[] = [];
    page.on("pageerror", (e: unknown) => konsolfel.push(String((e as Error)?.message ?? e).slice(0, 90)));
    await page.goto(`${BAS}/f/${f.ws}/${f.slug}?market=${f.market}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2200));

    const res = await page.evaluate(() => {
      const root = document.querySelector(".chf-root");
      const steg = [...document.querySelectorAll("[data-step]")];
      const synligt = steg.filter((s) => (s as HTMLElement).style.display !== "none");
      const knapp = synligt[0]?.querySelector(".chf-submit");
      return {
        renderade: !!root && root.children.length > 0,
        antalSteg: steg.length,
        synligaSteg: synligt.length,
        knapptext: knapp?.textContent ?? null,
        // Ett falt utan varde far ALDRIG visa en kvarglomd {{platshallare}}.
        platshallareKvar: /\{\{/.test(document.body.innerText),
      };
    });
    const trasigt = !res.renderade || res.synligaSteg !== 1 || !res.knapptext || res.platshallareKvar || konsolfel.length > 0;
    if (trasigt) fel++;
    console.log(
      `  ${trasigt ? "TRASIGT" : "ok     "} ${f.ws}/${f.slug}/${f.market}  steg=${res.antalSteg} synliga=${res.synligaSteg} knapp="${res.knapptext}"` +
      (res.platshallareKvar ? " PLATSHALLARE-KVAR" : "") + (konsolfel.length ? ` JS-FEL: ${konsolfel[0]}` : "")
    );
    await page.close();
  }
  await browser.close();
  console.log(fel === 0 ? "\nALLA FORMULAR RENDERAR" : `\n${fel} formular trasiga`);
  process.exit(fel === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
