// brand-check.ts - knockout-koll av varumärke (TMview, EU+PRV+nationellt) + domän-varianter.
//
// TMview har inget officiellt API - vi anropar samma interna endpoint som sajtens frontend
// (samma som scripts/tmcheck.sh). Det är en IDENTITETS-/knockout-sökning, INTE en juridisk
// förväxlingsbedömning. Rapportera ALDRIG "clear" om ett anrop misslyckas (status "error").

import * as cheerio from "cheerio";

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
}

export interface WebResult {
  title: string;
  url: string;
}

export interface BrandCheckResult {
  name: string;
  trademark: TrademarkResult;
  domains: DomainResult[]; // bara .com först, sen varianter
  web: WebResult[]; // topp-webbträffar (DuckDuckGo) - finns ett kosttillskott redan?
}

function cookieHeaderFrom(res: Response): string {
  const raw =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : res.headers.get("set-cookie")
      ? [res.headers.get("set-cookie") as string]
      : [];
  return raw.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

/** Varumärkes-knockout via TMview. */
export async function checkTrademark(
  term: string,
  opts?: { offices?: string[]; niceClasses?: string[] }
): Promise<TrademarkResult> {
  const offices = opts?.offices ?? ["EM", "SE", "DK", "NO"];
  const niceClasses = opts?.niceClasses ?? ["3", "5"];
  try {
    const seed = await fetch("https://www.tmdn.org/tmview/", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    const cookie = cookieHeaderFrom(seed);

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
      .slice(0, 8)
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

/** Ren domän-label av ett brand-namn (gemener, bara a-z0-9). */
export function toLabel(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Domän-varianter att kolla (bare .com först). */
export function domainVariants(name: string): string[] {
  const l = toLabel(name);
  if (!l) return [];
  return [
    `${l}.com`,
    `get${l}.com`,
    `try${l}.com`,
    `${l}health.com`,
    `${l}supps.com`,
    `${l}nutrition.com`,
  ];
}

/** Domäntillgänglighet via RDAP (rdap.org routar till rätt register). 404 = ledig, 200 = tagen. */
async function checkDomain(domain: string): Promise<DomainResult> {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: "application/rdap+json" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return { domain, available: true };
    if (res.ok) return { domain, available: false };
    return { domain, available: null };
  } catch {
    return { domain, available: null };
  }
}

export async function checkDomains(name: string): Promise<DomainResult[]> {
  const variants = domainVariants(name);
  return Promise.all(variants.map(checkDomain));
}

/** Topp-webbträffar via DuckDuckGo HTML (gratis, ingen nyckel). Best-effort - [] vid fel. */
export async function checkWeb(name: string): Promise<WebResult[]> {
  try {
    const q = encodeURIComponent(`${name} supplement`);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const $ = cheerio.load(await res.text());
    const out: WebResult[] = [];
    $("a.result__a").each((_, el) => {
      if (out.length >= 5) return;
      const title = $(el).text().trim();
      let href = $(el).attr("href") ?? "";
      const m = href.match(/[?&]uddg=([^&]+)/);
      if (m) href = decodeURIComponent(m[1]);
      else if (href.startsWith("//")) href = "https:" + href;
      // Hoppa över DuckDuckGo-annonser/interna länkar (y.js, ad_domain)
      if (href.includes("duckduckgo.com")) return;
      if (title && href.startsWith("http")) out.push({ title, url: href });
    });
    return out;
  } catch {
    return [];
  }
}

export async function checkBrandName(
  name: string,
  opts?: { offices?: string[]; niceClasses?: string[] }
): Promise<BrandCheckResult> {
  const [trademark, domains, web] = await Promise.all([
    checkTrademark(name, opts),
    checkDomains(name),
    checkWeb(name),
  ]);
  return { name, trademark, domains, web };
}

// Delad batch-körning med Supabase-cache (7 dygn). Används av både inloggade
// /api/brand-check och publika /api/bcheck.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runBrandChecks(
  rawNames: string[],
  niceClasses = "3,5",
  offices = "EM,SE,DK,NO"
): Promise<BrandCheckResult[]> {
  const { createServerSupabase } = await import("@/lib/supabase-admin");
  const names = Array.from(new Set(rawNames.map((n) => n.trim()).filter(Boolean))).slice(0, 40);
  if (names.length === 0) return [];

  const officesArr = offices.split(",").map((s) => s.trim()).filter(Boolean);
  const niceArr = niceClasses.split(",").map((s) => s.trim()).filter(Boolean);

  const supabase = createServerSupabase();
  const { data: cached } = await supabase
    .from("brand_check_cache")
    .select("name, result, checked_at")
    .in("name", names)
    .eq("nice_classes", niceClasses)
    .eq("offices", offices);

  const cacheMap = new Map<string, { result: BrandCheckResult; checked_at: string }>();
  for (const row of cached ?? []) {
    cacheMap.set(row.name as string, {
      result: row.result as BrandCheckResult,
      checked_at: row.checked_at as string,
    });
  }

  const results: BrandCheckResult[] = [];
  let didNetwork = false;
  for (const name of names) {
    const hit = cacheMap.get(name);
    // Cacha bara om resultatet har de nya domän-fälten (annars kör om mot ny version)
    if (
      hit &&
      Array.isArray(hit.result.domains) &&
      Array.isArray(hit.result.web) &&
      Date.now() - new Date(hit.checked_at).getTime() < CACHE_TTL_MS
    ) {
      results.push(hit.result);
      continue;
    }
    if (didNetwork) await sleep(300);
    didNetwork = true;

    const result = await checkBrandName(name, { offices: officesArr, niceClasses: niceArr });
    results.push(result);

    const comOk = result.domains.find((d) => d.domain === `${toLabel(name)}.com`)?.available !== null;
    if (result.trademark.status !== "error" && comOk) {
      await supabase.from("brand_check_cache").upsert(
        { name, nice_classes: niceClasses, offices, result, checked_at: new Date().toISOString() },
        { onConflict: "name,nice_classes,offices" }
      );
    }
  }
  return results;
}
