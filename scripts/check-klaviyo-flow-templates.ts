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

        for (const { ord, varfor } of FORBJUDET) {
          if (live.includes(ord)) {
            console.log(`FEL  ${namn} (${tplId}) innehaller "${ord}" - ${varfor}`);
            problem++;
          }
        }
        if (koppling) {
          const byggd = readFileSync(koppling.fil, "utf-8");
          if (byggd !== live) {
            console.log(
              `DRIFT ${namn} (${tplId}) skiljer sig fran ${koppling.fil} ` +
                `(${live.length} tecken live mot ${byggd.length} byggda)`
            );
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
