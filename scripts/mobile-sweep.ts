/**
 * Matter varje skarm i progressbildsresan pa en telefon och rapporterar det
 * som INTE gar att se i en screenshot: sidledsscroll, element utanfor skarmen,
 * tryckytor under 44 px och text under 12 px.
 *
 * Finns for att "jag tittade pa den i mobilvy" inte ar en matning. Mailen sag
 * korrekta ut i en screenshot medan de spillde over med 234 px.
 *
 *   npx tsx scripts/mobile-sweep.ts
 */
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  process.env.HOME + "/.cache/puppeteer/chrome-headless-shell/mac_arm-146.0.7680.76/chrome-headless-shell-mac-arm64/chrome-headless-shell",
].find((p) => existsSync(p));

const BAS = "http://localhost:3000";
const SIDOR: { namn: string; url: string; steg?: number }[] = [
  { namn: "mail: kvittens", url: BAS + "/mailpreview/kvittens.preview.html" },
  { namn: "mail: paminnelse", url: BAS + "/mailpreview/paminnelse.preview.html" },
  { namn: "mail: slutmail", url: BAS + "/mailpreview/slutmail.preview.html" },
  { namn: "formular dag 1", url: BAS + "/f/hydro13/progressbild?steg=1", steg: 4 },
  { namn: "formular dag 30", url: BAS + "/f/hydro13/progressbild?steg=2&e=a%40b.se", steg: 4 },
  { namn: "formular dag 60", url: BAS + "/f/hydro13/progressbild?steg=3&e=a%40b.se", steg: 4 },
  { namn: "samtycke", url: BAS + "/f/hydro13/samtycke?e=a%40b.se", steg: 2 },
];

// iPhone SE ar den smalaste telefonen som fortfarande anvands i volym. Ryms
// det dar ryms det overallt.
const BREDDER = [375, 390];

/** Medvetna avsteg. Utan dem lyser svepet rott varje korning, och en grind som
 *  alltid ar rod slutar man titta pa. Varje rad ska ha ett SKAL. */
const UNDANTAG: { motiv: string; test: (f: string) => boolean }[] = [
  {
    motiv: "PRESENTKORT/ENVANA ar text INUTI kortgrafiken, inte lasbar brodtext. Ett riktigt presentkort har samma lilla tryck.",
    test: (f) => /text 11px: "(PRESENTKORT|ENVANA)"/.test(f),
  },
  {
    motiv: "mailto-adressen ar en lank i lopande text, inte en knapp. Att ge den 44 px hojd skulle spranga stycket den star i.",
    test: (f) => /tryckyta \d+px: "support@shopenvana.com"/.test(f),
  },
];

async function main() {
  if (!CHROME) throw new Error("hittade ingen Chrome");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  let problem = 0;

  for (const bredd of BREDDER) {
    console.log(`\n=== ${bredd} px ===`);
    for (const sida of SIDOR) {
      const page = await browser.newPage();
      await page.setViewport({ width: bredd, height: 812 });
      await page.goto(sida.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 400));

      const antalSteg = sida.steg ?? 1;
      for (let i = 0; i < antalSteg; i++) {
        const fynd = await page.evaluate(() => {
          const d = document.documentElement;
          const vw = d.clientWidth;
          const ut: string[] = [];
          if (d.scrollWidth > vw + 1) ut.push(`sidledsscroll: ${d.scrollWidth} mot ${vw}`);
          document.querySelectorAll("button, a, input, textarea, select").forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return;
            // Honeypot ligger AVSIKTLIGT utanfor skarmen - den ska botar hitta,
            // inte manniskor. Samma for det dolda laddningsmeddelandet.
            if (el.closest(".chf-hp, .chf-loading")) return;
            // Ligger kontrollen i en <label> ar det LABELN som ar tryckytan -
            // ett klick var som helst pa den togglar. Matt: 350x135, inte
            // kryssrutans 20x20.
            const lab = el.closest("label");
            const yta = lab ? lab.getBoundingClientRect() : r;
            const txt = (el.textContent || (el as HTMLInputElement).placeholder || el.tagName).trim().slice(0, 26);
            if (yta.height < 44) ut.push(`tryckyta ${Math.round(yta.height)}px: "${txt}"`);
            if (r.right > vw + 1 || r.left < -1) ut.push(`utanfor skarmen: "${txt}"`);
          });
          document.querySelectorAll("p, span, div, td, label, b").forEach((el) => {
            if (!el.childNodes.length || el.children.length) return;
            const t = (el.textContent || "").trim();
            if (t.length < 4) return;
            const fs = parseFloat(getComputedStyle(el).fontSize);
            if (fs && fs < 12) ut.push(`text ${fs}px: "${t.slice(0, 26)}"`);
          });
          const hojd = d.scrollHeight;
          return { ut: [...new Set(ut)], hojd, vh: window.innerHeight };
        });

        const etikett = antalSteg > 1 ? `${sida.namn} steg ${i + 1}` : sida.namn;
        fynd.ut = fynd.ut.filter((f) => !UNDANTAG.some((u) => u.test(f)));
        const scroll = fynd.hojd > fynd.vh + 8 ? ` (kraver scroll: ${fynd.hojd}px)` : "";
        if (fynd.ut.length) {
          problem += fynd.ut.length;
          console.log(`  ${etikett}${scroll}`);
          fynd.ut.forEach((f) => console.log(`      - ${f}`));
        } else {
          console.log(`  ${etikett}${scroll}  ok`);
        }

        if (i < antalSteg - 1) {
          const gick = await page.evaluate((idx) => {
            const step = document.querySelector(`[data-step="${idx}"]`);
            const inp = step?.querySelector('input[type=email]') as HTMLInputElement | null;
            if (inp && !inp.value) { inp.value = "a@b.se"; inp.dispatchEvent(new Event("input", { bubbles: true })); }
            const cb = step?.querySelector('input[type=checkbox]') as HTMLInputElement | null;
            if (cb) { cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); }
            const btn = step?.querySelector(".chf-submit") as HTMLButtonElement | null;
            if (!btn) return false;
            btn.click();
            return true;
          }, i);
          if (!gick) break;
          await new Promise((r) => setTimeout(r, 450));
        }
      }
      await page.close();
    }
  }
  await browser.close();
  console.log(`\n${problem === 0 ? "INGA PROBLEM" : problem + " problem hittade"}`);
  if (UNDANTAG.length) {
    console.log("\nMedvetna avsteg (filtrerade):");
    UNDANTAG.forEach((u) => console.log("  - " + u.motiv));
  }
  process.exit(problem === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
