// src/lib/klaviyo-events.ts
//
// Skickar custom events till Klaviyo (Events API). Separat fran klaviyo.ts som
// bara laser intakter med en tredje nyckel (KLAVIYO_API_KEY).
//
// Anvands av /api/cron/pickup-tracker for att trigga recensionsflodet nar
// kunden faktiskt hamtat ut sitt paket hos ombudet. Klaviyos egna Shopify-
// metric "Delivered Shipment" duger INTE: matning 2026-09-11 visade att alla
// 699 sadana events sedan arsskiftet kom fran YunExpress (Kina-dropshippen pa
// kuddarna) och noll fran Bring, eftersom Bring inte rapporterar tillbaka till
// Shopify.

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_REVISION = "2025-07-15";
const KLAVIYO_TIMEOUT_MS = 15_000;

/** Butiker vi skickar events for. Varje brand har ett eget Klaviyo-konto. */
export type KlaviyoBrand = "swedishbalance" | "envana";

const BRAND_ENV: Record<KlaviyoBrand, string> = {
  swedishbalance: "KLAVIYO_SB_API_KEY",
  envana: "KLAVIYO_ENVANA_API_KEY",
};

export function klaviyoApiKeyFor(brand: KlaviyoBrand): string | null {
  return process.env[BRAND_ENV[brand]]?.trim() || null;
}

export function isKlaviyoEventsConfigured(brand: KlaviyoBrand): boolean {
  return Boolean(klaviyoApiKeyFor(brand));
}

export interface TrackEventInput {
  brand: KlaviyoBrand;
  /** Metricens namn, t.ex. "Package Picked Up". Skapas automatiskt i Klaviyo. */
  metricName: string;
  email: string;
  properties: Record<string, unknown>;
  /** Nar handelsen intraffade (ISO). Default: nu. */
  time?: string;
  /**
   * Idempotensnyckel. Klaviyo avvisar ett event med samma unique_id som ett
   * redan mottaget, vilket skyddar mot dubbelutskick om cronen kor om en rad
   * innan den hunnit markeras som skickad.
   */
  uniqueId?: string;
}

/**
 * Skickar ett event. Kastar vid fel sa anroparen kan spara felet och forsoka
 * igen nasta korning i stallet for att tyst tappa bort kunden.
 */
export async function trackKlaviyoEvent(input: TrackEventInput): Promise<void> {
  const apiKey = klaviyoApiKeyFor(input.brand);
  if (!apiKey) {
    throw new Error(`Klaviyo API key missing for brand "${input.brand}" (${BRAND_ENV[input.brand]})`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KLAVIYO_TIMEOUT_MS);

  try {
    const res = await fetch(`${KLAVIYO_API_BASE}/events/`, {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: KLAVIYO_REVISION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        data: {
          type: "event",
          attributes: {
            properties: input.properties,
            time: input.time ?? new Date().toISOString(),
            ...(input.uniqueId ? { unique_id: input.uniqueId } : {}),
            metric: {
              data: { type: "metric", attributes: { name: input.metricName } },
            },
            profile: {
              data: { type: "profile", attributes: { email: input.email } },
            },
          },
        },
      }),
    });

    // 202 Accepted ar normalsvaret. 409 = unique_id redan mottagen, vilket ar
    // exakt vad idempotensen ska ge - behandla det som lyckat.
    if (res.status === 409) return;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Klaviyo events error (${res.status}): ${body.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
