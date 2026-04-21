/**
 * PubMed E-utilities client for grounding blog article citations in
 * verified research.
 *
 * Flow: esearch(query) -> PMIDs -> esummary(PMIDs) -> study metadata.
 * Callers get back a list of real studies (title, abstract snippet, year,
 * design) that the article writer is instructed to cite. Everything in the
 * list links to `https://pubmed.ncbi.nlm.nih.gov/{pmid}/`, which is
 * stable and publicly accessible.
 *
 * Why: most of our published articles had zero research citations despite
 * health/YMYL content. Affiliate competitors (tillskottestarna.se,
 * kollagenguiden.se) cite 20+ studies per article. We can't compete on
 * trust signals without grounding in real sources.
 *
 * Rate limits: NCBI allows 3 req/sec anonymous, 10 req/sec with an API key
 * (set NCBI_API_KEY env var). We do sequential esearch + esummary, so
 * well under the ceiling even at 1 article/day.
 */

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

// Simple sequential rate limiter. NCBI allows 3 req/sec anonymous, 10/sec
// with an API key. Use 500ms with API key bypass for safe margin — 3/sec
// would theoretically allow 333ms, but network jitter + NCBI's reported
// count (which includes retries) pushes us over without buffer.
const MIN_REQUEST_GAP_MS = process.env.NCBI_API_KEY ? 150 : 500;
let lastRequestAt = 0;
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS - elapsed));
  }
  lastRequestAt = Date.now();
  try {
    return await fn();
  } catch (err) {
    // If the request returned 429, wait 2s and retry once. This absorbs
    // NCBI's count-based rate limiter when we happen to race the window.
    if (err instanceof Error && err.message.includes("429")) {
      await new Promise((r) => setTimeout(r, 2000));
      lastRequestAt = Date.now();
      return fn();
    }
    throw err;
  }
}

export interface VerifiedStudy {
  pmid: string;
  title: string;
  year: number;
  authors: string[];
  journal: string;
  abstractSnippet: string;
  url: string;
  // Study design category extracted from publication type tags
  design: "review" | "meta-analysis" | "rct" | "other";
}

interface SearchOptions {
  /** Max studies to return (after filter). Defaults to 8. */
  limit?: number;
  /** Minimum publication year. Defaults to current year - 10. */
  minYear?: number;
  /** Only Review/Meta-Analysis/RCT. Defaults to true. */
  strictDesigns?: boolean;
}

/**
 * Search PubMed for studies relevant to a topic.
 *
 * Builds a query that combines keywords with PubMed's publication-type
 * filters for high-quality evidence (reviews, meta-analyses, RCTs), then
 * fetches summaries for the top matches.
 */
