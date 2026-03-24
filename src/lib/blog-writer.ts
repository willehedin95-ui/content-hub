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
    da: "https://swedishbalance.se/products/happysleep",
    no: "https://swedishbalance.se/products/happysleep",
  },
  hydro13: {
    sv: "https://swedishbalance.se/products/hydro13",
    da: "https://swedishbalance.se/products/hydro13",
    no: "https://swedishbalance.se/products/hydro13",
  },
};

export function getProductUrl(productSlug: string, language: string): string {
  return PRODUCT_URLS[productSlug]?.[language] ?? PRODUCT_URLS[productSlug]?.sv ?? "#";
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

/** Get verified competitors for a product category */
export function getCompetitorProducts(productSlug: string): CompetitorProduct[] {
  if (productSlug === "happysleep") return PILLOW_COMPETITORS;
  if (productSlug === "hydro13") return COLLAGEN_COMPETITORS;
  return [];
}

// ---------------------------------------------------------------------------
// Verified external links for health content
// ---------------------------------------------------------------------------

const VERIFIED_EXTERNAL_LINKS: Record<string, { url: string; description: string }> = {
  "1177": {
    url: "https://www.1177.se/",
    description: "1177 Vårdguiden — Sveriges officiella hälsoinformationstjänst",
  },
  "1177_nacke": {
    url: "https://www.1177.se/sjukdomar--besvar/skelett-leder-och-muskler/rygg-och-nacke/ont-i-nacke-och-axlar/",
    description: "1177 — Ont i nacke och axlar",
  },
  "1177_somn": {
    url: "https://www.1177.se/liv--halsa/stresshantering-och-somn/somnen-ar-viktig-for-din-halsa/",
    description: "1177 — Sömnen är viktig för din hälsa",
  },
  "1177_rygg": {
    url: "https://www.1177.se/sjukdomar--besvar/skelett-leder-och-muskler/rygg-och-nacke/ont-i-ryggen/",
    description: "1177 — Ont i ryggen",
  },
  internetmedicin: {
    url: "https://www.internetmedicin.se/",
    description: "Internetmedicin — medicinsk kunskapsbas för vårdpersonal",
  },
  ki: {
    url: "https://ki.se/",
    description: "Karolinska Institutet — Sveriges ledande medicinska universitet",
  },
  livsmedelsverket: {
    url: "https://www.livsmedelsverket.se/",
    description: "Livsmedelsverket — råd om kost och nutrition",
  },
  sbu: {
    url: "https://www.sbu.se/",
    description: "SBU — Statens beredning för medicinsk och social utvärdering",
  },
};

// Post-processing: fix any remaining wrong 1177.se URLs that Claude might hallucinate
const URL_REPLACEMENTS: [RegExp, string][] = [
  // Common hallucinated 1177 paths → real URLs
  [/https:\/\/www\.1177\.se\/sjukdomar--besvar\/skelett-leder-och-muskler\/nacke-och-rygg\/ont-i-nacken\/?/g,
   "https://www.1177.se/sjukdomar--besvar/skelett-leder-och-muskler/rygg-och-nacke/ont-i-nacke-och-axlar/"],
  [/https:\/\/www\.1177\.se\/liv--halsa\/sova-bra\/?/g,
   "https://www.1177.se/liv--halsa/stresshantering-och-somn/somnen-ar-viktig-for-din-halsa/"],
  [/https:\/\/www\.1177\.se\/sjukdomar--besvar\/skelett-leder-och-muskler\/nacke-och-rygg\/ont-i-ryggen\/?/g,
   "https://www.1177.se/sjukdomar--besvar/skelett-leder-och-muskler/rygg-och-nacke/ont-i-ryggen/"],
];

/** Fix known hallucinated URLs in article HTML */
export function fixHallucinatedUrls(html: string): string {
  let result = html;
  for (const [pattern, replacement] of URL_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

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
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 32000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const html = (response.content[0] as { type: string; text: string }).text;

  // Strip code fences if Claude added them
  const cleanHtml = html
    .replace(/^```html?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

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
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
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

  // Get verified competitor products
  const competitors = getCompetitorProducts(request.productSlug);
  const productUrl = getProductUrl(request.productSlug, request.language);

  // Build competitor data section
  const competitorSection = competitors.length > 0
    ? `## Verified Competitor Products
ONLY use products from this list. NEVER invent, fabricate, or guess product names.

${competitors.map((c) =>
  `- **${c.nameSv}** (${c.brand}) — ${c.priceSek} kr — ${c.material}
  ${c.description}
  URL: ${c.url}`
).join("\n")}

CRITICAL: If you need more products than listed above, leave them out. Do NOT make up product names like "Jensen Dream", "Carpe Diem Cloud", "Hästens Comfort", or "DUX Form" — these do NOT exist.`
    : "";

  // Build verified external links section
  const externalLinksSection = `## Verified External Links (use these exact URLs)
${Object.entries(VERIFIED_EXTERNAL_LINKS).map(([key, { url, description }]) =>
  `- ${description}: ${url}`
).join("\n")}

NEVER fabricate URLs. Only link to URLs listed above or to well-known Swedish domains you are 100% certain exist. If unsure about a URL, omit the link.`;

  return `You are a senior ${langName} health & wellness journalist writing for ${blogName} (https://${request.blogDomain}). You write thoroughly researched, honest editorial content that ranks well in Google.

## CRITICAL: Language Rules
- Write ENTIRELY in ${langName}. Every word, including product descriptions, must be in ${langName}.
- Product names stay in their original brand form (e.g. "HappySleep", "Tempur Original", "IKEA KLUBBSPORRE")
- NEVER translate brand names into English. "HappySleep" is the brand name — do NOT write "HappySleep Cervical Pillow" or any English descriptor. Write "HappySleep ergonomisk kudde" or just "HappySleep".
- Swedish compound words: nackstöd (not "nack stöd"), sovställning (not "sov ställning"), minnesskum (not "minnes skum"), ryggsmärta (not "rygg smärta"), sidosovare (not "sido sovare")
- Use correct Swedish grammar and natural Swedish sentence structures. Do NOT translate from English.

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
5. NEVER make up expert quotes or testimonials.
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
- Include a TL;DR box (.tldr class) near the top — each point as a separate <li> inside a <ul>
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
  const productUrl = getProductUrl(request.productSlug, request.language);

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
6. TL;DR box: use a <ul> with <li> items, not a run-on sentence. Be specific.
7. ALL CTA links and "buy" buttons for our product must point to: ${productUrl}
8. Word count target: ${request.wordCount}
9. Include 2 editorial image placeholders between major sections using this exact format:
   <img class="section-img" src="https://placehold.co/1200x675/e2e8f0/64748b?text=Section+Image" alt="[descriptive alt text in Swedish matching section topic]">
   Place them after H2 sections where a visual break would help readability. Alt text must be in Swedish and describe what the image should show.
10. Write the ENTIRE article in Swedish. No English words except brand names.
11. If the title says "12 kuddar" but you only have 10 verified products, adjust the title number to match (e.g. "Test av 10 kuddar"). NEVER pad with fabricated products.

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
