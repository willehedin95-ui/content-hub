/**
 * Blog article writer — uses Claude to generate full SEO articles.
 * Takes a keyword, template, product context, and content brief.
 * Returns complete HTML ready for blog shell wrapping + publish.
 */

import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "./constants";
import { BLOG_TEMPLATES } from "./blog-templates";
import { createServerSupabase } from "./supabase-admin";

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

/** Get verified competitors for a product category and language */
export function getCompetitorProducts(productSlug: string, language: string = "sv"): CompetitorProduct[] {
  if (productSlug === "happysleep") {
    if (language === "da") return PILLOW_COMPETITORS_DA;
    if (language === "no") return PILLOW_COMPETITORS_NO;
    return PILLOW_COMPETITORS;
  }
  if (productSlug === "hydro13") return COLLAGEN_COMPETITORS;
  return [];
}

// ---------------------------------------------------------------------------
// Verified external links for health content
// ---------------------------------------------------------------------------

type ExternalLink = { url: string; description: string };

const VERIFIED_EXTERNAL_LINKS: Record<string, Record<string, ExternalLink>> = {
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
  request: ArticleRequest
): Promise<ArticleResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  // Fetch product context from product bank
  const productContext = await getProductContext(request.productSlug);

  // Get existing articles for internal linking
  const internalLinks = await getInternalLinks(
    request.internalLinkSlugs,
    request.language,
    request.blogDomain
  );

  // Get template HTML as structural reference
  const template = BLOG_TEMPLATES.find((t) => t.id === request.templateId);
  const templateHtml = template
    ? template.getHtml(request.title)
    : BLOG_TEMPLATES[0].getHtml(request.title);

  const systemPrompt = buildWriterSystemPrompt(request, productContext, internalLinks);
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

function buildWriterSystemPrompt(
  request: ArticleRequest,
  productContext: string,
  internalLinks: string
): string {
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

## ANTI-FABRICATION RULES — CRITICAL

1. NEVER invent product names. Only mention products from the "Verified Competitor Products" list above or our own product.
2. NEVER fabricate URLs. Only use URLs from the verified lists above.
3. NEVER invent prices. Only use prices from the verified competitor data.
4. NEVER fabricate study citations. Only cite studies you know are real (author, journal, year).
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
- Language: ${langName}`;
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
