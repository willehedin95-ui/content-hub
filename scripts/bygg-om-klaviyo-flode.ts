/**
 * Bygger om ett progressbildsflode mot den FARSKA mallen.
 *
 * Varfor det behovs: Klaviyo klonar mallen nar ett flode skapas och skickar
 * sedan klonen. Klonen gar inte att uppdatera via API - GET svarar 200, PATCH
 * svarar 404 - sa ny mailtext nar aldrig kunderna forran flodet byggs om.
 *
 * Skriptet laser flodets definition, skriver om den till skapandeformat och
 * skapar ett nytt flode med samma trigger, samma fordrojningar och samma
 * amnesrad, men med den aktuella mallen. Det GAMLA flodet raderas forst, for
 * tva live-floden pa samma metric hade dubbelmailat alla.
 *
 * Definitionen sparas till disk innan raderingen, sa den gar att aterskapa.
 *
 *   npx tsx scripts/bygg-om-klaviyo-flode.ts <flodesnamn-fragment> --dry
 */
process.loadEnvFile?.(".env.local");
import { writeFileSync, mkdirSync } from "node:fs";

export {};

const REVISION = "2025-07-15";
const DRY = process.argv.includes("--dry");
const FRAGMENT = process.argv[2];
const BACKUP = ".klaviyo-backup";

/** Flodesnamn -> mallen det ska peka pa efter ombyggnaden. */
const MALL: { motsvarar: RegExp; mallnamn: string }[] = [
  { motsvarar: /paminnelse/i, mallnamn: "Progressbild - paminnelse nasta bild" },
  { motsvarar: /slutmail/i, mallnamn: "Progressbild - slutmail dag 60 + samtycke" },
  { motsvarar: /kvittens/i, mallnamn: "Progressbild - kvittens (alla tre stegen)" },
];

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

async function mallId(namn: string): Promise<string> {
  let url: string | null = "/templates/?fields[template]=name";
  while (url) {
    const p: { data: { id: string; attributes: { name: string } }[]; links?: { next?: string } } =
      await kv(url);
    const t = p.data.find((x) => x.attributes.name === namn);
    if (t) return t.id;
    url = p.links?.next ? p.links.next.replace("https://a.klaviyo.com/api", "") : null;
  }
  throw new Error(`hittade ingen mall som heter "${namn}"`);
}

type Action = {
  id?: string;
  temporary_id?: string;
  type: string;
  data: Record<string, unknown>;
  links?: { next?: string | null };
};

/**
 * Gor om en UTLAST definition till en som gar att skapa.
 *
 * Skillnaderna kostade tva forsok att hitta: actions vill ha `temporary_id` och
 * inte `id`, `links.next` och `entry_action_id` maste peka pa de tillfalliga
 * id:na, och meddelandeobjektet bar ett eget `id` som ocksa avvisas.
 */
function tillSkapandeformat(def: Record<string, unknown>, nyMall: string) {
  const actions = def.actions as Action[];
  const karta = new Map<string, string>();
  actions.forEach((a, i) => karta.set(String(a.id), String(i + 1)));

  const nya = actions.map((a, i) => {
    const data = { ...a.data } as Record<string, unknown>;
    if (a.type === "send-email") {
      const m = { ...(data.message as Record<string, unknown>) };
      delete m.id;
      m.template_id = nyMall;
      data.message = m;
    }
    const next = a.links?.next;
    return {
      temporary_id: String(i + 1),
      type: a.type,
      data,
      links: { next: next ? karta.get(String(next)) ?? null : null },
    };
  });

  return {
    triggers: def.triggers,
    profile_filter: def.profile_filter ?? null,
    actions: nya,
    entry_action_id: karta.get(String(def.entry_action_id)) ?? "1",
  };
}

async function main() {
  if (!FRAGMENT) throw new Error("ange ett fragment av flodesnamnet");
  const flows = await kv("/flows/?fields[flow]=name,status");
  const traffar = (flows.data as { id: string; attributes: { name: string; status: string } }[])
    .filter((f) => /progressbild/i.test(f.attributes.name) && f.attributes.name.toLowerCase().includes(FRAGMENT.toLowerCase()));
  if (traffar.length !== 1) {
    throw new Error(`"${FRAGMENT}" matchar ${traffar.length} floden: ${traffar.map((t) => t.attributes.name).join(", ")}`);
  }
  const flow = traffar[0];
  const namn = flow.attributes.name;
  const koppling = MALL.find((m) => m.motsvarar.test(namn));
  if (!koppling) throw new Error(`ingen mall kopplad till "${namn}"`);

  const full = await kv(`/flows/${flow.id}/?additional-fields[flow]=definition`);
  const gammal = full.data.attributes.definition as Record<string, unknown>;

  mkdirSync(BACKUP, { recursive: true });
  const fil = `${BACKUP}/${flow.id}-${Date.now()}.json`;
  writeFileSync(fil, JSON.stringify({ id: flow.id, namn, status: flow.attributes.status, definition: gammal }, null, 2));
  console.log(`definition sparad: ${fil}`);

  const nyMall = await mallId(koppling.mallnamn);
  const ny = tillSkapandeformat(gammal, nyMall);
  console.log(`"${namn}" (${flow.id}) -> ny mall ${nyMall} (${koppling.mallnamn})`);
  console.log(`  ${ny.actions.length} steg: ${ny.actions.map((a) => a.type).join(" -> ")}`);

  if (DRY) {
    console.log(JSON.stringify(ny, null, 2).slice(0, 1200));
    console.log("\ntorrkorning - inget raderat, inget skapat");
    return;
  }

  await kv(`/flows/${flow.id}/`, { method: "DELETE" });
  console.log(`raderat gamla flodet ${flow.id}`);

  const skapad = await kv("/flows/", {
    method: "POST",
    body: JSON.stringify({ data: { type: "flow", attributes: { name: namn, definition: ny } } }),
  });
  console.log(`skapat ${skapad.data.id}, status ${skapad.data.attributes.status}`);

  const live = await kv(`/flows/${skapad.data.id}/`, {
    method: "PATCH",
    body: JSON.stringify({ data: { type: "flow", id: skapad.data.id, attributes: { status: "live" } } }),
  });
  console.log(`status satt till ${live.data.attributes.status}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
