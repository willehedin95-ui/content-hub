const SHELFLESS_API_BASE = "https://rest.dreamlogistics.se";
const SHELFLESS_TIMEOUT_MS = 15_000;
const COLLAGEN_SKU = "COLLAGEN-MARINE-12500";

export interface ShelflessProduct {
  productNumber: string;
  externalId: string;
  physicalQuantity: number;
  quantityOnDeliveries: number;
  quantityFromUncompletedIncomingDeliveries: number;
  returnQuantity: number;
  disposableQuantity: number;
}

interface ShelflessStockResponse {
  page: number;
  itemsPerPage: number;
  nextPage: string | null;
  previousPage: string | null;
  products: ShelflessProduct[];
}

export interface StockData {
  disposable: number;
  physical: number;
  onDeliveries: number;
  incomingDeliveries: number;
  returns: number;
}

function getAuthHeader(): string {
  const username = process.env.SHELFLESS_USERNAME;
  const password = process.env.SHELFLESS_PASSWORD;
  if (!username || !password) {
    throw new Error("SHELFLESS_USERNAME and SHELFLESS_PASSWORD must be set");
  }
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

export function isShelflessConfigured(): boolean {
  return !!(process.env.SHELFLESS_USERNAME && process.env.SHELFLESS_PASSWORD);
}

/**
 * Fetch stock data for COLLAGEN-MARINE-12500 from Shelfless (DreamLogistics).
 * Returns disposable (sellable), physical, on-deliveries, incoming, and return quantities.
 */
export async function fetchStock(): Promise<StockData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHELFLESS_TIMEOUT_MS);

  try {
    const sku = encodeURIComponent(`[${COLLAGEN_SKU}]`);
    const res = await fetch(
      `${SHELFLESS_API_BASE}/api/v1/stock?productNumbers=${sku}`,
      {
        headers: { Authorization: getAuthHeader() },
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Shelfless API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data: ShelflessStockResponse = await res.json();
    const product = data.products.find((p) => p.productNumber === COLLAGEN_SKU);

    if (!product) {
      console.warn(`Shelfless: SKU ${COLLAGEN_SKU} not found`);
      return { disposable: 0, physical: 0, onDeliveries: 0, incomingDeliveries: 0, returns: 0 };
    }

    return {
      disposable: product.disposableQuantity,
      physical: product.physicalQuantity,
      onDeliveries: product.quantityOnDeliveries,
      incomingDeliveries: product.quantityFromUncompletedIncomingDeliveries,
      returns: product.returnQuantity,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Deliveries (utleveranser) - kallan till trackingnummer for pickup-tracker
// ---------------------------------------------------------------------------

/**
 * Shelfless statusar. Notera att den STANNAR pa DISPATCHED: de vet inte om
 * kunden hamtat ut paketet. Deras `deliveryDate` ar dessutom identisk med
 * `shippedDate` pa sekunden (matt pa 1533 leveranser 2026-09-11) sa den betyder
 * "lamnade lagret", inte "kom fram". Uthamtning far hamtas fran Bring.
 */
export type ShelflessDeliveryStatus = "WAITING" | "EXRTA_HANDLING" | "DISPATCHED" | "CANCELED";

export interface ShelflessTrackingNumber {
  trackingNumber: string;
  trackingLink: string;
  isReturn: boolean;
}

export interface ShelflessShipment {
  courierName: string;
  freightService: string;
  freightServiceCode: string;
  trackingNumbers: ShelflessTrackingNumber[] | null;
}

export interface ShelflessDelivery {
  orderNumber: string;
  externalId: string | null;
  status: ShelflessDeliveryStatus;
  shippedDate: string | null;
  senderProfileId: number | null;
  pickupPointId: string | null;
  shipments: ShelflessShipment[] | null;
  deliveryRows: Array<{ productNumber: string | null; quantity: number }> | null;
  deliveryNotificationDetails: { email?: string | null; mobileNumber?: string | null } | null;
  deliveryAddress: { name?: string | null; countryCode?: string | null } | null;
}

interface ShelflessDeliveriesResponse {
  deliveries: ShelflessDelivery[];
  nextPage: string | null;
}

/**
 * Hamtar utskickade leveranser inom ett datumfonster (pa shippedDate).
 * Paginerar via `nextPage`. `maxPages` ar en sakerhetssparr sa en cron aldrig
 * kan fastna i en oandlig slinga om Shelfless returnerar en trasig markor.
 */
export async function fetchDispatchedDeliveries(opts: {
  shippedFrom: string; // YYYY-MM-DD
  shippedTo?: string; // YYYY-MM-DD
  maxPages?: number;
}): Promise<ShelflessDelivery[]> {
  const { shippedFrom, shippedTo, maxPages = 12 } = opts;
  const out: ShelflessDelivery[] = [];
  let url: string | null = `${SHELFLESS_API_BASE}/api/v1/deliveries?itemsPerPage=200`;
  let pages = 0;

  while (url && pages < maxPages) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SHELFLESS_TIMEOUT_MS);
    try {
      const res: Response = await fetch(url, {
        headers: { Authorization: getAuthHeader() },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Shelfless deliveries error (${res.status}): ${text.slice(0, 200)}`);
      }
      const data: ShelflessDeliveriesResponse = await res.json();
      for (const d of data.deliveries ?? []) {
        if (d.status !== "DISPATCHED") continue;
        const shipped = (d.shippedDate ?? "").slice(0, 10);
        if (!shipped || shipped < shippedFrom) continue;
        if (shippedTo && shipped > shippedTo) continue;
        out.push(d);
      }
      url = data.nextPage;
      pages += 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  return out;
}

/** Plockar forsta icke-retur-trackingnumret ur en leverans. */
export function primaryTrackingNumber(d: ShelflessDelivery): string | null {
  for (const s of d.shipments ?? []) {
    for (const t of s.trackingNumbers ?? []) {
      if (!t.isReturn) return t.trackingNumber;
    }
  }
  return null;
}

/** True om leveransen innehaller minst en kollagen-artikel. */
export function hasCollagenRow(d: ShelflessDelivery): boolean {
  return (d.deliveryRows ?? []).some((r) => (r.productNumber ?? "").toUpperCase().includes("COLLAGEN"));
}

/**
 * Legacy wrapper: returns disposable quantity only.
 * Used by existing Pulse metrics endpoint.
 */
export async function fetchHydro13Stock(): Promise<number> {
  if (!isShelflessConfigured()) {
    console.warn("Shelfless not configured — returning 0 stock");
    return 0;
  }
  try {
    const stock = await fetchStock();
    return stock.disposable;
  } catch (error) {
    console.error("Failed to fetch stock from Shelfless:", error);
    return 0;
  }
}
