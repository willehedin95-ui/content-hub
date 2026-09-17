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
 * STATUS 2026-09-17: bara prenumerantvägen är byggd. Engångsköparvägen är
 * blockerad på att Content Hub saknar Shopify-credentials för Envana
 * (`n5ftzr-mq.myshopify.com`). Den enda Shopify-app som är kopplad till
 * hydro13-workspacen pekar på NEDLAGDA get-renew.com och har dessutom bara
 * `read_discounts`, inte `write_discounts`. Uppmätt mot skarpt konto, inte
 * antaget - specen påstod att `write_discounts` redan fanns.
 *
 * Tills det är löst returnerar engångsköpare `kraverManuell`, och den flaggan
 * är till för att synas: kunden har fått ett löfte som ingen kod infriar.
 */

import { readSubscriptionsForCustomer, type LoopSubscription } from "./loop";
import { createServerSupabase } from "./supabase-admin";

/** Loops admin-API. Rabattendpointen finns inte i 2023-10 som loop.ts läser mot. */
const LOOP_BAS = "https://api.loopsubscriptions.com/admin/2026-04";

export const BELONING_SEK = 200;

export type BeloningsResultat =
  | { typ: "loop-avdrag"; subscriptionId: number; belopp: number }
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
      manualDiscount: { type: "FIXED_AMOUNT", value: belopp, orderLimit: 1 },
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

/**
 * Bevilja belöningen för en e-postadress. Idempotent: andra anropet för samma
 * adress returnerar `redan-beviljad` utan att röra Loop. Det är hela poängen
 * med att skriva till `progressbild_beloningar` FÖRE Loop-anropet - en kund som
 * laddar upp sista bilden två gånger ska inte få dubbelt avdrag.
 */
export async function beviljaBeloning(email: string): Promise<BeloningsResultat> {
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
    // Ingen aktiv prenumeration. Rabattkoden går inte att skapa än (se noten
    // överst), så raden skrivs ändå - den är kön över vad som ska betalas ut
    // för hand, och utan den vet vi inte vilka som väntar.
    await db.from("progressbild_beloningar").insert({
      email: adress,
      typ: "kraver-manuell",
      belopp: BELONING_SEK,
      detalj: "ingen aktiv prenumeration, Shopify-rabattkod ej byggd",
    });
    return {
      typ: "kraver-manuell",
      skal: "ingen aktiv prenumeration i Loop",
    };
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