export async function findRelevantStudies(
  primaryKeyword: string,
  secondaryKeywords: string[] = [],
  opts: SearchOptions = {}
): Promise<VerifiedStudy[]> {
  const limit = opts.limit ?? 8;
  const minYear = opts.minYear ?? new Date().getFullYear() - 10;
  const strict = opts.strictDesigns !== false;

  // Clean + translate keyword for PubMed (English-only search works better
  // since most biomedical literature is indexed in English). If the caller
  // passes a Swedish keyword like "hydrolyserat kollagen", translate common
  // Swedish health terms; otherwise pass through.
  const englishQuery = translateKeywordToEnglish(primaryKeyword, secondaryKeywords);

  const pubTypeFilter = strict
    ? ' AND (Review[ptyp] OR Meta-Analysis[ptyp] OR Randomized Controlled Trial[ptyp])'
    : "";
  const dateFilter = ` AND ("${minYear}"[PDAT] : "3000"[PDAT])`;
  const humanFilter = " AND humans[MeSH]";

  // Build a primary-only variant (drop secondary OR-group) for fallback when
  // secondary terms are noise (e.g. "dryck OR drickbart OR shots" → 0 hits).
  // Quick hack: strip anything after "AND (" (the secondary OR-group).
  const primaryOnlyQuery = englishQuery.replace(/\s+AND\s+\([^)]+\)\s*$/, "");

  // Try progressively broader queries until we hit `limit` results. Start
  // strict (all filters) -> drop human filter -> drop pubtype filter ->
  // drop date filter -> drop secondary entirely. This gives good results on
  // common topics but still finds something on edge cases.
  const querySteps = [
    `${englishQuery}${humanFilter}${pubTypeFilter}${dateFilter}`,
    `${englishQuery}${pubTypeFilter}${dateFilter}`,
    `${englishQuery}${dateFilter}`,
    englishQuery,
    `${primaryOnlyQuery}${humanFilter}${pubTypeFilter}${dateFilter}`,
    primaryOnlyQuery,
  ].filter((q, i, a) => a.indexOf(q) === i); // dedupe if primaryOnly === full query

  let pmids: string[] = [];
  for (const term of querySteps) {
    pmids = await throttled(async () => {
      const esearchUrl = new URL(`${EUTILS_BASE}/esearch.fcgi`);
      esearchUrl.searchParams.set("db", "pubmed");
      esearchUrl.searchParams.set("term", term);
      esearchUrl.searchParams.set("retmax", String(limit * 3));
      esearchUrl.searchParams.set("retmode", "json");
      esearchUrl.searchParams.set("sort", "relevance");
      if (process.env.NCBI_API_KEY) {
        esearchUrl.searchParams.set("api_key", process.env.NCBI_API_KEY);
      }
      if (process.env.PUBMED_DEBUG) console.log(`[pubmed] query: ${term}`);
      const res = await fetch(esearchUrl.toString());
      if (!res.ok) throw new Error(`PubMed esearch failed (${res.status}): ${await res.text()}`);
      const data = (await res.json()) as { esearchresult?: { idlist?: string[]; count?: string } };
      if (process.env.PUBMED_DEBUG) {
        console.log(`[pubmed]   -> ${data.esearchresult?.count ?? "?"} total hits, returning ${(data.esearchresult?.idlist ?? []).length}`);
      }
      return data.esearchresult?.idlist ?? [];
    });
    if (pmids.length >= limit) break;
  }

  if (pmids.length === 0) return [];

  // Step 2: esummary -> metadata (title, year, authors, journal, pubtypes)
  const summaryData = await throttled(async () => {
    const esummaryUrl = new URL(`${EUTILS_BASE}/esummary.fcgi`);
    esummaryUrl.searchParams.set("db", "pubmed");
    esummaryUrl.searchParams.set("id", pmids.join(","));
    esummaryUrl.searchParams.set("retmode", "json");
    if (process.env.NCBI_API_KEY) {
      esummaryUrl.searchParams.set("api_key", process.env.NCBI_API_KEY);
    }
    const res = await fetch(esummaryUrl.toString());
    if (!res.ok) throw new Error(`PubMed esummary failed (${res.status}): ${await res.text()}`);
    return (await res.json()) as { result?: Record<string, unknown> };
  });

  // Step 3: parse + rank + truncate to limit
  const studies: VerifiedStudy[] = [];
  const order = (summaryData.result?.uids as string[]) ?? pmids;
  for (const pmid of order) {
    const row = summaryData.result?.[pmid] as
      | {
          title?: string;
          pubdate?: string;
          authors?: Array<{ name?: string }>;
          fulljournalname?: string;
          source?: string;
          pubtype?: string[];
        }
      | undefined;
    if (!row) continue;

    const year = parseYear(row.pubdate);
    if (!year || year < minYear) continue;

    const design = classifyDesign(row.pubtype ?? []);
    // Note: we don't hard-filter on design here — the query-level pubtype
    // filter already handles that when `strict`. Accepting "other" at this
    // stage lets the progressive broader search surface lower-tier evidence
    // when nothing better exists.

    studies.push({
      pmid,
      title: (row.title || "").replace(/\.$/, ""),
      year,
      authors: (row.authors ?? []).map((a) => a.name || "").filter(Boolean).slice(0, 3),
      journal: row.fulljournalname || row.source || "",
      abstractSnippet: "", // esummary doesn't include abstract; fetchAbstracts() adds on demand
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      design,
    });
    if (studies.length >= limit) break;
  }

  return studies;
}

/**
 * Fetch abstract text for a list of PMIDs and merge into studies.
 * Separate step because esummary doesn't include abstracts.
 * Returns a new array; the input is not mutated.
 */
