/**
 * Skapar Klaviyo-flodet som skickar beloningsbekraftelsen.
 *
 * Triggas pa metricen "Progressbild beloning beviljad", som skickas nar
 * pengarna FAKTISKT ligger dar - ocksa fran cronens omforsok. Bekraftelsen lag
 * forut som en gren i dag 60-mailet, alltsa last vid uppladdningsogonblicket,
 * och sa fort Loop-anropet small fick kunden "vi hor av oss" for alltid.
 *
 * Rubriken grenar INTE pa beloningstypen. Klaviyo renderar mallsyntax i
 * amnesraden, men gar det fel star koden i klartext i inkorgen - och en
 * neutral rad som ar sann for bada vagarna kostar mindre an den risken.
 *
 * Ett flode gar inte att andra via API i efterhand (se klaviyo-api-limits).
 * Skriptet vagrar darfor skapa ett andra flode med samma namn.
 *
 *   npx tsx scripts/create-klaviyo-beloningsflode.ts [--dry]
 */
process.loadEnvFile?.(".env.local");

// Gor filen till en MODUL. Utan en import eller export behandlar TypeScript ett
// skript som globalt, och da krockar `main` med `main` i scripts/meta-full-check.ts
// ("Duplicate function implementation") - vilket faller hela next build.
export {};

const REVISION = "2025-07-15";
const DRY = process.argv.includes("--dry");

const FLODESNAMN = "Progressbild - beloningsbekraftelse";
const METRIC = "Progressbild beloning beviljad";
const MALLNAMN = "Progressbild - beloningsbekraftelse";
const AVSANDARE = "hello@shopenvana.com"; // ALDRIG info@ - det ar var primara adress

async function kv(path: string, init: RequestInit = {}) {
  const key = process.env.KLAVIYO_ENVANA_API_KEY?.trim();
  if (!key) throw new Error("KLAVIYO_ENVANA_API_KEY saknas");
  const res = await fetch("https://a.klaviyo.com/api" + path, {
    ...init,
    headers: {
      Authorization: "Klaviyo-API-Key " + key,
      revision: REVISION,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 400)}`);
  await new Promise((r) => setTimeout(r, 300));
  return text ? JSON.parse(text) : null;
}

async function hittaId(path: string, namn: string, vad: string): Promise<string> {
  let url: string | null = path;
  while (url) {
    const p: { data: { id: string; attributes: { name: string } }[]; links?: { next?: string } } =
      await kv(url);
    const t = p.data.find((x) => x.attributes.name === namn);
    if (t) return t.id;
    url = p.links?.next ? p.links.next.replace("https://a.klaviyo.com/api", "") : null;
  }
  throw new Error(`hittade ingen ${vad} som heter "${namn}"`);
}

async function sattLive(id: string) {
  const r = await kv(`/flows/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ data: { type: "flow", id, attributes: { status: "live" } } }),
  });
  console.log(`status satt till ${r.data.attributes.status} (${id})`);
}

async function main() {
  const flows = await kv("/flows/?fields[flow]=name,status");
  const fanns = (flows.data as { id: string; attributes: { name: string; status: string } }[]).find(
    (f) => f.attributes.name === FLODESNAMN
  );
  if (fanns) {
    // Ett skapat flode ar DRAFT aven om handlingen har status "live" - flodets
    // egen status ar ett eget falt. Ett utkast skickar ingenting, sa skriptet
    // ar inte klart forran det statuset ar satt.
    if (fanns.attributes.status === "live") {
      console.log(`"${FLODESNAMN}" finns och ar live (${fanns.id}) - gor ingenting.`);
      return;
    }
    if (DRY) {
      console.log(`SKULLE satta ${fanns.id} till live (ar ${fanns.attributes.status})`);
      return;
    }
    await sattLive(fanns.id);
    return;
  }

  const metricId = await hittaId("/metrics/?fields[metric]=name", METRIC, "metric");
  const templateId = await hittaId("/templates/?fields[template]=name", MALLNAMN, "mall");
  console.log(`metric ${metricId}, mall ${templateId}`);

  const definition = {
    triggers: [{ type: "metric", id: metricId }],
    profile_filter: null,
    // `temporary_id` och inte `id`: en UTLAST definition bar riktiga id:n, men
    // vid skapande avvisas de ("id is not allowed to be specified on create")
    // och API:et vill i stallet ha ett tillfalligt id som entry_action_id kan
    // peka pa. En kopierad definition gar alltsa inte att skicka tillbaka rakt
    // av - den maste skrivas om till temporary_id forst.
    actions: [
      {
        temporary_id: "1",
        type: "send-email",
        data: {
          message: {
            from_email: AVSANDARE,
            from_label: "Envana",
            reply_to_email: AVSANDARE,
            subject_line: "Dina 200 kr är klara",
            preview_text: "Belöningen för din 60-dagarsresa.",
            template_id: templateId,
            // Av med flit: en bekraftelse pa pengar ska inte hoppas over for
            // att kunden fatt ett annat utskick nyligen.
            smart_sending_enabled: false,
            transactional: false,
            add_tracking_params: true,
            name: "Progressbild - beloningsbekraftelse",
          },
          status: "live",
        },
        links: { next: null },
      },
    ],
    entry_action_id: "1",
  };

  if (DRY) {
    console.log(JSON.stringify(definition, null, 2));
    return;
  }

  const skapad = await kv("/flows/", {
    method: "POST",
    body: JSON.stringify({
      data: { type: "flow", attributes: { name: FLODESNAMN, definition } },
    }),
  });
  console.log(`skapat: ${FLODESNAMN} (${skapad.data.id}), status ${skapad.data.attributes.status}`);
  await sattLive(skapad.data.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
