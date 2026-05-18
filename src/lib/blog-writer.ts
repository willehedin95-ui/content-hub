/**
 * Blog article writer — uses Claude to generate full SEO articles.
 * Takes a keyword, template, product context, and content brief.
 * Returns complete HTML ready for blog shell wrapping + publish.
 */

import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "./constants";
import { BLOG_TEMPLATES } from "./blog-templates";
import { createServerSupabase } from "./supabase-admin";
import { NATURLIG_SVENSKA_SKILL } from "./naturlig-svenska-skill";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArticleRequest {
  /** SEO title (H1) — e.g. "Bästa kollagentillskottet 2026" */
  title: string;
  /** URL slug — e.g. "basta-kollagentillskottet" */
  slug: string;
  /** Blog category — e.g. "Bäst i test" */
  category: string;
  /** Template ID from blog-templates.ts — e.g. "listicle" */
  templateId: string;
  /** Primary target keyword */
  primaryKeyword: string;
  /** Secondary keywords to weave in */
  secondaryKeywords: string[];
  /** Target word count range — e.g. "3000-4000" */
  wordCount: string;
  /** Content brief — what the article should cover */
  contentBrief: string;
  /** Product slug for product bank context — "happysleep" | "hydro13" */
  productSlug: string;
  /** Slugs of other blog articles to link to internally */
  internalLinkSlugs: string[];
  /** Language code */
  language: string;
  /** Blog domain for internal links */
  blogDomain: string;
}

// ---------------------------------------------------------------------------
// Product URLs per market (Shopify store links)
// ---------------------------------------------------------------------------

const PRODUCT_URLS: Record<string, Record<string, string>> = {
  happysleep: {
    sv: "https://swedishbalance.se/products/happysleep",
    da: "https://swedishbalance.dk/pages/happysleep-dk",
    no: "https://swedishbalance.se/no-no/pages/happysleep-no",
  },
  hydro13: {
    sv: "https://get-renew.com/products/hydro13",
    da: "https://get-renew.com/products/hydro13",
    no: "https://get-renew.com/products/hydro13",
  },
  // Doginwork (Marie's Valpakademin): the SEO blog CTA goes to the quiz
  // funnel, not directly to the product LP. The quiz personalizes the
  // recommendation and lands users in the same Shopify checkout via
  // cart-permalink with qz_sid attribution preserved.
  valpakademin: {
    sv: "https://quiz.doginwork.se/valpakademin",
  },
};

export function getProductUrl(productSlug: string, language: string): string {
  return PRODUCT_URLS[productSlug]?.[language] ?? PRODUCT_URLS[productSlug]?.sv ?? "#";
}

