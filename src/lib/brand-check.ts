// brand-check.ts - knockout-koll av varumärke (TMview, EU+PRV+nationellt) + domän-varianter.
//
// TMview har inget officiellt API - vi anropar samma interna endpoint som sajtens frontend
// (samma som scripts/tmcheck.sh). Det är en IDENTITETS-/knockout-sökning, INTE en juridisk
// förväxlingsbedömning. Rapportera ALDRIG "clear" om ett anrop misslyckas (status "error").

import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type TmStatus = "clear" | "similar" | "caution" | "conflict" | "error";

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
  wordMatch: TmHit[]; // ditt ord som eget ord i ett annat märke (Vana Health) - hög risk
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

export type Overall = "free" | "caution" | "taken" | "unknown";

export interface BrandCheckResult {
  name: string;
  overall: Overall; // syntetiserad helhetsdom (varumärke + .com + webb)
  reasons: string[]; // korta skäl bakom domen
  trademark: TrademarkResult;
  domains: DomainResult[]; // bara .com först, sen varianter
  web: WebResult[]; // topp-webbträffar (DuckDuckGo) - finns ett kosttillskott redan?
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Väg ihop alla signaler till en tydlig helhetsdom + korta skäl. */
function computeOverall(
  name: string,
  trademark: TrademarkResult,
  domains: DomainResult[],
  web: WebResult[]
): { overall: Overall; reasons: string[] } {
  const label = toLabel(name);
  const reasons: string[] = [];

  const comBare = domains.find((d) => d.domain === `${label}.com`);
  const comTaken = comBare?.available === false;
  const webOnExactCom = web.some((w) => hostnameOf(w.url) === `${label}.com`);

  if (trademark.status === "error") {
    return { overall: "unknown", reasons: ["Varumärket kunde inte kollas - försök igen"] };
  }

  let overall: Overall = "free";

  if (trademark.exact.length > 0) {
    overall = "taken";
    reasons.push(`Exakt varumärke finns (${trademark.exact.length} st)`);
  }
  if (webOnExactCom) {
    overall = "taken";
    reasons.push(`Aktiv sajt på ${label}.com`);
  }
  if (trademark.wordMatch.length > 0 && comTaken) {
    overall = "taken";
    reasons.push("Ditt ord i ett varumärke + .com tagen");
  }

  if (overall !== "taken") {
    if (trademark.wordMatch.length > 0) {
      overall = "caution";
      reasons.push(`Ditt ord i annat varumärke (${trademark.wordMatch.length} st)`);
    }
    if (comTaken) {
      overall = "caution";
      reasons.push(`${label}.com är tagen`);
    }
    if (trademark.similar.length > 0) {
      if (overall === "free") overall = "caution";
      reasons.push(`${trademark.similar.length} liknande varumärken`);
    }
  }

  if (overall === "free") {
    reasons.push("Inga varumärkesträffar");
    if (comBare?.available === true) reasons.push(`${label}.com ledig`);
  }

  return { overall, reasons };
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

// Modulnivå-cache av TMview-cookien (återanvänds ~15 min) så vi inte hämtar den varje sökning.
let cookieCache: { value: string; at: number } | null = null;
const COOKIE_TTL_MS = 15 * 60 * 1000;

/** Hämta TMview-sessions-cookie (cachad). force=true tvingar fram en ny (vid strypning). */
export async function getTmviewCookie(force = false): Promise<string> {
  if (!force && cookieCache && Date.now() - cookieCache.at < COOKIE_TTL_MS) {
    return cookieCache.value;
  }
  try {
    const seed = await fetch("https://www.tmdn.org/tmview/", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    const value = cookieHeaderFrom(seed);
    cookieCache = { value, at: Date.now() };
    return value;
  } catch {
    return cookieCache?.value ?? "";
  }
}

// Bredare kontor så globala near-identiska brands fångas (inte bara EU/Norden):
// EM=EUIPO, WO=WIPO intl, US=USPTO, GB=UK, + nordiska.
const DEFAULT_OFFICES = ["EM", "WO", "US", "GB", "SE", "DK", "NO", "FI"];

interface RawMark {
  tmName?: string;
  tmOffice?: string;
  tradeMarkStatus?: string;
  niceClass?: string[];
  tradeMarkType?: string;
  applicantName?: string[];
}

async function tmviewQuery(
  term: string,
  offices: string[],
  niceClasses: string[],
  cookie: string
): Promise<{ total: number; marks: RawMark[] }> {
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
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { totalResults?: number; tradeMarks?: RawMark[] };
  return { total: data.totalResults ?? 0, marks: data.tradeMarks ?? [] };
}

// Skiljetecken-/mellanslags-okänslig normalisering: "Inner Fuel" == "innerfuel" == "INNER-FUEL"
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const tokenize = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
// Sant om needle-tokens finns som sammanhängande sekvens i hay (t.ex. ["vana"] i ["vana","health"])
function containsRun(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || hay.length < needle.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((t, j) => hay[i + j] === t)) return true;
  }
  return false;
}

/** Varumärkes-knockout via TMview. Söker både den skrivna och den hopskrivna formen. */
export async function checkTrademark(
  term: string,
  opts?: { offices?: string[]; niceClasses?: string[]; cookie?: string }
): Promise<TrademarkResult> {
  const offices = opts?.offices ?? DEFAULT_OFFICES;
  const niceClasses = opts?.niceClasses ?? ["3", "5"];
  try {
    let cookie = opts?.cookie ?? (await getTmviewCookie());

    // Sök både "inner fuel" och "innerfuel" så ett-ords-varianter fångas
    const collapsed = term.replace(/\s+/g, "");
    const terms = normName(term) === collapsed.toLowerCase() && term !== collapsed ? [term, collapsed] : [term];
    if (term.includes(" ") && !terms.includes(collapsed)) terms.push(collapsed);

    // Fail-fast: inget retry (Vercel->TMview är trögt; hellre snabbt svar med skäl)
    const backoff: number[] = [];
    let lastReason = "okänt fel";
    const queryWithRetry = async (t: string): Promise<{ total: number; marks: RawMark[] } | null> => {
      for (let i = 0; ; i++) {
        try {
          return await tmviewQuery(t, offices, niceClasses, cookie);
        } catch (e) {
          lastReason = e instanceof Error ? e.message : "fel";
          if (i >= backoff.length) return null;
          await new Promise((res) => setTimeout(res, backoff[i]));
          cookie = await getTmviewCookie(true); // tvinga fram ny cookie inför nästa försök
        }
      }
    };

    let total = 0;
    const all: RawMark[] = [];
    let anyOk = false;
    for (const t of Array.from(new Set(terms))) {
      const r = await queryWithRetry(t);
      if (r === null) continue;
      anyOk = true;
      total = Math.max(total, r.total);
      all.push(...r.marks);
    }
    if (!anyOk) {
      return { status: "error", total: 0, exact: [], wordMatch: [], similar: [], error: `TMview: ${lastReason}` };
    }

    // Dedupe
    const seen = new Set<string>();
    const marks: RawMark[] = [];
    for (const m of all) {
      const k = `${m.tmName}|${m.tmOffice}|${(m.niceClass ?? []).join(",")}|${m.tradeMarkStatus}`;
      if (!seen.has(k)) {
        seen.add(k);
        marks.push(m);
      }
    }

    const toHit = (m: RawMark): TmHit => ({
      name: m.tmName ?? "?",
      office: m.tmOffice ?? "?",
      status: m.tradeMarkStatus ?? "?",
      niceClasses: m.niceClass ?? [],
      type: m.tradeMarkType ?? "?",
      owner: (m.applicantName ?? ["?"]).join("/"),
    });

    // Filtrera bort döda/utgångna märken (blockerar i regel inte)
    const DEAD = /(expired|ended|withdraw|refus|cancel|invalid|surrender|laps|reject|removed|abandon)/i;
    const liveMarks = marks.filter((m) => !DEAD.test(m.tradeMarkStatus ?? ""));

    const termNorm = normName(term);
    const termTokens = tokenize(term);
    const isExact = (m: RawMark) => normName(m.tmName ?? "") === termNorm;
    // "ditt ord som eget ord": ditt namn finns som sammanhängande token-sekvens (Vana Health,
    // Veda Vana) - men INTE bara som bokstavssträng (Vanadium). Exakt exkluderas.
    const isWordMatch = (m: RawMark) => !isExact(m) && containsRun(tokenize(m.tmName ?? ""), termTokens);

    const exact = liveMarks.filter(isExact).map(toHit);
    const wordMatch = liveMarks.filter(isWordMatch).slice(0, 8).map(toHit);
    const similar = liveMarks
      .filter((m) => !isExact(m) && !isWordMatch(m))
      .slice(0, 8)
      .map(toHit);

    let status: TmStatus = "clear";
    if (exact.length > 0) status = "conflict";
    else if (wordMatch.length > 0) status = "caution";
    else if (similar.length > 0) status = "similar";

    return { status, total: liveMarks.length, exact, wordMatch, similar };
  } catch (e) {
    return {
      status: "error",
      total: 0,
      exact: [],
      wordMatch: [],
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
      signal: AbortSignal.timeout(10000),
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
      signal: AbortSignal.timeout(8000),
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
  opts?: { offices?: string[]; niceClasses?: string[]; cookie?: string }
): Promise<BrandCheckResult> {
  const [trademark, domains, web] = await Promise.all([
    checkTrademark(name, opts),
    checkDomains(name),
    checkWeb(name),
  ]);
  const { overall, reasons } = computeOverall(name, trademark, domains, web);
  return { name, overall, reasons, trademark, domains, web };
}

// Delad batch-körning med Supabase-cache (7 dygn). Används av både inloggade
// /api/brand-check och publika /api/bcheck.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Shortlist (sparade favoritnamn) ----

export interface ShortlistItem {
  name: string;
  note: string;
  overall: Overall | null;
  snapshot: unknown;
  created_at: string;
}

export async function getShortlist(): Promise<ShortlistItem[]> {
  const { createServerSupabase } = await import("@/lib/supabase-admin");
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("brand_shortlist")
    .select("name, note, overall, snapshot, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as ShortlistItem[];
}

export async function saveShortlist(
  name: string,
  note = "",
  overall: Overall | null = null,
  snapshot: unknown = null
): Promise<void> {
  const { createServerSupabase } = await import("@/lib/supabase-admin");
  const supabase = createServerSupabase();
  await supabase
    .from("brand_shortlist")
    .upsert({ name: name.trim(), note, overall, snapshot }, { onConflict: "name" });
}

export async function updateShortlistNote(name: string, note: string): Promise<void> {
  const { createServerSupabase } = await import("@/lib/supabase-admin");
  const supabase = createServerSupabase();
  await supabase.from("brand_shortlist").update({ note }).eq("name", name.trim());
}

export async function removeShortlist(name: string): Promise<void> {
  const { createServerSupabase } = await import("@/lib/supabase-admin");
  const supabase = createServerSupabase();
  await supabase.from("brand_shortlist").delete().eq("name", name.trim());
}

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
  let cookie: string | null = null; // hämtas en gång, återanvänds över batchen
  for (const name of names) {
    const hit = cacheMap.get(name);
    // Cacha bara om resultatet har de nya fälten (annars kör om mot ny version)
    if (
      hit &&
      typeof hit.result.overall === "string" &&
      Array.isArray(hit.result.domains) &&
      Array.isArray(hit.result.web) &&
      Array.isArray(hit.result.trademark?.wordMatch) &&
      Date.now() - new Date(hit.checked_at).getTime() < CACHE_TTL_MS
    ) {
      results.push(hit.result);
      continue;
    }
    // Första nät-namnet: hämta cookie. Övriga: pausa så vi inte stryps av TMview.
    if (cookie === null) cookie = await getTmviewCookie();
    else await sleep(1200);

    const result = await checkBrandName(name, {
      offices: officesArr,
      niceClasses: niceArr,
      cookie: cookie || undefined,
    });
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
