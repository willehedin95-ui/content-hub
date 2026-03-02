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
