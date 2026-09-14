// src/lib/bring.ts
//
// Bring Tracking API v2 - laser ut var ett paket befinner sig.
//
// VARFOR DEN HAR FINNS: Bring rapporterar INTE tillbaka leveransstatus till
// Shopify. Matning 2026-09-11 pa 711 kollagen-fulfillments i swedishbalance:
// 711 av 711 hade shipment_status = null och noll fulfillment_events. Shelfless
// vet det inte heller - deras status-enum slutar pa DISPATCHED och deras
// deliveryDate ar identisk med shippedDate pa sekunden. Enda stallet uthamtning
// syns ar Brings eget API, darav den har modulen.
//
// Nyckeln ar utfardad pa ett shopenvana.com-konto men ar INTE kontobunden:
// testad mot paket fran bade Renew (373...) och SwedishBalance (473...), alla
// HTTP 200 med full eventdata. En nyckel racker for alla butiker.

const BRING_API_BASE = "https://api.bring.com/tracking/api/v2/tracking.json";
const BRING_TIMEOUT_MS = 20_000;

/**
 * Statuskoder Bring faktiskt satter pa ombudsleveranser (PickUp Parcel).
 * Observerade i skarp data, inte gissade:
 *   PRE_NOTIFIED  - avsandaren har aviserat paketet
 *   IN_TRANSIT    - registrerat/sorterat/pa terminal
 *   TRANSPORT_TO_RECIPIENT - pa vag till utlamningsstallet
 *   READY_FOR_PICKUP - framme hos ombudet (kunden aviseras)
 *   DELIVERED     - KUNDEN HAR HAMTAT UT DET (det ar den vi triggar pa)
 *   DEVIATION     - t.ex. "Identification verified with BankID"
 *   RETURN / DELIVERED_SENDER - ohamtat, skickas/skickat tillbaka
 *   COLLECTED     - upphamtat for retur
 *   NOTIFICATION_SENT - Bring har aviserat kunden (e-post/SMS/push)
 */
export type BringStatus =
  | "PRE_NOTIFIED"
  | "IN_TRANSIT"
  | "TRANSPORT_TO_RECIPIENT"
  | "READY_FOR_PICKUP"
  | "DELIVERED"
  | "DEVIATION"
  | "RETURN"
  | "DELIVERED_SENDER"
  | "COLLECTED"
  | "NOTIFICATION_SENT";

export interface BringEvent {
  status: string;
  description: string;
  dateIso: string;
  city: string | null;
}

export interface ParcelStatus {
  /** Alla events, nyast forst (Brings egen ordning). */
  events: BringEvent[];
  /** Nar paketet kom fram till ombudet. */
  readyForPickupAt: string | null;
  /** Nar kunden hamtade ut det. Null = inte uthamtat an. */
  deliveredAt: string | null;
  /** Satt om paketet gatt i retur (ohamtat). */
  returnedAt: string | null;
  /** Ombudets namn, t.ex. "ICA MAXI HOGSKOLAN HALMSTAD". */
  pickupPoint: string | null;
  /** Var i kedjan paketet ar just nu. */
  phase: "unknown" | "in_transit" | "ready_for_pickup" | "delivered" | "returned";
}

export function isBringConfigured(): boolean {
  return Boolean(process.env.BRING_API_UID && process.env.BRING_API_KEY);
}

function authHeaders(): Record<string, string> {
  const uid = process.env.BRING_API_UID;
  const key = process.env.BRING_API_KEY;
  if (!uid || !key) {
    throw new Error("BRING_API_UID and BRING_API_KEY must be set");
  }
  return {
    "X-MyBring-API-Uid": uid,
    "X-MyBring-API-Key": key,
    "X-Bring-Client-URL": "https://swedishbalance.se",
    Accept: "application/json",
  };
}

/**
 * Ombudets namn ligger inbakat i en HTML-lank i event-beskrivningen:
 *   'The parcel has arrived at <a ... >SODRA STATION SPEL & TOBAK</a>.'
 * Plockar ut namnet, faller tillbaka pa rensad text utan taggar.
 */
function extractPickupPoint(description: string): string | null {
  const linked = description.match(/<a[^>]*>([^<]+)<\/a>/);
  if (linked) return decodeEntities(linked[1].trim());
  const plain = description
    .replace(/<[^>]+>/g, "")
    .replace(/^The parcel has arrived at\s*/i, "")
    .replace(/\.$/, "")
    .trim();
  return plain ? decodeEntities(plain) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Hamtar status for ett kolli. Kastar vid natverks-/auth-fel sa anroparen
 * kan skilja "vet inte an" fran "paketet ar inte uthamtat".
 */
export async function fetchParcelStatus(trackingNumber: string): Promise<ParcelStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRING_TIMEOUT_MS);

  try {
    const url = `${BRING_API_BASE}?q=${encodeURIComponent(trackingNumber)}`;
    const res = await fetch(url, { headers: authHeaders(), signal: controller.signal });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Bring API error (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const events: BringEvent[] = [];

    for (const consignment of data.consignmentSet ?? []) {
      for (const pkg of consignment.packageSet ?? []) {
        for (const ev of pkg.eventSet ?? []) {
          events.push({
            status: String(ev.status ?? ""),
            description: String(ev.description ?? ""),
            dateIso: String(ev.dateIso ?? ""),
            city: ev.city || null,
          });
        }
      }
    }

    // Brings eventSet kommer nyast forst. Vi vill ha FORSTA gangen varje
    // status intraffade, sa vi gar bakifran.
    const firstOccurrence = new Map<string, BringEvent>();
    for (const ev of [...events].reverse()) {
      if (!firstOccurrence.has(ev.status)) firstOccurrence.set(ev.status, ev);
    }

    const ready = firstOccurrence.get("READY_FOR_PICKUP") ?? null;
    const delivered = firstOccurrence.get("DELIVERED") ?? null;
    const returned =
      firstOccurrence.get("DELIVERED_SENDER") ?? firstOccurrence.get("RETURN") ?? null;

    // En READY_FOR_PICKUP kan aven vara "deadline extended by 7 days" - bara
    // den som namner ett ombud duger som platsnamn.
    let pickupPoint: string | null = null;
    for (const ev of [...events].reverse()) {
      if (ev.status === "READY_FOR_PICKUP" && /arrived at/i.test(ev.description)) {
        pickupPoint = extractPickupPoint(ev.description);
        break;
      }
    }

    let phase: ParcelStatus["phase"] = "unknown";
    if (delivered) phase = "delivered";
    else if (returned) phase = "returned";
    else if (ready) phase = "ready_for_pickup";
    else if (events.length > 0) phase = "in_transit";

    return {
      events,
      readyForPickupAt: ready?.dateIso || null,
      deliveredAt: delivered?.dateIso || null,
      returnedAt: returned?.dateIso || null,
      pickupPoint,
      phase,
    };
  } finally {
    clearTimeout(timeout);
  }
}
