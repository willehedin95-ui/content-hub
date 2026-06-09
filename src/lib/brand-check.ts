// brand-check.ts - knockout-koll av varumärke (TMview, EU+PRV+nationellt) + .com-domän.
//
// TMview har inget officiellt API - vi anropar samma interna endpoint som sajtens frontend
// (samma som scripts/tmcheck.sh). Det är en IDENTITETS-/knockout-sökning, INTE en juridisk
// förväxlingsbedömning. Resultatet ska aldrig tolkas som "fritt att registrera" - bara som
// en första gallring före riktig clearance hos jurist.
//
// VIKTIGT: rapportera ALDRIG "clear" om ett anrop misslyckas - då returneras status "error".

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type TmStatus = "clear" | "similar" | "conflict" | "error";

export interface TmHit {
  name: string;
  office: string;
  status: string;
  niceClasses: string[];
  type: string;
  owner: string;
}

export interface TrademarkResult {
  status: TmStatus;
  total: number;
  exact: TmHit[];
  similar: TmHit[];
  error?: string;
}

export interface DomainResult {
  domain: string;
  available: boolean | null; // null = okänt (fel vid koll)
  error?: string;
}

export interface BrandCheckResult {
  name: string;
  trademark: TrademarkResult;
  dotcom: DomainResult;
}

// Slå ihop set-cookie-värden till en cookie-header (name=value; ...)
function cookieHeaderFrom(res: Response): string {
  // Node 20+: getSetCookie() ger en array; annars fall tillbaka på get()
  const raw =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
  return raw
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

/** Varumärkes-knockout via TMview. offices/niceClasses som arrayer. */
export async function checkTrademark(
  term: string,
  opts?: { offices?: string[]; niceClasses?: string[] }
): Promise<TrademarkResult> {
  const offices = opts?.offices ?? ["EM", "SE", "DK", "NO"];
  const niceClasses = opts?.niceClasses ?? ["3", "5"];
  try {
    // 1) Sessions-cookie från frontend (krävs av endpointen)
    const seed = await fetch("https://www.tmdn.org/tmview/", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    const cookie = cookieHeaderFrom(seed);

    // 2) Sök
    const res = await fetch("https://www.tmdn.org/tmview/api/search/results", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://www.tmdn.org",
        Referer: "https://www.tmdn.org/tmview/",
        "User-Agent": UA,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({
        page: "1",
        pageSize: "50",
        criteria: "C",
        basicSearch: term,
        fOffices: offices,
        fNiceClass: niceClasses,
        fTMStatus: [],
        fTMType: [],
        fGoodsServices: [],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return { status: "error", total: 0, exact: [], similar: [], error: `TMview HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      totalResults?: number;
      tradeMarks?: Array<{
        tmName?: string;
        tmOffice?: string;
        tradeMarkStatus?: string;
        niceClass?: string[];
        tradeMarkType?: string;
        applicantName?: string[];
      }>;
    };

    const total = data.totalResults ?? 0;
    const marks = data.tradeMarks ?? [];
    const norm = (s: string) => s.trim().toLowerCase();
    const toHit = (m: NonNullable<typeof marks>[number]): TmHit => ({
      name: m.tmName ?? "?",
      office: m.tmOffice ?? "?",
      status: m.tradeMarkStatus ?? "?",
      niceClasses: m.niceClass ?? [],
      type: m.tradeMarkType ?? "?",
      owner: (m.applicantName ?? ["?"]).join("/"),
    });

    const exact = marks.filter((m) => norm(m.tmName ?? "") === norm(term)).map(toHit);
    const similar = marks
      .filter((m) => norm(m.tmName ?? "") !== norm(term))
      .slice(0, 5)
      .map(toHit);

    let status: TmStatus = "clear";
    if (exact.length > 0) status = "conflict";
    else if (total > 0) status = "similar";

    return { status, total, exact, similar };
  } catch (e) {
    return {
      status: "error",
      total: 0,
      exact: [],
      similar: [],
      error: e instanceof Error ? e.message : "okänt fel",
    };
  }
}

/** Gör en .com-domänsträng av ett brand-namn (gemener, bara a-z0-9). */
export function toDotComLabel(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** .com-tillgänglighet via Verisign RDAP. 404 = ledig, 200 = tagen. */
export async function checkDotCom(name: string): Promise<DomainResult> {
  const label = toDotComLabel(name);
  const domain = `${label}.com`;
  if (!label) return { domain, available: null, error: "tomt namn" };
  try {
    const res = await fetch(`https://rdap.verisign.com/com/v1/domain/${label.toUpperCase()}.COM`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return { domain, available: true };
    if (res.ok) return { domain, available: false };
    return { domain, available: null, error: `RDAP HTTP ${res.status}` };
  } catch (e) {
    return { domain, available: null, error: e instanceof Error ? e.message : "okänt fel" };
  }
}

export async function checkBrandName(
  name: string,
  opts?: { offices?: string[]; niceClasses?: string[] }
): Promise<BrandCheckResult> {
  const [trademark, dotcom] = await Promise.all([checkTrademark(name, opts), checkDotCom(name)]);
  return { name, trademark, dotcom };
}
