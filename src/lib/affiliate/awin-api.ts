/**
 * Awin Publisher API client.
 *
 * Endpoints:
 *  - GET https://api.awin.com/publishers/{pubId}/programmes - joined + available programs
 *  - GET https://api.awin.com/publishers/{pubId}/transactions/ - earnings
 *  - POST https://api.awin.com/publishers/{pubId}/linkbuilder/generate - deep links
 *
 * Authentication: Bearer token from https://ui.awin.com/awin-api
 * Rate limit: 20 requests/minute per token.
 *
 * Token belongs to user account, not publisher account - one token can
 * access multiple publishers if user has access. Set in env as AWIN_API_TOKEN.
 */

const AWIN_BASE = "https://api.awin.com";

interface AwinProgramme {
  id: number;
  name: string;
  displayUrl: string;
  description: string;
  logoUrl: string;
  currencyCode: string;
  status: "joined" | "rejected" | "pending" | "notjoined";
  primaryRegion: { name: string; countryCode: string };
  primarySector: string;
  validDomains: string[];
  commissionRange?: { min: number; max: number };
}

export interface AwinProgrammeNormalized {
  advertiserId: string;
  name: string;
  domain: string;
  description: string;
  currency: string;
  status: string;
  country: string;
  category: string;
  commissionRate: number | null;
  commissionText: string | null;
}

function token(): string {
  const t = process.env.AWIN_API_TOKEN?.trim();
  if (!t) throw new Error("AWIN_API_TOKEN not set (get from https://ui.awin.com/awin-api)");
  return t;
}

function publisherId(): string {
  const id = process.env.AWIN_PUBLISHER_ID?.trim();
  if (!id) throw new Error("AWIN_PUBLISHER_ID not set (e.g. 1949105 for Incensor AB)");
  return id;
}

async function awinFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${AWIN_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token()}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Awin API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/**
 * List all programmes accessible to this publisher account, in given status.
 * Awin returns up to 1000 per call - we don't paginate (Sweden region rarely has more).
 */
export async function listProgrammes(
  opts?: { relationship?: "joined" | "notjoined" | "pending"; countryCode?: string }
): Promise<AwinProgrammeNormalized[]> {
  const params = new URLSearchParams();
  if (opts?.relationship) params.set("relationship", opts.relationship);
  if (opts?.countryCode) params.set("countryCode", opts.countryCode);
  const path = `/publishers/${publisherId()}/programmes?${params.toString()}`;
  const programmes = await awinFetch<AwinProgramme[]>(path);
  return programmes.map((p) => ({
    advertiserId: String(p.id),
    name: p.name,
    domain: p.displayUrl || p.validDomains?.[0] || "",
    description: p.description || "",
    currency: p.currencyCode,
    status: p.status === "notjoined" ? "available" : p.status,
    country: p.primaryRegion?.countryCode || "",
    category: (p.primarySector || "").toLowerCase(),
    commissionRate: p.commissionRange?.max ?? null,
    commissionText: p.commissionRange
      ? `${p.commissionRange.min}-${p.commissionRange.max}%`
      : null,
  }));
}

/**
 * Generate a deep affiliate link for a specific URL using Awin's Link Builder.
 * Example output: https://www.awin1.com/cread.php?awinmid=8995&awinaffid=1949105&p=...
 */
export async function generateDeepLink(opts: {
  advertiserId: string;
  destinationUrl: string;
  clickRef?: string;
}): Promise<string> {
  const payload = {
    advertiserId: opts.advertiserId,
    destinationUrl: opts.destinationUrl,
    ...(opts.clickRef ? { clickRef: opts.clickRef } : {}),
  };
  const result = await awinFetch<{ url: string }>(
    `/publishers/${publisherId()}/linkbuilder/generate`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  return result.url;
}
