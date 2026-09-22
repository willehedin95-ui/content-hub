/**
 * Belöningen när kunden dokumenterat hela sin 60-dagarsresa.
 *
 * Två vägar, och vilken hon får avgörs av om hon har en aktiv prenumeration:
 *
 *   PRENUMERANT   -> avdrag direkt på nästa Loop-order. Ingen kod, inget hon
 *                    behöver göra, och pengarna landar där de gör mest nytta:
 *                    hos någon som just funderat på att avsluta.
 *   ENGÅNGSKÖPARE -> unik rabattkod i Shopify.
 *
 * Rabattkod och inte presentkort, av två skäl: ett presentkort är en skuld i
 * böckerna tills det löses in, och det kräver `write_gift_cards` som appen
 * inte har. En kod är en regel i kassan. Priset för det är att mellanskillnaden
 * brinner om ordern är mindre än 200 kr - acceptabelt när den minsta produkten
 * kostar mer än så.
 */

import { readSubscriptionsForCustomer, type LoopSubscription } from "./loop";
import { createServerSupabase } from "./supabase-admin";
import {
  getShopifyCredsForWorkspace,
  getAccessTokenForCreds,
  searchCustomerByEmail,
} from "./shopify";

/** Loops admin-API. Rabattendpointen finns inte i 2023-10 som loop.ts läser mot. */
const LOOP_BAS = "https://api.loopsubscriptions.com/admin/2026-04";

export const BELONING_SEK = 200;

export type BeloningsResultat =
  | { typ: "loop-avdrag"; subscriptionId: number; belopp: number }
  | { typ: "rabattkod"; kod: string; belopp: number }
  | { typ: "redan-beviljad"; tidigare: string }
  | { typ: "kraver-manuell"; skal: string };

function loopToken(): string {
  const t = process.env.LOOP_ADMIN_API_TOKEN;
  if (!t) throw new Error("LOOP_ADMIN_API_TOKEN saknas");
  return t;
}

/**
 * Lägg ett engångsavdrag på prenumerationens NÄSTA order.
 *
 * `orderLimit: 1` är skillnaden mellan en gåva och en permanent prisändring -
 * utan den gäller rabatten alla framtida laddningar.
 */