/** Product URL with UTM params for blog article attribution */
export function getProductUrlWithUTM(productSlug: string, language: string, articleSlug: string): string {
  const base = getProductUrl(productSlug, language);
  if (base === "#") return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}utm_source=blog&utm_medium=organic&utm_campaign=${encodeURIComponent(articleSlug)}`;
}

// ---------------------------------------------------------------------------
// Verified competitor products — ONLY these may appear in articles
// NEVER fabricate product names. If a product isn't listed here, don't mention it.
// ---------------------------------------------------------------------------

export interface CompetitorProduct {
  /** Swedish product name as sold in Sweden */
  nameSv: string;
  /** Brand */
  brand: string;
  /** Approximate price in SEK (2026) */
  priceSek: number;
  /** Material type */
  material: string;
  /** Where to buy (Swedish store URL or brand website) */
  url: string;
  /** Brief description for the writer */
  description: string;
}

const PILLOW_COMPETITORS: CompetitorProduct[] = [
  {
    nameSv: "Tempur Original",
    brand: "Tempur",
    priceSek: 1599,
    material: "Minnesskum (TEMPUR-material)",
    url: "https://se.tempur.com/kuddar/",
    description: "Klassisk ergonomisk kudde från Tempur. Mycket stöd men kan kännas hård. Sover varmt.",
  },
  {
    nameSv: "IKEA KLUBBSPORRE",
    brand: "IKEA",
    priceSek: 199,
    material: "Minnesskum/latex",
    url: "https://www.ikea.com/se/sv/cat/ergonomiska-kuddar-20533/",
    description: "Billigaste ergonomiska alternativet. Bra för budgeten men sämre hållbarhet.",
  },
  {
    nameSv: "Dunlopillo Serenity",
    brand: "Dunlopillo",
    priceSek: 899,
    material: "Latex",
    url: "https://www.dunlopillo.se/kuddar/",
    description: "Premium latexkudde. Naturligt sval, bra fjädring, lång livslängd.",
  },
  {
    nameSv: "Pillowise",
    brand: "Pillowise",
    priceSek: 1295,
    material: "Minnesskum",
    url: "https://www.pillowise.se/",
    description: "Individuellt anpassad kudde baserat på axelbredd och sovställning. Säljs via fysioterapeuter.",
  },
  {
    nameSv: "Sissel Soft",
    brand: "Sissel",
    priceSek: 649,
    material: "Minnesskum",
    url: "https://www.sissel.se/kuddar/",
    description: "Tysk medicinteknisk kudde. Mjukare ergonomisk profil. Populär hos fysioterapeuter.",
  },
  {
    nameSv: "Curaprox",
    brand: "Curaprox",
    priceSek: 1890,
    material: "Minnesskum",
    url: "https://www.curaprox.com/se-sv/sleep",
    description: "Schweizisk premiumkudde med patenterad konturdesign. Dyrast i test.",
  },
  {
    nameSv: "IKEA ROSENSKÄRM",
    brand: "IKEA",
    priceSek: 149,
    material: "Polyester",
    url: "https://www.ikea.com/se/sv/cat/ergonomiska-kuddar-20533/",
    description: "Enkel ergonomisk kudde. Bra som instegspris men byter form snabbt.",
  },
  {
    nameSv: "Bäddmadrassen Original",
    brand: "Bäddmadrassen",
    priceSek: 795,
    material: "Minnesskum",
    url: "https://www.baddmadrassen.se/",
    description: "Svensk e-handelskudde. Bra pris/prestanda. Mjukare minnesskum.",
  },
  {
    nameSv: "Casper Original Pillow",
    brand: "Casper",
    priceSek: 750,
    material: "Polyester/dun",
    url: "https://casper.com/se/sv/kuddar/",
    description: "Populär online-kudde. Tre lager, justerbar höjd. Inte ergonomisk profil.",
  },
  {
    nameSv: "Emma Diamond Degree",
    brand: "Emma",
    priceSek: 899,
    material: "Minnesskum med gel",
    url: "https://www.emma-sleep.se/kuddar/",
    description: "Kylande gelkudde. Bra för varma sovare. Justerbar höjd med uttagbara lager.",
  },
];

const COLLAGEN_COMPETITORS: CompetitorProduct[] = [
  {
    nameSv: "Oslo Skin Lab The Solution",
    brand: "Oslo Skin Lab",
    priceSek: 359,
    material: "Kollagenpulver (2 500 mg)",
    url: "https://osloskinlab.se/",
    description: "Populärt norskt kollagen. Bara 2 500 mg — underdoserat jämfört med studiedoser.",
  },
  {
    nameSv: "Great Earth Marine Collagen",
    brand: "Great Earth",
    priceSek: 299,
    material: "Kollagenpulver (5 000 mg)",
    url: "https://www.greatearth.se/",
    description: "Prisvärt hälsokostmärke. Marint kollagen men saknar kompletterande ingredienser.",
  },
  {
    nameSv: "Biosalma Collagen Beauty",
    brand: "Biosalma",
    priceSek: 229,
    material: "Kollagentabletter (500 mg)",
    url: "https://www.biosalma.se/",
    description: "Billigt men kraftigt underdoserat. 500 mg per tablett — långt under kliniska doser.",
  },
  {
    nameSv: "Elexir Pharma Collagen",
    brand: "Elexir Pharma",
    priceSek: 189,
    material: "Kollagenpulver",
    url: "https://www.elexirpharma.se/",
    description: "Svenskt apoteksmärke. Enbart kollagen utan tillsatser.",
  },
];

// Danish pillow competitors — same brands, local descriptions/URLs/prices
const PILLOW_COMPETITORS_DA: CompetitorProduct[] = [
  { nameSv: "Tempur Original", brand: "Tempur", priceSek: 1599, material: "Memory foam (TEMPUR-materiale)", url: "https://dk.tempur.com/puder/", description: "Klassisk ergonomisk pude fra Tempur. Meget støtte men kan føles hård. Sover varmt." },
  { nameSv: "IKEA KLUBBSPORRE", brand: "IKEA", priceSek: 199, material: "Memory foam/latex", url: "https://www.ikea.com/dk/da/cat/ergonomiske-puder-20533/", description: "Billigste ergonomiske alternativ. God til budgettet men dårligere holdbarhed." },
  { nameSv: "Dunlopillo Serenity", brand: "Dunlopillo", priceSek: 899, material: "Latex", url: "https://www.dunlopillo.dk/puder/", description: "Premium latexpude. Naturligt kølig, god fjedring, lang levetid." },
  { nameSv: "Pillowise", brand: "Pillowise", priceSek: 1295, material: "Memory foam", url: "https://www.pillowise.dk/", description: "Individuelt tilpasset pude baseret på skulderbredde og sovestilling. Sælges via fysioterapeuter." },
  { nameSv: "Sissel Soft", brand: "Sissel", priceSek: 649, material: "Memory foam", url: "https://www.sissel-online.com/da/", description: "Tysk medicinteknisk pude. Blødere ergonomisk profil. Populær hos fysioterapeuter." },
  { nameSv: "Curaprox", brand: "Curaprox", priceSek: 1890, material: "Memory foam", url: "https://www.curaprox.com/dk-da/sleep", description: "Schweizisk premiumpude med patenteret konturdesign. Dyrest i test." },
  { nameSv: "IKEA ROSENSKÄRM", brand: "IKEA", priceSek: 149, material: "Polyester", url: "https://www.ikea.com/dk/da/cat/ergonomiske-puder-20533/", description: "Enkel ergonomisk pude. God som indgangspris men mister form hurtigt." },
  { nameSv: "Casper Original Pillow", brand: "Casper", priceSek: 750, material: "Polyester/dun", url: "https://casper.com/dk/da/puder/", description: "Populær online-pude. Tre lag, justerbar højde. Ikke ergonomisk profil." },
  { nameSv: "Emma Diamond Degree", brand: "Emma", priceSek: 899, material: "Memory foam med gel", url: "https://www.emma-sleep.dk/puder/", description: "Kølende gelpude. God til varme sovere. Justerbar højde med udtagelige lag." },
];

// Norwegian pillow competitors — same brands, local descriptions/URLs/prices
const PILLOW_COMPETITORS_NO: CompetitorProduct[] = [
  { nameSv: "Tempur Original", brand: "Tempur", priceSek: 1599, material: "Memory foam (TEMPUR-materiale)", url: "https://no.tempur.com/puter/", description: "Klassisk ergonomisk pute fra Tempur. Mye støtte men kan kjennes hard. Sover varmt." },
  { nameSv: "IKEA KLUBBSPORRE", brand: "IKEA", priceSek: 199, material: "Memory foam/latex", url: "https://www.ikea.com/no/no/cat/ergonomiske-puter-20533/", description: "Billigste ergonomiske alternativ. Bra for budsjettet men dårligere holdbarhet." },
  { nameSv: "Dunlopillo Serenity", brand: "Dunlopillo", priceSek: 899, material: "Latex", url: "https://www.dunlopillo.no/puter/", description: "Premium latexpute. Naturlig kjølig, god fjæring, lang levetid." },
  { nameSv: "Pillowise", brand: "Pillowise", priceSek: 1295, material: "Memory foam", url: "https://www.pillowise.no/", description: "Individuelt tilpasset pute basert på skulderbredde og sovestilling. Selges via fysioterapeuter." },
  { nameSv: "Sissel Soft", brand: "Sissel", priceSek: 649, material: "Memory foam", url: "https://www.sissel-online.com/no/", description: "Tysk medisinteknisk pute. Mykere ergonomisk profil. Populær hos fysioterapeuter." },
  { nameSv: "Curaprox", brand: "Curaprox", priceSek: 1890, material: "Memory foam", url: "https://www.curaprox.com/no-no/sleep", description: "Sveitsisk premiumpute med patentert konturdesign. Dyrest i test." },
  { nameSv: "IKEA ROSENSKÄRM", brand: "IKEA", priceSek: 149, material: "Polyester", url: "https://www.ikea.com/no/no/cat/ergonomiske-puter-20533/", description: "Enkel ergonomisk pute. Bra som inngangspris men mister form raskt." },
  { nameSv: "Casper Original Pillow", brand: "Casper", priceSek: 750, material: "Polyester/dun", url: "https://casper.com/no/no/puter/", description: "Populær nettbasert pute. Tre lag, justerbar høyde. Ikke ergonomisk profil." },
  { nameSv: "Emma Diamond Degree", brand: "Emma", priceSek: 899, material: "Memory foam med gel", url: "https://www.emma-sleep.no/puter/", description: "Kjølende gelpute. Bra for varme sovere. Justerbar høyde med uttakbare lag." },
];

/**
 * Get verified competitors for a product category and language.
 *
 * Returns hardcoded fallback list (legacy). Production code should prefer
 * `getCompetitorProductsFromDB(productSlug, language)` which reads from
 * the `competitor_products` Supabase table (operator-editable).
 */
export function getCompetitorProducts(productSlug: string, language: string = "sv"): CompetitorProduct[] {
  if (productSlug === "happysleep") {
    if (language === "da") return PILLOW_COMPETITORS_DA;
    if (language === "no") return PILLOW_COMPETITORS_NO;
    return PILLOW_COMPETITORS;
  }
  if (productSlug === "hydro13") return COLLAGEN_COMPETITORS;
  return [];
}

/**
 * Async version that reads from the competitor_products Supabase table.
 * Falls back to the hardcoded getCompetitorProducts list if DB is empty
 * or unreachable. Use this from cron paths; getCompetitorProducts() remains
 * synchronous for places that can't easily await.
 */
export async function getCompetitorProductsFromDB(
  productSlug: string,
  language: string = "sv"
): Promise<CompetitorProduct[]> {
  try {
    const { createServerSupabase } = await import("./supabase-admin");
    const db = createServerSupabase();
    const { data } = await db
      .from("competitor_products")
      .select("brand, name_sv, price_sek, material, url, description")
      .eq("product_slug", productSlug)
      .eq("language", language)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (data && data.length > 0) {
      return data.map((r) => ({
        nameSv: r.name_sv as string,
        brand: r.brand as string,
        priceSek: (r.price_sek as number) || 0,
        material: (r.material as string) || "",
        url: r.url as string,
        description: (r.description as string) || "",
      }));
    }
  } catch (err) {
    console.warn(`[blog-writer] getCompetitorProductsFromDB failed, falling back to hardcoded:`, err);
  }
  return getCompetitorProducts(productSlug, language);
}

// ---------------------------------------------------------------------------
// Verified external links for health content
// ---------------------------------------------------------------------------

type ExternalLink = { url: string; description: string };

export const VERIFIED_EXTERNAL_LINKS: Record<string, Record<string, ExternalLink>> = {
  sv: {
    "1177": { url: "https://www.1177.se/", description: "1177 Vårdguiden — Sveriges officiella hälsoinformationstjänst" },
    "1177_nacke": { url: "https://www.1177.se/sjukdomar--besvar/skelett-leder-och-muskler/rygg-och-nacke/ont-i-nacke-och-axlar/", description: "1177 — Ont i nacke och axlar" },
    "1177_somn": { url: "https://www.1177.se/liv--halsa/stresshantering-och-somn/somnen-ar-viktig-for-din-halsa/", description: "1177 — Sömnen är viktig för din hälsa" },
    "1177_rygg": { url: "https://www.1177.se/sjukdomar--besvar/skelett-leder-och-muskler/rygg-och-nacke/ont-i-ryggen/", description: "1177 — Ont i ryggen" },
    internetmedicin: { url: "https://www.internetmedicin.se/", description: "Internetmedicin — medicinsk kunskapsbas för vårdpersonal" },
    ki: { url: "https://ki.se/", description: "Karolinska Institutet — Sveriges ledande medicinska universitet" },
    livsmedelsverket: { url: "https://www.livsmedelsverket.se/", description: "Livsmedelsverket — råd om kost och nutrition" },
    sbu: { url: "https://www.sbu.se/", description: "SBU — Statens beredning för medicinsk och social utvärdering" },
  },
  da: {
    sundhed: { url: "https://www.sundhed.dk/", description: "Sundhed.dk — Danmarks officielle sundhedsportal" },
    sundhed_nakke: { url: "https://www.sundhed.dk/borger/patienthaandbogen/knogler-muskler-og-led/sygdomme/nakke/nakkesmerter/", description: "Sundhed.dk — Nakkesmerter" },
    sundhed_sovn: { url: "https://www.sundhed.dk/borger/patienthaandbogen/psyke/sygdomme/soevn/soevnloeshed/", description: "Sundhed.dk — Søvnløshed" },
    sundhed_ryg: { url: "https://www.sundhed.dk/borger/patienthaandbogen/knogler-muskler-og-led/sygdomme/ryg/rygsmerter/", description: "Sundhed.dk — Rygsmerter" },
    sst: { url: "https://www.sst.dk/", description: "Sundhedsstyrelsen — Danmarks sundhedsmyndighed" },
    netdoktor: { url: "https://www.netdoktor.dk/", description: "NetDoktor.dk — Lægereviewed sundhedsinformation" },
    foedevarestyrelsen: { url: "https://www.foedevarestyrelsen.dk/", description: "Fødevarestyrelsen — råd om kost og ernæring" },
  },
  no: {
    helsenorge: { url: "https://www.helsenorge.no/", description: "Helsenorge.no — Norges offisielle helseportal" },
    helsenorge_nakke: { url: "https://www.helsenorge.no/sykdom/muskel-og-skjelett/nakkesmerter/", description: "Helsenorge — Nakkesmerter" },
    helsenorge_sovn: { url: "https://www.helsenorge.no/sykdom/psykiske-lidelser/sovnproblemer-insomni/", description: "Helsenorge — Søvnproblemer og insomni" },
    helsenorge_rygg: { url: "https://www.helsenorge.no/sykdom/muskel-og-skjelett/ryggsmerter/", description: "Helsenorge — Ryggsmerter" },
    fhi: { url: "https://www.fhi.no/", description: "Folkehelseinstituttet — Norges folkehelseinstitutt" },
    nhi: { url: "https://nhi.no/", description: "NHI.no — Norsk helseinformatikk (legereviewed)" },
    mattilsynet: { url: "https://www.mattilsynet.no/", description: "Mattilsynet — råd om mat og ernæring" },
  },
};

/**
 * Workspace-specific extra allowed external domains for soft-gate.
 * Used in addition to the language-keyed VERIFIED_EXTERNAL_LINKS above.
 *
 * Doginwork blog is dog-training content, not health YMYL — it links out to
 * dog-specific authorities (Svenska Kennelklubben, Jordbruksverket) instead
 * of medical sources, so the gate's allow-list needs the override.
 */
export const PRODUCT_ALLOWED_DOMAINS: Record<string, string[]> = {
  valpakademin: [
    "skk.se",                  // Svenska Kennelklubben
    "jordbruksverket.se",      // svenska hundlagar, registrering
    "1177.se",                 // medicinska valp-frågor (vaccination, parasiter)
    "sbk.se",                  // Svenska Brukshundklubben
    "agria.se",                // hundförsäkring + hund-content (auktoritet)
    "manypets.com",            // ManyPets (puppy blues-undersökningen 2023)
  ],
};

// Post-processing: fix any remaining wrong health site URLs that Claude might hallucinate
const URL_REPLACEMENTS: [RegExp, string][] = [
  // Common hallucinated Swedish 1177 paths → real URLs
  [/https:\/\/www\.1177\.se\/sjukdomar--besvar\/skelett-leder-och-muskler\/nacke-och-rygg\/ont-i-nacken\/?/g,
   "https://www.1177.se/sjukdomar--besvar/skelett-leder-och-muskler/rygg-och-nacke/ont-i-nacke-och-axlar/"],
  [/https:\/\/www\.1177\.se\/liv--halsa\/sova-bra\/?/g,
   "https://www.1177.se/liv--halsa/stresshantering-och-somn/somnen-ar-viktig-for-din-halsa/"],
  [/https:\/\/www\.1177\.se\/sjukdomar--besvar\/skelett-leder-och-muskler\/nacke-och-rygg\/ont-i-ryggen\/?/g,
   "https://www.1177.se/sjukdomar--besvar/skelett-leder-och-muskler/rygg-och-nacke/ont-i-ryggen/"],
  // Danish: sundhed.dk common hallucinated paths
  [/https:\/\/www\.sundhed\.dk\/borger\/sygdomme\/nakke\/?/g,
   "https://www.sundhed.dk/borger/patienthaandbogen/knogler-muskler-og-led/sygdomme/nakke/nakkesmerter/"],
  [/https:\/\/www\.sundhed\.dk\/borger\/sygdomme\/soevn\/?/g,
   "https://www.sundhed.dk/borger/patienthaandbogen/psyke/sygdomme/soevn/soevnloeshed/"],
  // Norwegian: helsenorge.no common hallucinated paths
  [/https:\/\/www\.helsenorge\.no\/sykdom\/nakkesmerter\/?/g,
   "https://www.helsenorge.no/sykdom/muskel-og-skjelett/nakkesmerter/"],
  [/https:\/\/www\.helsenorge\.no\/sykdom\/sovnproblemer\/?/g,
   "https://www.helsenorge.no/sykdom/psykiske-lidelser/sovnproblemer-insomni/"],
];

/** Fix known hallucinated URLs in article HTML */
export function fixHallucinatedUrls(html: string): string {
  let result = html;
  for (const [pattern, replacement] of URL_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Anti-slop post-process validator
// ---------------------------------------------------------------------------

/**
 * Banned single words — hit anywhere in article text fails the check.
 * These leak through prompt instructions because they're common words the
 * model reaches for by default. Enforce via post-process.
 */
const BANNED_WORDS = [
  "optimal",
  "optimala",
  "optimalt",
  "holistisk",
  "holistiskt",
  "holistiska",
  "revolutionerande",
  "banbrytande",
  "game-changer",
  "game changer",
  "transformera",
  "transformerande",
  "nyanserad",
  "mångfacetterad",
  "otvetydigt",
];

/**
 * Banned phrases — check is case-insensitive substring.
 */
const BANNED_PHRASES = [
  "i en värld där",
  "i en värld som",
  "i vår moderna värld",
  "det är ingen hemlighet att",
  "det är väl känt att",
  "låt oss dyka ner",
  "låt oss utforska",
  "med det sagt",
  "i slutändan",
  "i dagens samhälle",
  "det är viktigt att notera",
  "det är viktigt att komma ihåg",
  "sammanfattningsvis kan man säga",
];

/**
 * Context-safe word replacements.
 * Match is case-insensitive, replacement preserves first-letter case.
 * Used for banned SINGLE WORDS only — banned phrases need Claude rewrite.
 */
const WORD_SUBSTITUTIONS: Record<string, string[]> = {
  optimal: ["bra", "lämplig", "passande", "rätt"],
  optimala: ["bra", "lämpliga", "passande", "rätta"],
  optimalt: ["bra", "lämpligt", "passande", "rätt"],
  holistisk: ["övergripande", "helhets-"],
  holistiskt: ["övergripande", "helhets-"],
  holistiska: ["övergripande", "helhets-"],
  revolutionerande: ["ny", "ovanligt effektiv"],
  banbrytande: ["ny", "annorlunda"],
  transformera: ["förändra", "förbättra"],
  transformerande: ["förändrande", "förbättrande"],
  nyanserad: ["detaljerad"],
  mångfacetterad: ["mångsidig"],
  otvetydigt: ["tydligt"],
  "game-changer": ["skillnad"],
  "game changer": ["skillnad"],
};

export interface AntiSlopResult {
  html: string;
  wordsReplaced: number;
  phrasesFound: string[];
}

/**
 * Replace banned single words with safe synonyms (context-safe heuristic).
 * Words match as whole words only (word-boundary) to avoid breaking substrings
 * like "optimala" inside "optimalare" (which shouldn't exist, but guard anyway).
 *
 * Also detects banned phrases but does NOT auto-fix them — returned in
 * `phrasesFound` so caller can decide whether to regenerate via Claude.
 */
export function applyAntiSlop(html: string): AntiSlopResult {
  let wordsReplaced = 0;
  let result = html;

  for (const [bannedWord, synonyms] of Object.entries(WORD_SUBSTITUTIONS)) {
    const escaped = bannedWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Word boundaries around letters, matching case-insensitive
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    result = result.replace(regex, (match) => {
      // Rotate through synonyms to avoid one word repeating 10 times
      const idx = wordsReplaced % synonyms.length;
      const replacement = synonyms[idx];
      wordsReplaced++;
      // Preserve first-letter case (e.g. Optimal → Bra)
      if (match[0] === match[0].toUpperCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  // Detect banned phrases (case-insensitive substring in stripped text)
  const stripped = result.replace(/<[^>]+>/g, " ").toLowerCase();
  const phrasesFound = BANNED_PHRASES.filter((p) => stripped.includes(p));

  return { html: result, wordsReplaced, phrasesFound };
}

// Exported for audit/regen scripts
export { BANNED_WORDS, BANNED_PHRASES };

export interface ArticleResult {
  html: string;
  seoTitle: string;
  seoDescription: string;
  wordCount: number;
  cost: number;
}

// ---------------------------------------------------------------------------
// Article generation
// ---------------------------------------------------------------------------

export async function generateBlogArticle(
  request: ArticleRequest & {
    enableResearchCitations?: boolean;
    naturalSwedishPass?: boolean;
  }
): Promise<ArticleResult> {
  // Trim defensively: .env.local pulled from Vercel CLI sometimes wraps
  // values with trailing literal `\n` which dotenv interprets as a newline,
  // breaking auth headers/keys. Same fix applied in dataforseo.ts:getAuth.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  // Fetch product context from product bank
  const productContext = await getProductContext(request.productSlug);

  // Get existing articles for internal linking
  const internalLinks = await getInternalLinks(
    request.internalLinkSlugs,
    request.language,
    request.blogDomain
  );

  // Optionally fetch verified research citations (PubMed). Gated by
  // workspace setting so we only pay for it where needed (currently Hydro13).
  // Falls through gracefully if PubMed is unreachable — writer still runs,
  // just without forced citations.
  let verifiedStudies: Array<{
    pmid: string;
    title: string;
    year: number;
    authors: string[];
    journal: string;
    url: string;
    design: string;
  }> = [];
  if (request.enableResearchCitations) {
    try {
      const { findRelevantStudies } = await import("./pubmed");
      verifiedStudies = await findRelevantStudies(
        request.primaryKeyword,
        request.secondaryKeywords,
        { limit: 8 }
      );
      console.log(`[blog-writer] Found ${verifiedStudies.length} verified PubMed studies`);
    } catch (err) {
      console.warn("[blog-writer] PubMed lookup failed, continuing without citations:", err);
    }
  }

  // Get template HTML as structural reference
  const template = BLOG_TEMPLATES.find((t) => t.id === request.templateId);
  const templateHtml = template
    ? template.getHtml(request.title)
    : BLOG_TEMPLATES[0].getHtml(request.title);

  const systemPrompt = buildWriterSystemPrompt(
    request,
    productContext,
    internalLinks,
    verifiedStudies
  );
  const userPrompt = buildWriterUserPrompt(request, templateHtml);

  const client = new Anthropic({ apiKey });

  // Use streaming for large articles (required by Anthropic SDK for long requests)
  let html = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 32000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      const delta = event.delta as unknown as { type: string; text?: string };
      if (delta.type === "text_delta" && delta.text) {
        html += delta.text;
      }
    }
  }

  const finalMessage = await stream.finalMessage();
  inputTokens = finalMessage.usage?.input_tokens ?? 0;
  outputTokens = finalMessage.usage?.output_tokens ?? 0;

  // Strip code fences if Claude added them
  let cleanHtml = html
    .replace(/^```html?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // Post-process: verify research citations. If the writer was given verified
  // PubMed studies, at least 3 of their URLs must appear in the article body.
  // If not, send ONE follow-up message asking to add citations. This catches
  // cases where the model wrote the article ignoring the mandatory citation
  // rule — we don't regenerate from scratch (expensive) but give it a nudge.
  if (verifiedStudies.length > 0) {
    const verifiedUrls = new Set(verifiedStudies.map((s) => s.url));
    const citedInBody = new Set<string>();
    for (const url of verifiedUrls) {
      if (cleanHtml.includes(url)) citedInBody.add(url);
    }
    const MIN_CITATIONS = 3;
    if (citedInBody.size < MIN_CITATIONS) {
      console.log(
        `[blog-writer] Citations: ${citedInBody.size}/${MIN_CITATIONS} required. Requesting revision.`
      );
      const retryStream = client.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: 32000,
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt },
          { role: "assistant", content: cleanHtml },
          {
            role: "user",
            content: `You cited only ${citedInBody.size} of the ${verifiedStudies.length} verified PubMed studies, but the instructions require AT LEAST ${MIN_CITATIONS} inline citations from the "Verified Research Sources" list.

Rewrite the article with at least ${MIN_CITATIONS} inline <a href="..."> citations linking to the PubMed URLs from the verified list. Do NOT add any other pubmed.ncbi.nlm.nih.gov URLs. Distribute citations across different paragraphs where claims about research findings are made. Paraphrase findings based on the study titles — do not fabricate specific numbers or conclusions.

Return the complete revised article HTML (same structure, just with the added citations).`,
          },
        ],
      });
      let retryHtml = "";
      for await (const event of retryStream) {
        if (event.type === "content_block_delta") {
          const delta = event.delta as unknown as { type: string; text?: string };
          if (delta.type === "text_delta" && delta.text) retryHtml += delta.text;
        }
      }
      const retryFinal = await retryStream.finalMessage();
      inputTokens += retryFinal.usage?.input_tokens ?? 0;
      outputTokens += retryFinal.usage?.output_tokens ?? 0;

      const retryClean = retryHtml
        .replace(/^```html?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();
      const retryCited = new Set<string>();
      for (const url of verifiedUrls) if (retryClean.includes(url)) retryCited.add(url);

      if (retryCited.size >= citedInBody.size) {
        cleanHtml = retryClean;
        console.log(`[blog-writer] After retry: ${retryCited.size}/${MIN_CITATIONS} citations`);
      } else {
        console.warn(
          `[blog-writer] Retry didn't improve citation count (${retryCited.size} vs ${citedInBody.size}). Keeping original.`
        );
      }
    } else {
      console.log(`[blog-writer] Citations OK: ${citedInBody.size} verified PubMed URLs in body`);
    }
  }

  // Post-process: enforce anti-slop rules the prompt couldn't enforce reliably.
  // Single banned words get auto-replaced with synonyms; banned phrases are
  // logged (would need a regenerate call — keeping simple for now).
  const antiSlop = applyAntiSlop(cleanHtml);
  if (antiSlop.wordsReplaced > 0) {
    cleanHtml = antiSlop.html;
    console.log(`[blog-writer] Anti-slop: replaced ${antiSlop.wordsReplaced} banned words`);
  }
  if (antiSlop.phrasesFound.length > 0) {
    console.warn(`[blog-writer] Anti-slop: banned phrases still present: ${antiSlop.phrasesFound.join(", ")}`);
  }

  // Naturlig svenska second pass: rewrites text for natural Swedish narrative
  // structure, fixing AI-tells (em-dash glue, stacked short sentences,
  // translated metaphors, anglicismer, modal particles, typography).
  // Gated by workspace setting `blog_natural_swedish_pass` and only for sv
  // language (the skill is Swedish-specific).
  if (request.language === "sv" && request.naturalSwedishPass) {
    try {
      const ns = await naturligSvenskaPass(client, cleanHtml);
      cleanHtml = ns.html;
      inputTokens += ns.inputTokens;
      outputTokens += ns.outputTokens;
      console.log(
        `[blog-writer] Naturlig svenska pass: +${ns.inputTokens}in/${ns.outputTokens}out tokens`,
      );
    } catch (err) {
      console.warn(
        "[blog-writer] Naturlig svenska pass failed, keeping original:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Calculate approximate word count
  const textOnly = cleanHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const wordCount = textOnly.split(" ").filter(Boolean).length;

  // Extract meta description from first meaningful paragraph
  const descMatch = cleanHtml.match(/<p class="intro">([\s\S]*?)<\/p>/);
  const rawDesc = descMatch
    ? descMatch[1].replace(/<[^>]*>/g, "").trim()
    : textOnly.slice(0, 160);
  const seoDescription =
    rawDesc.length > 155
      ? rawDesc.slice(0, rawDesc.lastIndexOf(" ", 155)) + "..."
      : rawDesc;

  // Calculate cost (Sonnet input/output pricing)
  const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000; // Sonnet 4.5 pricing

  return {
    html: cleanHtml,
    seoTitle: request.title,
    seoDescription,
    wordCount,
    cost,
  };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

/**
 * Doginwork (Marie Hedin's Valpakademin) writer prompt.
 *
 * Different shape from the HappySleep/Hydro13 prompt: warm normalizing voice
 * (Marie's group-admin tone from `doginwork/docs/03-marie-voice.md`), no
 * competitor comparison sections (no Awin/affiliate model for course
 * products), no PubMed citations (wrong domain), Christine-citat-bibliotek
 * surfaced for authentic distress-language, and the quiz funnel as CTA
 * instead of a direct product LP.
 */
function buildDoginworkWriterSystemPrompt(
  request: ArticleRequest,
  internalLinks: string,
): string {
  const productUrl = getProductUrlWithUTM("valpakademin", request.language, request.slug);

  return `Du skriver för Doginworks redaktion - en svensk redaktionell publikation om valpträning och hundträning, faktagranskad av Marie Hedin (certifierad hundpsykolog och hundinstruktör, 14 års erfarenhet). Artiklarna ska ha en objektiv, auktoritativ och informativ ton - liknande Healthlines eller Wirecutter:s redaktionella röst, INTE en personlig blogg.

## CRITICAL: Språkregler

- Skriv ENTIRELY på svenska. Varje ord.
- Använd svenska sammansatta ord: koppelträning (inte "koppel träning"), valpkurs (inte "valp kurs"), beteendeproblem (inte "beteende problem"), rumsrenhetsträning (inte "rumsrenhets träning")
- Använd korrekt svensk grammatik och naturliga svenska meningar. Översätt INTE från engelska.

## Identitet och röst - REDAKTIONELL AUKTORITET

Detta är INTE en personlig blogg från Marie. Det är en redaktionell artikel där Marie är den fackgranskande experten - precis som Healthline har medical reviewers. Du som skriver är redaktionen.

**ALDRIG använd första person singular ("jag", "min metod", "jag har sett under 14 år"). ALDRIG.**

**Använd istället:**
- Tredje person editorial: "Forskning visar att...", "Hundägare beskriver det ofta som..."
- Doginwork som varumärke (vi-form): "På Doginwork rekommenderar vi..." - sparsamt
- Generisk auktoritet: "Erfarna hundinstruktörer brukar säga...", "I svensk hundträning är det vanligt att..."

## CRITICAL: LÄSNIVÅ - SKRIV ENKELT

**Målgruppen är stressade valpägare, inte akademiker.** Många läser på högstadie-/Aftonbladet-nivå. Skriv så enkelt som möjligt utan att tappa innehåll.

**Hårda regler för läsnivå:**

1. **Korta meningar.** Max ~15 ord per mening i snitt. Bryt långa meningar i två. Punkt-och-ny-mening är din vän.

2. **Vanliga ord, inte fackord.** Skriv "hjärnan växer fort" inte "kognitiv utveckling". "Den fasen" inte "fenomenet". "Det är vanligt" inte "det är dokumenterat".

3. **Konkret, inte abstrakt.** "Valpen biter dina händer när du leker" inte "interaktion mellan valp och ägare karakteriseras av oralt kontaktsökande beteende".

4. **Active voice.** "Valpen lär sig sitt-kommandot" inte "sitt-kommandot lärs in av valpen".

5. **Förbjudet språk:**
   - Substantiverade verb ("genomförande" → "att göra det", "implementering" → "att börja")
   - Passiv-konstruktioner med "blir" / "gjordes" / "ska göras" → använd aktiv form
   - Långa fackord-kedjor: "utvecklingspsykologisk problematik" → "vanliga problem under valpens växande"
   - Engelska låneord: "fokus" istället för "focus", "metod" istället för "framework"
   - Latinska/grekiska ord när det finns svenskt: "tillfällig" inte "temporär", "vanlig" inte "frekvent"

6. **Förklara fackord direkt om de MÅSTE användas:**
   - "Hormonpåverkan (kroppsliga ämnen som styr humör och beteende)"
   - "Spökålder (en period då valpen plötsligt är rädd för saker den inte var rädd för förut)"

7. **Mottot:** Skriv som om du förklarar för en stressad granne i köket, inte en kollega på universitetet.

**Tonefördelning:**
- Objektiv informativ huvudkropp (vad händer, varför, vad funkar, vad undvika, tidsram)
- Korta empati-konstateringar ("Den här fasen är inte ovanlig", "De flesta valpfamiljer går igenom det här") - utan första person
- Hänvisningar till Doginwork och Valpakademin reserverat till CTA-box mot slutet

**Förbjudet (Marie:s personliga grupp-röst):**
- "Jag har sett tusentals familjer..." → "Det är vanligt..."
- "Min metod är..." → "Doginworks metod är..."
- "I min FB-grupp möter jag det här" → "Hundägare beskriver det ofta så här"
- "HÅLL UT!" / "Lycka till!" / utropstecken-glädje → utelämnas helt
- Direkta du-uppmaningar med "du måste" / "du ska" → omformulera som "ett bra sätt är att..."

## Målgrupp - Christine

Läsaren är Christine: en stressad valpägare, 30-50 år, ofta erfaren hundägare som ändå känner sig osäker denna gång. Hon googlar problemen efter en dag där valpen bitit, dragit i kopplet eller kissat på mattan. Hon har ofta lurkat länge i FB-grupper innan hon söker information.

Hon vill ha:
- Konkreta svar på "varför händer det här" och "vad gör jag"
- Realistiska tidsramar
- Bekräftelse att det är normalt (objektivt formulerat, inte coachande)
- Källhänvisning så hon kan lita på informationen

Hon vill INTE ha:
- Pekpinnar
- Klyschor
- Säljiga product placements i toppen
- Pseudo-vetenskap utan källa

## Anti-fabrikering - HARD RULES

1. **Inga fabricerade siffror.** "98% av valpägare", "tusentals familjer" - kräver konkret källa. Saknas källan, formulera kvalitativt: "många hundägare upplever..." eller "en betydande andel valpfamiljer rapporterar...".

2. **Inga fabricerade namngivna testimonials eller kunder.** Använd istället dessa verkliga avatar-citat från svenska valpägare, ramade som typiska upplevelser:
   - *"Min golden hade en bitperiod då hon var totalt hopplös - bet säkert 20-30 ggr/dag"*
   - *"Han blir helt manisk. Får stanna 20 ggr på 100 meter"*
   - *"Tänk om hon aldrig vill följa med?"*
   - *"Som lilla pirayan"*
   - *"Det blir lätt hysteriskt på kvällarna"*
   - *"Att bli arg och fya hjälpte inte ett dugg"*
   - *"Detta är min 4:e labrador men jag känner mig som nybörjare"*
   - *"Vår kille på 7,5 månader är plötsligt rädd för allt möjligt"*
   - *"Lite vilt-bajs är väl en sak men resten av buffén är ju så äckligt"*

   Ramar in dem som "Hundägare beskriver upplevelsen ofta i ungefär dessa termer:" eller "En typisk frustration som beskrivs är:" - INTE "många jag möter har skrivit" (det är Marie:s första person).

3. **Inga fabricerade studier eller forskningscitat.** Cita inte specifika procent eller forskare om du inte har källan. Hänvisa generellt till hundtränings-literatur. Patricia McConnell:s böcker ("The Other End of the Leash", "For the Love of a Dog") är OK att referera generellt - hon är etablerad auktoritet inom hundpsykologi.

4. **Inga fabricerade konkurrenter.** Nämn inte specifika valpkurser eller hundtränare vid namn (Spirit Dogs, GoodPup, etc.).

## Anti-slop - HARD RULES

Dessa fraser screams AI-content. Använd ALDRIG:

### Förbjudna svenska fraser
- "I en värld där..." / "I vår moderna värld..."
- "Det är ingen hemlighet att..." / "Det är väl känt att..."
- "Oavsett om du..." / "Om du letar efter..."
- "Från X till Y" (range-listing)
- "Det är viktigt att notera/komma ihåg"
- "Sammanfattningsvis kan man säga"
- "Låt oss dyka ner i..." / "Låt oss utforska..."
- "Med det sagt..." / "Med andra ord..."
- "I slutändan..."

### Förbjudna ord
holistisk, revolutionerande, banbrytande, game-changer, optimal, transformera, nyanserad, mångfacetterad, otvetydigt

### Förbjudna mönster
- Identical sentence-openers i serie
- Generisk filler ("Det finns många faktorer som spelar in")
- Övermjuka övergångar ("Med det i åtanke...")
- Excessive hedging ("Det kan ibland vara så att...")

## Strukturen för artikeln

H1: ${request.title}

**Inledning (200-300 ord):**
Öppna med en konkret beskrivning av problemet (inte "I den här artikeln går vi igenom..."). Använd objektiv formulering, inte direkt tilltal till läsaren i andra person.

Exempel på OK öppning:
"Många valpägare beskriver kvällen som ett kaos av tandavtryck, golvolyckor och en känsla av att ha gjort fel beslut. Bakom dessa upplevelser ligger ofta åtta vanliga beteendeproblem som återkommer i svenska valpfamiljer - alla med biologiska och utvecklingsmässiga förklaringar, och alla med konkreta lösningar."

Exempel på FÖRBJUDEN öppning:
"Du sitter på golvet kl 23..." (direkt du-tilltal är OK ibland men inte med första-person-svar)

**4-6 H2-sektioner** som följer denna mall:
- Definition av problemet (objektivt)
- Varför det händer (biologi, utvecklingsfas, eventuellt forskning eller etablerade källor)
- Vad som funkar (strukturerad lista, evidensbaserade tekniker)
- Vad som ska undvikas (lista)
- Realistisk tidsram (objektivt formulerad)
- När professionell hjälp behövs (ärligt, ej säljande)
- Eventuellt ett kort hundägar-citat ramad som typisk upplevelse
- Internlänk till djupartikel

**FAQ-sektion (3-5 frågor):**
Riktiga frågor som Christine söker på i Google. FAQPage-schema-struktur i HTML.

**CTA-box mot slutet (INTE i toppen):**
Mjuk hänvisning till Valpakademin via quizet, formulerad som redaktionell rekommendation. Mall:
\`\`\`html
<div class="cta-box">
  <h3>Få en personlig träningsrekommendation för din valp</h3>
  <p>Doginwork har byggt ett 2-minuters quiz som matchar din valps ras, ålder och utmaningar mot Valpakademin - en strukturerad valpkurs grundad i 14 års beprövad erfarenhet av Marie Hedin.</p>
  <p><strong>30 dagars öppet köp</strong> - kursen kan testas i lugn och ro.</p>
  <a href="${productUrl}" class="cta-button">Gör quizet (2 min)</a>
</div>
\`\`\`

**Quiz-CTA är PRIMARY CTA. Inte produkt-LP. Inte direkt-checkout. ALDRIG länka direkt till "köp Valpakademin nu" från en blog-artikel.**

**Author/granskare-block i botten av artikeln (efter FAQ):**
\`\`\`html
<div class="author-box">
  <p><strong>Faktagranskat av Marie Hedin</strong></p>
  <p>Marie är certifierad hundpsykolog och hundinstruktör med 14 års erfarenhet av att hjälpa svenska valpfamiljer. Hon driver Doginwork och kursen Valpakademin.</p>
</div>
\`\`\`

## Internal links

Länka till andra publicerade artiklar där relevant. Använd descriptive anchor text (inte "klicka här").

${internalLinks || "(Inga andra artiklar publicerade än)"}

## Verkliga externa källor (du får länka)

- 1177.se - för medicinska valp-frågor (vaccination, parasiter, foder-allergier)
- skk.se (Svenska Kennelklubben) - för rasstandard, registrering
- jordbruksverket.se - för svenska hundlagar, registrering
- skk.se/sbk - Svenska Brukshundklubben

Andra svenska domäner du är 100% säker på existerar är OK. Vid tvekan, lämna bort länken.

## CSS-klasser tillgängliga

Använd dessa scoped klasser i HTML:
- \`.intro-paragraph\` - första stycket större typografi
- \`.tip-box\` - konkret tips eller checkliste
- \`.cta-box\` - CTA mot slutet (se mall ovan)
- \`.faq-section\` - FAQ-blocket
- \`.faq-item\` - varje fråga-svar
- \`.warning-box\` - "när söka professionell hjälp"

INGA \`.quote-block\` eller \`.testimonial-card\` - vi citerar inga namngivna människor (E-E-A-T regel).

## Word count target

${request.wordCount} ord. Inte mindre. Hellre lite längre om Christine behöver hela bilden.

## Content brief

${request.contentBrief}

## Output format

Skriv hela artikeln som ren HTML. Börja direkt med H1, inga \`<html>\`/\`<body>\`-taggar. Slutar med CTA-boxen + FAQ-sektionen. Sätt \`alt\`-text på alla bilder (men du behöver inte själv generera bild-länkar - dom genereras separat).
`;
}

function buildWriterSystemPrompt(
  request: ArticleRequest,
  productContext: string,
  internalLinks: string,
  verifiedStudies: Array<{
    pmid: string;
    title: string;
    year: number;
    authors: string[];
    journal: string;
    url: string;
    design: string;
  }> = []
): string {
  // Doginwork (Marie's Valpakademin) takes a fundamentally different prompt
  // than the HappySleep/Hydro13 writer: warm normalizing voice instead of
  // editorial team voice, no competitor product comparisons (no Awin model
  // for course products), no PubMed citations (wrong domain), and quiz
  // funnel as CTA instead of direct product LP.
  if (request.productSlug === "valpakademin") {
    return buildDoginworkWriterSystemPrompt(request, internalLinks);
  }

  const langName =
    request.language === "sv"
      ? "Swedish"
      : request.language === "da"
        ? "Danish"
        : "Norwegian";

  const blogName =
    request.language === "sv"
      ? "Hälsobladet"
      : request.language === "da"
        ? "SmartHelse"
        : "Helseguiden";

  // Get verified competitor products for this language
  const competitors = getCompetitorProducts(request.productSlug, request.language);
  const productUrl = getProductUrlWithUTM(request.productSlug, request.language, request.slug);

  // Build competitor data section
  const currency = request.language === "da" ? "DKK" : request.language === "no" ? "NOK" : "kr";
  const competitorSection = competitors.length > 0
    ? `## Verified Competitor Products
ONLY use products from this list. NEVER invent, fabricate, or guess product names.

${competitors.map((c) =>
  `- **${c.nameSv}** (${c.brand}) — ~${c.priceSek} ${currency} — ${c.material}
  ${c.description}
  URL: ${c.url}`
).join("\n")}

CRITICAL: If you need more products than listed above, leave them out. Do NOT make up product names like "Jensen Dream", "Carpe Diem Cloud", "Hästens Comfort", or "DUX Form" — these do NOT exist.`
    : "";

  // Build verified external links section (language-specific)
  const langLinks = VERIFIED_EXTERNAL_LINKS[request.language] ?? VERIFIED_EXTERNAL_LINKS.sv;
  const domainNote = request.language === "da"
    ? "well-known Danish domains"
    : request.language === "no"
      ? "well-known Norwegian domains"
      : "well-known Swedish domains";
  const externalLinksSection = `## Verified External Links (use these exact URLs)
${Object.entries(langLinks).map(([key, { url, description }]) =>
  `- ${description}: ${url}`
).join("\n")}

NEVER fabricate URLs. Only link to URLs listed above or to ${domainNote} you are 100% certain exist. If unsure about a URL, omit the link.`;

  // Research citations: the article MUST cite at least 3 of the verified
  // PubMed studies below (if any are provided). These are all real,
  // peer-reviewed studies fetched fresh from PubMed for this article's
  // primary keyword. Citing these is mandatory — do NOT invent other
  // pubmed.ncbi.nlm.nih.gov URLs; they would be hallucinated.
  const researchCitationsSection = verifiedStudies.length > 0
    ? `## Verified Research Sources (MANDATORY CITATIONS)

Cite at least 3 of these studies inline as hyperlinks in the article body.
These are real peer-reviewed publications retrieved from PubMed just now.
NEVER link to any other pubmed.ncbi.nlm.nih.gov URL — only the ones below.

${verifiedStudies.map((s, i) =>
  `${i + 1}. [${s.design.toUpperCase()}, ${s.year}] "${s.title}"
   Authors: ${s.authors.slice(0, 3).join(", ")}${s.authors.length > 3 ? " et al." : ""}
   Journal: ${s.journal}
   URL: ${s.url}`
).join("\n\n")}

Cite studies in body text using descriptive anchor text linking to the URL:
  Example: "En <a href="${verifiedStudies[0].url}">systematisk översikt från ${verifiedStudies[0].year}</a> visade att ..."
Or reference by journal/authors:
  Example: "Forskning publicerad i ${verifiedStudies[0].journal} (<a href="${verifiedStudies[0].url}">${verifiedStudies[0].authors[0] ?? "studie"} et al., ${verifiedStudies[0].year}</a>) fann att ..."

CRITICAL: Paraphrase findings based on the study title. Do not invent specific
numbers, percentages, or conclusions that aren't clearly implied by the title.
If unsure what a study shows, cite it generically ("forskning visar att kollagen
kan påverka ...") rather than fabricating specifics.`
    : "";

  return `You are a senior ${langName} health & wellness journalist writing for ${blogName} (https://${request.blogDomain}). You write thoroughly researched, honest editorial content that ranks well in Google.

## CRITICAL: Language Rules
- Write ENTIRELY in ${langName}. Every word, including product descriptions, must be in ${langName}.
- Product names stay in their original brand form (e.g. "${request.productSlug === "hydro13" ? "Hydro13" : "HappySleep"}", "Tempur Original", "IKEA KLUBBSPORRE")
- NEVER translate brand names into English. Brand names are proper nouns — do NOT append English descriptors.
${request.language === "da"
  ? `- Use the brand name as-is or with a short ${langName} descriptor (e.g. just the product name).
- Danish compound words: nakkestøtte (not "nakke støtte"), sovestilling (not "sove stilling"), hukommelseskum (not "hukommelses skum"), rygsmerter (not "ryg smerter")
- Use correct Danish grammar and natural Danish sentence structures. Do NOT translate from English.`
  : request.language === "no"
    ? `- Use the brand name as-is or with a short ${langName} descriptor (e.g. just the product name).
- Norwegian compound words: nakkestøtte (not "nakke støtte"), sovestilling (not "sove stilling"), minneskum (not "minne skum"), ryggsmerter (not "rygg smerter"), sidesover (not "side sover")
- Use correct Norwegian (bokmål) grammar and natural Norwegian sentence structures. Do NOT translate from English.`
    : `- Use the brand name as-is or with a short ${langName} descriptor (e.g. just the product name).
- Swedish compound words: nackstöd (not "nack stöd"), sovställning (not "sov ställning"), minnesskum (not "minnes skum"), ryggsmärta (not "rygg smärta"), sidosovare (not "sido sovare")
- Use correct Swedish grammar and natural Swedish sentence structures. Do NOT translate from English.`}

## Your Identity
- You are the editorial team at ${blogName}, a small independent health review site
- First-person plural: "vi har testat", "vår bedömning", "vi rekommenderar"
- Your style: knowledgeable but conversational, like a helpful expert friend
- You have personally tested every product you review
- You buy all products yourself — no sponsorships

## Our Product (the one we recommend)
${productContext}

**Our product URL (ALWAYS use this exact link for CTA buttons and product recommendations):**
${productUrl}

${competitorSection}

## Internal Links
These are published articles on ${blogName}. Link to them where relevant using descriptive anchor text:
${internalLinks || "(No other articles published yet)"}

${externalLinksSection}

${researchCitationsSection}

## ANTI-FABRICATION RULES — CRITICAL

1. NEVER invent product names. Only mention products from the "Verified Competitor Products" list above or our own product.
2. NEVER fabricate URLs. Only use URLs from the verified lists above.
3. NEVER invent prices. Only use prices from the verified competitor data.
4. NEVER fabricate study citations. Only cite studies from the "Verified Research Sources" list (if provided) OR other real studies you are 100% certain exist (with correct author, journal, year). When in doubt, cite the verified list.
5. NEVER make up expert quotes, testimonials, or named people. DO NOT use the .quote-block CSS class at all — you are not allowed to attribute statements to specific people (doctors, physiotherapists, researchers, etc.) because you cannot verify they exist or said those things. This is a YMYL health site and fabricated expert quotes destroy trust and violate Google's E-E-A-T guidelines. Instead, paraphrase findings from real studies using "forskning visar att..." or "enligt [källa]...".
6. If the content brief asks for 12 products but you only have 10 verified ones, write about 10. Do NOT pad with made-up products.

## Anti-Slop Rules — CRITICAL

These patterns instantly reveal AI-generated content. NEVER use any of them:

### Banned Swedish phrases (and equivalents in other languages)
- "I en värld där..." / "I vår moderna värld..."
- "Det är ingen hemlighet att..." / "Det är väl känt att..."
- "Oavsett om du..." / "Om du letar efter..."
- "Från X till Y" (listing range of benefits)
- "Det är viktigt att notera/komma ihåg"
- "Sammanfattningsvis kan man säga"
- "Låt oss dyka ner i..." / "Låt oss utforska..."
- "Med det sagt..." / "Med andra ord..."
- "I slutändan..."

### Banned words
holistisk, revolutionerande, banbrytande, game-changer, optimal, transformera, nyanserad, mångfacetterad, otvetydigt

### Banned patterns
- Starting 2+ paragraphs the same way
- Generic filler that adds no information
- Overly smooth transitions between sections
- Explaining obvious things ("sömn är viktigt för kroppen")
- Lists where every item follows the same sentence structure
- Excessive hedging ("det bör noteras att det potentiellt kan...")
- Emoji or exclamation marks

### What to do instead
- Start paragraphs differently every time
- Use short, punchy sentences mixed with longer ones
- Include specific details (numbers, brand names, study authors)
- Be direct — state things plainly
- Vary sentence structure throughout
- Write like you're explaining to a smart friend, not lecturing

## SEO Rules
- Target keyword "${request.primaryKeyword}" in H1, first paragraph, and 2-3 H2s naturally
- Secondary keywords ${request.secondaryKeywords.map((k) => `"${k}"`).join(", ")} woven in naturally — never forced
- H2s phrased as questions where natural (Google featured snippet targeting)
- Every factual claim needs a source: real studies, 1177.se, medical journals
- IMPORTANT: Only use verified external link URLs from the list above.
- At least 3 FAQ items in a .faq-item section at the bottom
- Include a summary box (.tldr class) near the top with heading "Kort sammanfattning" (NOT "TL;DR") — each point as a separate <li> inside a <ul>
- Wrap ALL <table> elements in <div class="table-wrap">...</div> for mobile scrollability
- Year "2026" in title and body

## YMYL Compliance (Health Content)
- Google holds health content to the highest E-E-A-T standards
- Cite actual peer-reviewed studies where making health claims
- Use "studier tyder på", "forskning visar", not absolute medical claims
- Never say a product "cures", "treats", or "heals" anything
- For collagen: note that EFSA hasn't approved specific health claims yet
- Include a disclaimer box for health-related articles
- Link to 1177.se for Swedish health information

## Article Specifications
- Title: ${request.title}
- Category: ${request.category}
- Target word count: ${request.wordCount} words
- Template type: ${request.templateId}
- Language: ${langName}
${methodologyInstructionForTemplate(request.templateId, langName)}`;
}

/**
 * For listicle / comparison / buying-guide templates, instruct the writer
 * to include a "How we tested / How we ranked" methodology section. This is
 * a critical E-E-A-T signal that Google's December 2025 update prioritizes.
 * Affiliate sites without this took heavy ranking hits.
 */
function methodologyInstructionForTemplate(templateId: string, langName: string): string {
  const needsMethodology = ["listicle", "comparison", "buying-guide"].includes(templateId);
  if (!needsMethodology) return "";
  const heading = langName === "danish" ? "Sådan testede vi" : langName === "norwegian" ? "Slik testet vi" : "Så här testade vi";
  return `

## Methodology section (E-E-A-T critical for ${templateId})
Include a "${heading}" H2 section (3-5 paragraphs) covering:
- How many products we evaluated and over what time period
- What criteria we ranked on (specific testable attributes, NOT vague terms like "quality")
- Sources we consulted (peer-reviewed studies, verified Trustpilot reviews, ingredient databases like Livsmedelsverket)
- Disclosure: we sell our own product in this category (transparency boosts trust per Helpful Content Update)
- Why our recommendation is honest despite the disclosure (objective criteria, real test data)

Be specific - "We tested 7 products over 9 weeks with 3 testers" beats "We thoroughly researched the market".`;
}

function buildWriterUserPrompt(
  request: ArticleRequest,
  templateHtml: string
): string {
  const productUrl = getProductUrlWithUTM(request.productSlug, request.language, request.slug);

  return `Write the complete article based on this brief:

## Content Brief
${request.contentBrief}

## HTML Template (structural reference)
Follow this HTML structure exactly. Replace ALL placeholder text with real, researched content. Every product card, FAQ item, and section must have real content. Do not leave any placeholder or example text.

${templateHtml}

## Requirements
1. Output a complete HTML document matching the template structure
2. Replace ALL placeholder text — every heading, paragraph, product card, FAQ, and link
3. All product reviews must use ONLY products from the "Verified Competitor Products" list in your system prompt. NEVER invent product names.
4. Include at least 3 real source citations with verified URLs from the external links list
5. FAQ section must have 3-5 real, useful questions and answers
6. Summary box: heading must be "Kort sammanfattning" (NOT "TL;DR"). Use a <ul> with <li> items, not a run-on sentence. Be specific.
7. ALL CTA links and "buy" buttons for our product must point to: ${productUrl}
8. Word count target: ${request.wordCount}
9. IMAGES — Include exactly these 3 image placeholders (they will be replaced with AI-generated images). Each MUST have a UNIQUE URL:
   a. ONE hero image immediately after the H1 heading (before the intro paragraph):
      <img class="hero-img" src="https://placehold.co/1200x675/f3f4f6/9ca3af?text=Hero" alt="[descriptive alt text in Swedish]">
   b. FIRST section image (between major sections):
      <img class="section-img" src="https://placehold.co/1200x675/e2e8f0/64748b?text=Section+1" alt="[descriptive alt text in Swedish]">
   c. SECOND section image (between later sections):
      <img class="section-img" src="https://placehold.co/1200x675/e2e8f0/64748b?text=Section+2" alt="[descriptive alt text in Swedish]">
   CRITICAL: Each placeholder URL must be different (text=Hero, text=Section+1, text=Section+2). The hero image MUST be directly after the H1. Place section images after H2 sections where a visual break would help readability. Alt text must be in Swedish.
10. Write the ENTIRE article in Swedish. No English words except brand names.
11. If the title says "12 kuddar" but you only have 10 verified products, adjust the title number to match (e.g. "Test av 10 kuddar"). NEVER pad with fabricated products.
12. TABLES: Put the 2 most important columns FIRST — on mobile only the first 2 columns are visible. Example: "Kudde" + "Betyg" as columns 1-2, then "Pris" + "Bäst för" as 3-4. Always wrap tables in <div class="table-wrap">...</div>.

Return ONLY the HTML document. No explanations, no code fences, no commentary.`;
}

// ---------------------------------------------------------------------------
// Naturlig svenska pass - rewrites HTML to fix AI-tells in Swedish text
// ---------------------------------------------------------------------------

async function naturligSvenskaPass(
  client: Anthropic,
  html: string,
): Promise<{ html: string; inputTokens: number; outputTokens: number }> {
  const systemPrompt = `${NATURLIG_SVENSKA_SKILL}

---

# Din uppgift just nu

Du får en svensk artikel som HTML. Tillämpa naturlig-svenska-skill:en på den.

Hårda regler för det här passet:
1. Behåll ALL HTML-struktur intakt: alla taggar, klassnamn, href, src, alt, <style>-block, <a>-länkar.
2. Behåll FAQ-strukturen som den är (faq-section, faq-item etc).
3. Behåll alla länkar exakt som dom är - URL:er får inte ändras.
4. Behåll bildplaceholders och bild-alt-text.
5. Behåll H1, H2, H3-strukturen och rubrik-texterna - de får putsas men inte bytas ut konceptuellt.
6. SKRIV OM brödtexten enligt skill:ens principer - berättarstruktur först, sen tekniskt.
7. Returnera ENDAST HTML, inga förklaringar eller kommentarer, inga code fences.

OBS: Skriv inte om hela artikeln strukturellt - sektioner och deras ordning ska bevaras. Det här passet är för att förbättra texten INOM varje stycke + sektioners rytm/flow, inte att omarrangera artikeln.`;

  const userPrompt = `Här är artikeln att tillämpa naturlig-svenska-skill:en på:

${html}`;

  // Use streaming for safety with long articles (>10k tokens output is common)
  let outHtml = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 32000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      const delta = event.delta as unknown as { type: string; text?: string };
      if (delta.type === "text_delta" && delta.text) {
        outHtml += delta.text;
      }
    }
    if (event.type === "message_delta") {
      const usage = (event as unknown as { usage?: { output_tokens?: number } }).usage;
      if (usage?.output_tokens) outputTokens = usage.output_tokens;
    }
    if (event.type === "message_start") {
      const usage = (event as unknown as { message?: { usage?: { input_tokens?: number } } })
        .message?.usage;
      if (usage?.input_tokens) inputTokens = usage.input_tokens;
    }
  }

  // Strip code fences if model accidentally added them
  const cleaned = outHtml
    .replace(/^```(?:html?)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // Defensive sanity-check: if output is dramatically shorter than input
  // the rewrite probably broke something. Keep original.
  if (cleaned.length < html.length * 0.5) {
    throw new Error(
      `Naturlig svenska pass output too short: ${cleaned.length} vs original ${html.length}`,
    );
  }

  return { html: cleaned, inputTokens, outputTokens };
}

// ---------------------------------------------------------------------------
// Product context builder
// ---------------------------------------------------------------------------

async function getProductContext(productSlug: string): Promise<string> {
  const db = createServerSupabase();

  const { data: product } = await db
    .from("products")
    .select("*")
    .eq("slug", productSlug)
    .single();

  if (!product) {
    return `Product: ${productSlug} (no product bank data available)`;
  }

  const parts: string[] = [];
  parts.push(`### ${product.name}`);
  if (product.tagline) parts.push(`Tagline: ${product.tagline}`);
  if (product.description) parts.push(`Description: ${product.description}`);
  if (product.benefits?.length) {
    parts.push(`Key benefits:\n${(product.benefits as string[]).map((b: string) => `- ${b}`).join("\n")}`);
  }
  if (product.usps?.length) {
    parts.push(`USPs:\n${(product.usps as string[]).map((u: string) => `- ${u}`).join("\n")}`);
  }
  if (product.claims?.length) {
    parts.push(`Verified claims:\n${(product.claims as string[]).map((c: string) => `- ${c}`).join("\n")}`);
  }
  if (product.ingredients) parts.push(`Ingredients/materials: ${product.ingredients}`);
  if (product.target_audience) parts.push(`Target audience: ${product.target_audience}`);

  // Also fetch copywriting guidelines for this product
  const { data: guidelines } = await db
    .from("copywriting_guidelines")
    .select("name, content")
    .eq("product_id", product.id)
    .limit(3);

  if (guidelines?.length) {
    parts.push("\n### Copywriting Guidelines");
    for (const g of guidelines) {
      parts.push(`**${g.name}:** ${(g.content as string).slice(0, 500)}`);
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Internal link builder
// ---------------------------------------------------------------------------

async function getInternalLinks(
  slugs: string[],
  language: string,
  blogDomain: string
): Promise<string> {
  if (!slugs.length) return "";

  const db = createServerSupabase();
  const { data: translations } = await db
    .from("translations")
    .select("slug, seo_title, pages!inner(blog_category, content_type)")
    .eq("language", language)
    .eq("status", "published")
    .eq("pages.content_type", "seo_blog")
    .in("slug", slugs);

  if (!translations?.length) return "";

  return translations
    .map((t) => {
      const page = t.pages as unknown as { blog_category?: string };
      const category = page?.blog_category;
      const categorySlug = category
        ? category.toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
        : "";
      const path = categorySlug ? `${categorySlug}/${t.slug}` : t.slug;
      return `- "${t.seo_title}" → https://${blogDomain}/${path}`;
    })
    .join("\n");
}
