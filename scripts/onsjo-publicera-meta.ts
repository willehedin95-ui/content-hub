// Onsjö 415A - lägger upp kampanj, annonsuppsättning och annonser i Meta.
//
// ALLT SKAPAS PAUSAT. Skriptet aktiverar aldrig något, det finns för att slippa
// klicka ihop samma sak i annonshanteraren igen (utkastet 2026-08-13 skapade inga
// riktiga objekt och försvann med "Discard drafts").
//
// FÖRUTSÄTTNING: Stefans kort måste ligga som betalmetod på act_1023872310418716.
// Det går inte via API. Utan det går kampanjen inte att aktivera.
//
// Anropar Graph direkt i stället för src/lib/meta.ts, av två skäl: annonskontot anges
// explicit på varje anrop i stället för via modulglobalen setMetaConfig, och createAdSet
// där saknar promoted_object, destination_type och EU-fälten dsa_beneficiary/dsa_payor.
//
// Torrkörning (skapar inget):  npx ... tsx scripts/onsjo-publicera-meta.ts
// Skarpt (skapar pausat):      npx ... tsx scripts/onsjo-publicera-meta.ts --skarpt

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const KONTO = "act_1023872310418716";
const SIDA = "1339413035915987"; // Facebook-sidan "Stefan Hedin"
const PIXEL = "1061946796309495"; // "Stefan Hedin Pixel"
const MAL_URL = "https://stefanhedin.se/";
const BILDMAPP = "/Users/williamhedin/Claude Code/onsjo/annonsbilder";

// EU kräver båda innan publicering (fel #3858152). Uppgifterna blir publika i
// Metas annonsbibliotek i ett år. Valt av William 2026-08-13.
const DSA_BENEFICIARY = "Stefan Hedin";
const DSA_PAYOR = "Incensor AB";

const DAGSBUDGET_ORE = 12500; // 125 kr/dag, Metas standard som låg kvar i utkastet
const API = "https://graph.facebook.com/v22.0";

const skarpt = process.argv.includes("--skarpt");

function token(): string {
  const t = process.env.META_SYSTEM_USER_TOKEN;
  if (!t) throw new Error("META_SYSTEM_USER_TOKEN saknas");
  return t;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!skarpt) {
    console.log(`  [torrkörning] POST ${path}\n    ${JSON.stringify(body).slice(0, 400)}`);
    return { id: `torr_${Math.abs(path.length * 7)}` } as T;
  }
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token() }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`${path}: ${JSON.stringify(json.error ?? json)}`);
  return json as T;
}

/** Laddar upp en lokal bild och returnerar Metas hash. */
async function laddaUppBild(fil: string): Promise<string> {
  if (!skarpt) {
    console.log(`  [torrkörning] laddar upp ${fil}`);
    return `torr_hash_${fil}`;
  }
  const form = new FormData();
  form.append("access_token", token());
  form.append("filename", new Blob([readFileSync(join(BILDMAPP, fil))]), fil);
  const res = await fetch(`${API}/${KONTO}/adimages`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`adimages ${fil}: ${JSON.stringify(json.error ?? json)}`);
  const bilder = json.images as Record<string, { hash: string }>;
  const hash = Object.values(bilder)[0]?.hash;
  if (!hash) throw new Error(`adimages ${fil}: inget hash i svaret`);
  return hash;
}

/**
 * En annons per bild. Copyn läses ur image_jobs vid behov, men här skickas den in
 * som argument så att skriptet inte gissar vilket koncept som hör till vilken bild.
 */
interface Annons {
  namn: string;
  bild: string; // filnamn i BILDMAPP
  brodtext: string;
  rubrik: string;
}

async function main() {
  console.log(skarpt ? "SKARP KÖRNING - skapar pausade objekt\n" : "TORRKÖRNING - skapar ingenting\n");

  // Kontrollera betalmetoden först. Utan den går kampanjen ändå inte att aktivera.
  const kontoRes = await fetch(
    `${API}/${KONTO}?fields=name,account_status,funding_source_details&access_token=${token()}`,
  );
  const konto = await kontoRes.json();
  console.log(`Konto: ${konto.name}, status ${konto.account_status}`);
  if (!konto.funding_source_details) {
    console.log("VARNING: ingen betalmetod på kontot. Objekten skapas men går inte att aktivera.\n");
  }

  const annonser: Annons[] = JSON.parse(
    readFileSync(join(BILDMAPP, process.env.ONSJO_MANIFEST ?? "annonser.json"), "utf8"),
  );
  console.log(`${annonser.length} annonser att lägga upp\n`);

  const kampanj = await post<{ id: string }>(`/${KONTO}/campaigns`, {
    name: "Onsjö 415A | leads | artikel",
    objective: "OUTCOME_LEADS",
    special_ad_categories: [], // ingen kategori, se resonemanget i handovern
    status: "PAUSED",
  });
  console.log(`Kampanj ${kampanj.id}`);

  const adset = await post<{ id: string }>(`/${KONTO}/adsets`, {
    name: "SE | brett | 25+",
    campaign_id: kampanj.id,
    daily_budget: DAGSBUDGET_ORE,
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    destination_type: "WEBSITE", // inte Instant forms, se fällan i handovern
    promoted_object: { pixel_id: PIXEL, custom_event_type: "LEAD" },
    targeting: { geo_locations: { countries: ["SE"] }, age_min: 25 },
    dsa_beneficiary: DSA_BENEFICIARY,
    dsa_payor: DSA_PAYOR,
    status: "PAUSED",
  });
  console.log(`Annonsuppsättning ${adset.id}`);

  for (const a of annonser) {
    const hash = await laddaUppBild(a.bild);
    const creative = await post<{ id: string }>(`/${KONTO}/adcreatives`, {
      name: `${a.namn} | creative`,
      object_story_spec: {
        page_id: SIDA,
        link_data: {
          link: MAL_URL,
          image_hash: hash,
          message: a.brodtext,
          name: a.rubrik,
          call_to_action: { type: "LEARN_MORE", value: { link: MAL_URL } },
        },
      },
    });
    const annons = await post<{ id: string }>(`/${KONTO}/ads`, {
      name: a.namn,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: "PAUSED",
    });
    console.log(`  ${a.namn} -> annons ${annons.id}`);
  }

  console.log("\nKLART. Allt ligger pausat. Aktivera i annonshanteraren när kortet är på plats.");
}

// Så filnamnen i annonser.json går att kontrollera innan körning.
if (process.argv.includes("--lista-bilder")) {
  console.log(readdirSync(BILDMAPP).filter((f) => f.endsWith(".jpg")).join("\n"));
} else {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