async function laggLoopAvdrag(subscriptionId: number, belopp: number): Promise<void> {
  const res = await fetch(`${LOOP_BAS}/subscription/${subscriptionId}/discount`, {
    method: "POST",
    headers: {
      "x-loop-token": loopToken(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      manualDiscount: {
        // title ar OBLIGATORISKT - utan det svarar Loop 422
        // "manualDiscount,title | Required". Det star inte i var spec, och
        // upptacktes forst nar avdraget kordes mot en riktig prenumeration.
        // Texten syns for kunden pa ordern, sa den ska ga att forsta dar.
        title: "Tack för dina progressbilder",
        type: "FIXED_AMOUNT",
        value: belopp,
        orderLimit: 1,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Loop discount ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

function aktiv(s: LoopSubscription): boolean {
  return s.status === "ACTIVE";
}

/** Utan I, O, 0 och 1 - koden ska gå att läsa upp i telefon utan stavning. */
const TECKEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function slumpkod(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "TACK-" + [...bytes].map((b) => TECKEN[b % TECKEN.length]).join("");
}

/**
 * Unik rabattkod på 200 kr, en användning.
 *
 * Binds till hennes kundpost när hon går att hitta på e-posten - då kan ingen
 * annan lösa in den ens om koden läcker. Hittas hon inte (gästköp på en annan
 * adress) faller vi tillbaka på `all: true`, och då är `usageLimit: 1` det enda
 * som skyddar. Det är en medveten avvägning: en kod som kanske kan lösas in av
 * fel person är bättre än ingen belöning alls.
 */
async function skapaRabattkod(email: string, workspaceId: string, belopp: number): Promise<string> {
  const creds = await getShopifyCredsForWorkspace(workspaceId);
  if (!creds) throw new Error("inga Shopify-credentials for workspace " + workspaceId);
  const token = await getAccessTokenForCreds(creds);

  let kundGid: string | null = null;
  try {
    const kund = await searchCustomerByEmail(email, creds);
    if (kund?.id) kundGid = `gid://shopify/Customer/${kund.id}`;
  } catch {
    // Uppslaget är en bonus, inte ett krav.
  }

  const kod = slumpkod();
  const mutation = `
    mutation skapa($d: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $d) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`;
  const variables = {
    d: {
      title: `Progressbild ${belopp} kr - ${email}`,
      code: kod,
      startsAt: new Date().toISOString(),
      customerSelection: kundGid ? { customers: { add: [kundGid] } } : { all: true },
      customerGets: {
        value: { discountAmount: { amount: String(belopp), appliesOnEachItem: false } },
        items: { all: true },
      },
      appliesOncePerCustomer: true,
      usageLimit: 1,
    },
  };
  const res = await fetch(`${creds.storeUrl}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query: mutation, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json();
  const fel = json?.data?.discountCodeBasicCreate?.userErrors ?? [];
  if (fel.length) throw new Error(`Shopify: ${fel.map((f: { message: string }) => f.message).join("; ")}`);
  if (!json?.data?.discountCodeBasicCreate?.codeDiscountNode?.id) {
    throw new Error(`Shopify svarade utan rabattkod: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return kod;
}

/**
 * Bevilja belöningen för en e-postadress. Idempotent: andra anropet för samma
 * adress returnerar `redan-beviljad` utan att röra Loop. Det är hela poängen
 * med att skriva till `progressbild_beloningar` FÖRE Loop-anropet - en kund som
 * laddar upp sista bilden två gånger ska inte få dubbelt avdrag.
 */
export async function beviljaBeloning(
  email: string,
  workspaceId: string
): Promise<BeloningsResultat> {
  const adress = email.trim().toLowerCase();
  const db = createServerSupabase();

  const { data: befintlig } = await db
    .from("progressbild_beloningar")
    .select("beviljad_at, typ")
    .eq("email", adress)
    .maybeSingle();
  if (befintlig) {
    return { typ: "redan-beviljad", tidigare: befintlig.beviljad_at as string };
  }

  const prenumerationer = await readSubscriptionsForCustomer(adress);
  const aktivaBilar = prenumerationer.filter(aktiv);

  if (aktivaBilar.length === 0) {
    // Engångsköpare: unik rabattkod. Raden skrivs FÖRE Shopify-anropet av
    // samma skäl som Loop-grenen - den reserverar adressen.
    await db.from("progressbild_beloningar").insert({
      email: adress,
      typ: "rabattkod",
      belopp: BELONING_SEK,
      detalj: "ingen aktiv prenumeration, unik rabattkod",
    });
    try {
      const kod = await skapaRabattkod(adress, workspaceId, BELONING_SEK);
      await db.from("progressbild_beloningar").update({ rabattkod: kod }).eq("email", adress);
      return { typ: "rabattkod", kod, belopp: BELONING_SEK };
    } catch (e) {
      await db
        .from("progressbild_beloningar")
        .update({ typ: "kraver-manuell", detalj: `rabattkoden failade: ${String(e).slice(0, 180)}` })
        .eq("email", adress);
      throw e;
    }
  }

  // Har hon flera aktiva tas den som laddas närmast i tiden - det är den hon
  // märker av först.
  const valdaPren = aktivaBilar.sort(
    (a, b) => (a.nextBillingDateEpoch ?? Infinity) - (b.nextBillingDateEpoch ?? Infinity)
  )[0];

  await db.from("progressbild_beloningar").insert({
    email: adress,
    typ: "loop-avdrag",
    belopp: BELONING_SEK,
    subscription_id: valdaPren.id,
    detalj: `avdrag pa nasta order for prenumeration ${valdaPren.id}`,
  });

  try {
    await laggLoopAvdrag(valdaPren.id, BELONING_SEK);
  } catch (e) {
    // Raden ligger kvar med typen satt, men markeras som misslyckad så den
    // syns i kön i stället för att tyst försvinna.
    await db
      .from("progressbild_beloningar")
      .update({ typ: "kraver-manuell", detalj: `Loop-anropet failade: ${String(e).slice(0, 180)}` })
      .eq("email", adress);
    throw e;
  }

  return { typ: "loop-avdrag", subscriptionId: valdaPren.id, belopp: BELONING_SEK };
}