export async function enrichWithAbstracts(studies: VerifiedStudy[]): Promise<VerifiedStudy[]> {
  if (studies.length === 0) return studies;

  const pmids = studies.map((s) => s.pmid);
  const url = new URL(`${EUTILS_BASE}/efetch.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("id", pmids.join(","));
  url.searchParams.set("rettype", "abstract");
  url.searchParams.set("retmode", "text");
  if (process.env.NCBI_API_KEY) {
    url.searchParams.set("api_key", process.env.NCBI_API_KEY);
  }

  const text = await throttled(async () => {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`[pubmed] efetch failed, skipping abstracts: ${res.status}`);
      return "";
    }
    return res.text();
  });
  if (!text) return studies;

  // Text output format: each article separated by two blank lines, PMID at
  // end, abstract somewhere in between. We split on the PMID marker lines
  // and use simple heuristics to pick the abstract paragraph.
  const blocks = text.split(/\n\nPMID:\s*(\d+)/);
  const abstractByPmid = new Map<string, string>();
  for (let i = 1; i < blocks.length; i += 2) {
    const pmid = blocks[i];
    const prev = blocks[i - 1] || "";
    // Abstract is usually the longest paragraph in the block
    const paragraphs = prev.split(/\n\n/).map((p) => p.replace(/\n/g, " ").trim());
    const longest = paragraphs.sort((a, b) => b.length - a.length)[0] || "";
    if (longest) abstractByPmid.set(pmid, longest);
  }

  return studies.map((s) => ({
    ...s,
    abstractSnippet: (abstractByPmid.get(s.pmid) || "").slice(0, 400),
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseYear(pubdate: string | undefined): number | null {
  if (!pubdate) return null;
  const match = pubdate.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

function classifyDesign(pubtypes: string[]): VerifiedStudy["design"] {
  const normalized = pubtypes.map((t) => t.toLowerCase());
  if (normalized.some((t) => t.includes("meta-analysis"))) return "meta-analysis";
  if (normalized.some((t) => t.includes("review") && !t.includes("book review"))) return "review";
  if (normalized.some((t) => t.includes("randomized controlled trial"))) return "rct";
  return "other";
}

/**
 * Map common Swedish health-topic terms to English for PubMed search.
 * Falls back to the raw keyword. Conservative — better to miss some
 * translations than introduce false matches.
 */
/**
 * Strip qualifier noise ("supplementation", "skin aging") from an English term
 * and keep the main concept for PubMed search. Multi-word phrases are
 * wrapped in parens so AND/OR still parses correctly.
 */
function extractKeyTerm(term: string): string {
  // If term is one word, return as-is
  const tokens = term.trim().split(/\s+/);
  if (tokens.length <= 1) return tokens[0] || term;
  // If multiword, join with () so PubMed treats it as a grouped term
  return `(${tokens.join(" ")})`;
}

// Order MATTERS — more specific multi-word patterns must come before
// single-word ones. Otherwise \bkollagen\b consumes the word inside
// "marint kollagen" before \bmarint kollagen\b ever gets a chance to match,
// leaving "marint" as a Swedish leftover that breaks PubMed queries.
const SV_EN_TERMS: Array<[RegExp, string]> = [
  [/\bhydrolyserat kollagen\b/i, "hydrolyzed collagen peptides"],
  [/\bmarint kollagen\b/i, "marine collagen"],
  [/\bbovint kollagen\b/i, "bovine collagen"],
  [/\bveganskt kollagen\b/i, "vegan collagen"],
  [/\bkollagen peptider\b/i, "collagen peptides"],
  [/\bkollagenpeptider\b/i, "collagen peptides"],
  [/\bkollagen\b/i, "collagen supplementation"],
  [/\bhyaluronsyra\b/i, "hyaluronic acid"],
  [/\bc-?vitamin\b/i, "vitamin C"],
  [/\brynkor\b/i, "wrinkles skin aging"],
  [/\bhud\b/i, "skin"],
  [/\bleder\b/i, "joint"],
  [/\bh[åa]r\b/i, "hair"],
  [/\bnaglar\b/i, "nails"],
  [/\bklimakteri(et|um)\b/i, "menopause"],
  [/\bh[åa]ravfall\b/i, "hair loss"],
  [/\bgraviditet(en)?\b/i, "pregnancy"],
  [/\bbiverkningar\b/i, "safety adverse effects"],
  [/\bs[öo]mn\b/i, "sleep"],
  [/\bs[öo]mnl[öo]shet\b/i, "insomnia"],
  [/\bs[öo]mnbrist\b/i, "sleep deprivation"],
  [/\bmelatonin\b/i, "melatonin"],
  [/\bmagnesium\b/i, "magnesium"],
  [/\bnaturligt?\b/i, "natural"],
  [/\boka\b/i, "increase"],
  [/\benbuljong\b/i, "bone broth"],
  // "bäst i test" is a Swedish search-intent marker, not a medical concept.
  // Dropping it via mapping to empty string removes noise from the query.
  [/\bb[aä]st (i )?test\b/i, ""],
  [/\bpulver\b/i, "powder"],
  [/\bkapslar?\b/i, "capsule"],
  [/\btabletter?\b/i, "tablet"],
  [/\bflytande\b/i, "liquid"],
  [/\bforskning\b/i, "research"],
  [/\bstudier?\b/i, "study"],
  [/\bdose?ring\b/i, "dose"],
  [/\btidpunkt\b/i, "timing"],
  [/\bmat\b/i, "food"],
  [/\blivsmedel\b/i, "food"],
];

/**
 * Heuristic: does this string look like English?
 * Drops obvious Swedish words so they don't end up in the PubMed query as
 * garbage terms (which return 0 results).
 */
function looksEnglish(s: string): boolean {
  if (/[åäöÅÄÖ]/.test(s)) return false;
  // Swedish-specific letter combos that rarely appear in English
  if (/\b(och|eller|att|med|for|pa|till|om|efter|ska|sa|kan|ar|vad|hur|basta|bast|mot)\b/i.test(s)) return false;
  return true;
}

function translateKeywordToEnglish(primary: string, secondary: string[] = []): string {
  function translate(term: string): { mapped: string[]; leftover: string[] } {
    let remaining = term;
    const mapped: string[] = [];
    for (const [re, en] of SV_EN_TERMS) {
      if (re.test(remaining)) {
        if (en) mapped.push(en); // empty mapping = consume but don't add
        remaining = remaining.replace(re, "");
      }
    }
    const leftoverWords = remaining
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2 && looksEnglish(w));
    return { mapped, leftover: leftoverWords };
  }

  // Use only confidently-translated terms for the PRIMARY (required) part of
  // the query. Untranslated Swedish leftovers ("dryck", "drickbart") are
  // noise that zeroes out queries — they're probably not in PubMed indexes.
  const primaryParts = translate(primary);
  const primaryTerms = primaryParts.mapped;

  // Secondary broadens via OR. Include both mapped AND English-looking
  // leftovers here — if they happen to match it helps, if not the OR
  // structure means they don't hurt.
  const secondaryTranslations = secondary.map(translate);
  const secondaryTerms: string[] = [];
  for (const s of secondaryTranslations) {
    secondaryTerms.push(...s.mapped, ...s.leftover);
  }
  // Include primary leftovers in secondary too
  secondaryTerms.push(...primaryParts.leftover);

  // Dedupe
  const dedupedSecondary = Array.from(new Set(secondaryTerms)).filter(
    (t) => !primaryTerms.includes(t)
  );

  if (primaryTerms.length === 0 && secondaryTerms.length === 0) return primary;

  // Primary concept(s) required (AND-joined). Secondary terms broaden via OR
  // so we don't over-constrain. No quotes — PubMed does term-based matching
  // and quoted phrases require exact matches which zero out uncommon
  // combinations (e.g. "collagen supplementation" AND "menopause" returns 0
  // vs "collagen" AND "menopause" returns 1980).
  const primaryPart = primaryTerms.length > 0
    ? primaryTerms.map(extractKeyTerm).join(" AND ")
    : "";
  const secondaryPart = dedupedSecondary.length > 0
    ? `(${dedupedSecondary.map(extractKeyTerm).join(" OR ")})`
    : "";

  if (primaryPart && secondaryPart) return `${primaryPart} AND ${secondaryPart}`;
  return primaryPart || secondaryPart;
}
