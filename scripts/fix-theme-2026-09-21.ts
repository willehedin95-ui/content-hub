/**
 * Temaändringar från genomgången 2026-09-21 (SwedishBalance, Palo Alto 181711470915):
 *
 *  1. Norska marknaden serverade SVENSKA formulär - /no-no saknade helt
 *     kontext-mallar, så embedden ärvde `data-market="se"`.
 *  2. Danska returformuläret hade rubriken "Returformulär" med svenskt ä.
 *  3. Kollagengarantin låg kvar på Fillout.
 *
 * Kontext-mallar är per MARKNAD, inte per språk. Det är samma mekanism som
 * kontaktsidans danska rubrik redan använder. Den per-språkliga vägen
 * (Translate & Adapt) kräver scopet `write_translations` som appen inte har.
 *
 * MARKNADENS HANDLE ÄR `norge`, inte `norway`. Temat innehöll sedan tidigare
 * `page.contact.context.norway.json` med det norska Fillout-formuläret i - den
 * filen har aldrig varit aktiv, vilket är en del av förklaringen till att
 * norska kunder alltid fått svenska formulär. Mätt via markets-API:t
 * 2026-09-21: denmark / norge / se (finland finns men är avstängd).
 *
 *   npx tsx scripts/fix-theme-2026-09-21.ts          (torrkörning)
 *   npx tsx scripts/fix-theme-2026-09-21.ts --skarpt
 */
import * as fs from "fs";
import * as path from "path";
const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const STORE = "https://" + process.env.SHOPIFY_STORE_URL!.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const THEME = 181711470915;
const SKARPT = process.argv.includes("--skarpt");
const HUB = "https://content-hub-nine-theta.vercel.app/forms-embed/v1.js";

function embed(slug: string, market: string): string {
  return (
    `<div id="ch-form-${slug}"></div>` +
    `<script src="${HUB}" data-workspace="happysleep" data-form="${slug}" ` +
    `data-market="${market}" data-target="#ch-form-${slug}" defer></script>`
  );
}

async function token(): Promise<string> {
  const r = await fetch(`${STORE}/admin/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET }),
  });
  return (await r.json()).access_token;
}
async function las(t: string, key: string): Promise<string | null> {
  const r = await fetch(`${STORE}/admin/api/2024-01/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { "X-Shopify-Access-Token": t },
  });
  // En mall som inte finns svarar 404 med TOM body - r.json() kastar då.
  if (!r.ok) return null;
  const txt = await r.text();
  if (!txt) return null;
  return JSON.parse(txt).asset?.value ?? null;
}
async function skriv(t: string, key: string, value: string): Promise<void> {
  const r = await fetch(`${STORE}/admin/api/2024-01/themes/${THEME}/assets.json`, {
    method: "PUT", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": t },
    body: JSON.stringify({ asset: { key, value } }),
  });
  if (!r.ok) throw new Error(`${key}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}

// ---------------------------------------------------------------------------
// Norska kontext-mallar. Samma mönster som kontaktsidans danska: överskriv
// SAMMA sektions-id i föräldern, byt bara det som skiljer.
// ---------------------------------------------------------------------------
const NYA: Record<string, unknown> = {
  "templates/page.kontakta-oss.context.norge.json": {
    parent: "page.kontakta-oss.json",
    context: { market: "norge" },
    sections: {
      section_text_NHpdRx: {
        settings: {},
        blocks: { heading_7iBrMj: { settings: { text: "<p><em><strong>Kontakt oss</strong></em></p>" } } },
      },
      section_custom_html_NkrtCp: { settings: { custom_code: embed("kontakt", "no") }, blocks: {} },
    },
  },
  "templates/page.returformular.context.norge.json": {
    parent: "page.returformular.json",
    context: { market: "norge" },
    sections: {
      section_text_NHpdRx: {
        settings: {},
        blocks: { heading_7iBrMj: { settings: { text: "<p>Returskjema</p>" } } },
      },
      section_custom_html_CYUUKX: { settings: { custom_code: embed("retur", "no") }, blocks: {} },
    },
  },
  "templates/page.angra-kop.context.norge.json": {
    parent: "page.angra-kop.json",
    context: { market: "norge" },
    sections: {
      section_custom_html_4yDFYm: { settings: { custom_code: embed("angerratt", "no") }, blocks: {} },
    },
  },
};

async function main() {
  console.log(SKARPT ? "SKARP KÖRNING\n" : "TORRKÖRNING - inget skrivs\n");
  const t = await token();

  // --- 1. norska kontext-mallar ---
  for (const [key, body] of Object.entries(NYA)) {
    const fanns = await las(t, key);
    console.log(`${fanns ? "SKRIVS ÖVER" : "SKAPAS"}  ${key}`);
    if (SKARPT) await skriv(t, key, JSON.stringify(body, null, 2));
  }

  // --- 2. dansk rubrik på returformuläret ---
  const dkKey = "templates/page.returformular.context.denmark.json";
  const dkRaw = await las(t, dkKey);
  if (!dkRaw) {
    console.log(`SAKNAS  ${dkKey}`);
  } else {
    const dk = JSON.parse(dkRaw);
    dk.sections = dk.sections ?? {};
    // Rör INTE de befintliga sektionerna - den danska embedden ligger i en
    // egen sektion (section_custom_html_CBzMr) och den svenska är disabled.
    dk.sections.section_text_NHpdRx = {
      settings: {},
      blocks: { heading_7iBrMj: { settings: { text: "<p>Returformular</p>" } } },
    };
    console.log(`ÄNDRAS  ${dkKey}  (rubrik -> "Returformular")`);
    if (SKARPT) await skriv(t, dkKey, JSON.stringify(dk, null, 2));
  }

  // --- 3. kollagengarantin från Fillout till hubben ---
  const gKey = "templates/page.hydro13-ansokan-om-garant.json";
  const gRaw = await las(t, gKey);
  if (!gRaw) {
    console.log(`SAKNAS  ${gKey}`);
  } else {
    const g = JSON.parse(gRaw);
    const sekt = Object.entries(g.sections as Record<string, { type?: string; settings?: Record<string, string> }>)
      .find(([, v]) => typeof v.settings?.custom_code === "string" && /server\.fillout\.com/.test(v.settings.custom_code));
    if (!sekt) {
      console.log(`oförändrad  ${gKey}  (ingen Fillout-embed kvar)`);
    } else {
      sekt[1].settings!.custom_code = embed("garanti", "se");
      console.log(`ÄNDRAS  ${gKey}  (Fillout 9F7H4Zyfk3us -> hubben happysleep/garanti/se)`);
      if (SKARPT) await skriv(t, gKey, JSON.stringify(g, null, 2));
    }
  }

  console.log(SKARPT ? "\nKlart." : "\nTorrkörning klar.");
}

main().catch((e) => { console.error(e); process.exit(1); });
