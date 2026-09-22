/**
 * Jamfor de byggda mailmallarna med det FLODENA FAKTISKT SKICKAR.
 *
 * Bakgrund: Klaviyo KLONAR mallen nar ett flode skapas, och flodet pekar sedan
 * pa klonen. `upload-klaviyo-templates.ts` uppdaterar originalet och sager
 * "uppdaterad" - medan kunderna fortsatter fa den gamla texten. 2026-09-22
 * ledde det till ett felaktigt pastaende om att ordet "presentkort" var borta
 * ur flodet, nar bade slutmailet och paminnelsen fortfarande sa det.
 *
 * Klonen gar INTE att uppdatera via API. GET pa den svarar 200, PATCH svarar
 * 404 ("does not exist") - mattt 2026-09-22. Enda vagen ar att bygga om flodet.
 * Darfor RAPPORTERAR det har skriptet drift i stallet for att forsoka fixa den.
 *
 *   npx tsx scripts/check-klaviyo-flow-templates.ts
 *
 * Avslutar med kod 1 om nagot driftat, sa den gar att halla ett oga pa.
 */
process.loadEnvFile?.(".env.local");
import { readFileSync } from "node:fs";

const REVISION = "2025-07-15";

const KOPPLING: { motsvarar: RegExp; fil: string }[] = [
  { motsvarar: /kvittens/i, fil: "emails/progressbild/kvittens.klaviyo.html" },
  { motsvarar: /paminnelse/i, fil: "emails/progressbild/paminnelse.klaviyo.html" },
  { motsvarar: /slutmail/i, fil: "emails/progressbild/slutmail.klaviyo.html" },
  { motsvarar: /beloning/i, fil: "emails/progressbild/bekraftelse.klaviyo.html" },
];

/** Ord som aldrig ska sta i ett live-mail. Ett diff pa hela HTML:en sager bara
 *  "olika"; det har sager VAD som ar fel och varfor det spelar roll. */
const FORBJUDET = [
  { ord: "resentkort", varfor: "ingen beloningsvag ger ett presentkort" },
  { ord: "Tack, det betyder", varfor: "kvittenstonen som togs bort" },
  { ord: "get-renew.com", varfor: "nedlagd doman" },
];

async function kv(path: string) {
  const key = process.env.KLAVIYO_ENVANA_API_KEY?.trim();
  if (!key) throw new Error("KLAVIYO_ENVANA_API_KEY saknas");
  const res = await fetch("https://a.klaviyo.com/api" + path, {
    headers: {
      Authorization: "Klaviyo-API-Key " + key,
      revision: REVISION,
      accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 200)}`);
  await new Promise((r) => setTimeout(r, 300));
  return text ? JSON.parse(text) : null;
}

/**
 * Klaviyo skriver om HTML:en nar den lagras: versaler i doctype, sjalvstangda
 * void-taggar, omsorterade attribut och bortkastade kommentarer. En
 * teckenjamforelse kan darfor aldrig ga jamnt ut - den rapporterade varje mall
 * som driftad aven direkt efter en ombyggnad.
 *
 * Darfor jamfors INNEHALLET i stallet for markupen: den text kunden laser, och
 * uppsattningen bilder och lankar. Det ar de tva saker som faktiskt kan vara
 * gamla. Attributordning ar lagringens ensak.
 */
/** Klaviyo avkodar HTML-entiteter vid lagring: `&copy;` blir `©`. Utan det
 *  rapporterades slutmailet som driftat pa ett enda tecken i sidfoten. */
function avkoda(s: string): string {
  return s
    .replace(/&copy;/gi, "\u00a9")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;/gi, "\u2013")
    .replace(/&mdash;/gi, "\u2014")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, "&");
}

function lasbarText(html: string): string {
  return avkoda(html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function urler(html: string): string {
  // avkoda aven har: Klaviyo skriver &amp; i href, vilket ar samma lank.
  const ut = [...html.matchAll(/\s(?:src|href)="([^"]*)"/gi)].map((m) => avkoda(m[1]));
  return [...new Set(ut)].sort().join("\n");
}

/**
 * Soker forbjudna ord i det KUNDEN LASER. Sokvagar raknas inte: bildfilen
 * heter fortfarande presentkort-mail.jpg, och en traff pa det ar en falsk
 * varning som gor hela kontrollen vardelos.
 */
function synligText(html: string): string {
  return html.replace(/\s(?:src|href)="[^"]*"/gi, " ");
}

async function main() {
  const flows = await kv("/flows/?fields[flow]=name,status");
  let problem = 0;

  for (const f of flows.data as { id: string; attributes: { name: string; status: string } }[]) {
    const namn = f.attributes.name;
    if (!/progressbild/i.test(namn)) continue;
    const koppling = KOPPLING.find((k) => k.motsvarar.test(namn));

    const actions = await kv(`/flows/${f.id}/flow-actions/`);
    for (const a of actions.data as { id: string }[]) {
      let msgs;
      try {
        msgs = await kv(`/flow-actions/${a.id}/flow-messages/`);
      } catch {
        continue;
      }
      for (const m of msgs.data as { relationships?: { template?: { data?: { id: string } } } }[]) {
        const tplId = m.relationships?.template?.data?.id;
        if (!tplId) continue;
        const live = (await kv(`/templates/${tplId}/`)).data.attributes.html as string;

        const lasbar = synligText(live);
        for (const { ord, varfor } of FORBJUDET) {
          if (lasbar.includes(ord)) {
            console.log(`FEL  ${namn} (${tplId}) innehaller "${ord}" - ${varfor}`);
            problem++;
          }
        }
        if (koppling) {
          const byggd = readFileSync(koppling.fil, "utf-8");
          const textDrift = lasbarText(byggd) !== lasbarText(live);
          const urlDrift = urler(byggd) !== urler(live);
          if (textDrift || urlDrift) {
            const vad = [textDrift ? "texten" : null, urlDrift ? "bilder/lankar" : null]
              .filter(Boolean)
              .join(" och ");
            console.log(`DRIFT ${namn} (${tplId}): ${vad} skiljer sig fran ${koppling.fil}`);
            problem++;
          } else {
            console.log(`ok   ${namn} (${tplId})`);
          }
        }
      }
    }
  }

  if (problem) {
    console.log(
      `\n${problem} problem. Klonen gar inte att PATCHa - flodet maste byggas om ` +
        `for att den nya texten ska na kunderna.`
    );
    process.exit(1);
  }
  console.log("\nallt i synk");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
