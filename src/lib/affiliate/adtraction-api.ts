/**
 * Adtraction Publisher API v3 client.
 *
 * Endpoints (from https://adtractionv3.docs.apiary.io/):
 *  - GET https://api.adtraction.com/v3/partner/programs/ - list programs
 *  - POST https://api.adtraction.com/v3/partner/programs/apply/ - apply to program
 *  - GET https://api.adtraction.com/v3/partner/conversions/ - transactions
 *  - POST https://api.adtraction.com/v3/partner/links/ - generate deep link
 *
 * Authentication: API token in `X-Token` header. Token from your Adtraction
 * account under API section. Set in env as ADTRACTION_API_TOKEN.
 *
 * Rate limits: 30 quotas/min most endpoints (some 10/min). JSON responses.
 *
 * Notes:
 *  - Adservice (adservice.com) redirects to adtraction.com - same company now
 *  - Programs are per-market; SE programs need market=109 (Sweden)
 */

const ADTRACTION_BASE = "https://api.adtraction.com/v3";

// Adtraction market IDs (subset)
export const ADTRACTION_MARKETS = {
  SE: 109,
  NO: 110,
  DK: 111,
  FI: 112,
} as const;

interface AdtractionProgram {
  programId: number;
  programName: string;
  programUrl: string;
  programDescription: string;
  marketId: number;
  marketCurrency: string;
  status: number; // 0 = not approved, 1 = approved, 2 = pending
  baseCommission?: { value: number; type: "percent" | "fixed" };
  epc?: number;
  cookieDuration?: number; // days
  categories: string[];
}

export interface AdtractionProgramNormalized {
  advertiserId: string;
  name: string;
  domain: string;
  description: string;
  currency: string;
  status: "joined" | "available" | "pending";
  country: string;
  category: string;
  commissionRate: number | null;
  commissionText: string | null;
  epc: number | null;
  cookieDays: number | null;
}

function token(): string {
  const t = process.env.ADTRACTION_API_TOKEN?.trim();
  if (!t) throw new Error("ADTRACTION_API_TOKEN not set (get from Adtraction account -> API)");
  return t;
}

async function adFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${ADTRACTION_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Token": token(),
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Adtraction API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function statusFromCode(code: number): "joined" | "available" | "pending" {
  if (code === 1) return "joined";
  if (code === 2) return "pending";
  return "available";
}

function countryFromMarketId(id: number): string {
  const map: Record<number, string> = { 109: "SE", 110: "NO", 111: "DK", 112: "FI" };
  return map[id] || "";
}

export async function listPrograms(opts?: {
  marketId?: number;
  status?: "joined" | "available" | "all";
}): Promise<AdtractionProgramNormalized[]> {
  const params = new URLSearchParams();
  if (opts?.marketId) params.set("marketId", String(opts.marketId));
  if (opts?.status === "joined") params.set("approvalStatus", "1");
  if (opts?.status === "available") params.set("approvalStatus", "0");
  const path = `/partner/programs/?${params.toString()}`;
  const programs = await adFetch<AdtractionProgram[]>(path);
  return programs.map((p) => ({
    advertiserId: String(p.programId),
    name: p.programName,
    domain: p.programUrl,
    description: p.programDescription || "",
    currency: p.marketCurrency,
    status: statusFromCode(p.status),
    country: countryFromMarketId(p.marketId),
    category: (p.categories?.[0] || "").toLowerCase(),
    commissionRate: p.baseCommission?.type === "percent" ? p.baseCommission.value : null,
    commissionText: p.baseCommission
      ? `${p.baseCommission.value}${p.baseCommission.type === "percent" ? "%" : " " + p.marketCurrency}`
      : null,
    epc: p.epc ?? null,
    cookieDays: p.cookieDuration ?? null,
  }));
}

/**
 * Generate a deep tracking link to a specific URL on an advertiser's site.
 * Returns the trackable Adtraction redirect URL.
 */
export async function generateDeepLink(opts: {
  programId: string;
  destinationUrl: string;
  epi?: string; // custom parameter (e.g. article slug)
}): Promise<string> {
  const payload = {
    programId: Number(opts.programId),
    targetUrl: opts.destinationUrl,
    ...(opts.epi ? { epi: opts.epi } : {}),
  };
  const result = await adFetch<{ url: string }>("/partner/links/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return result.url;
}
