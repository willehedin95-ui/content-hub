import * as cheerio from "cheerio";
import type { Language } from "@/types";
import { STORAGE_BUCKET } from "./constants";

// Author avatar stored in Supabase storage
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fbpefeqqqfrcmfmjmeij.supabase.co";
const AUTHOR_AVATAR_URL = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/blog/author-erik-lindberg.png`;

// Author identity. Single editor across all three blogs to keep the persona
// coherent. Bio is intentionally modest — Erik is presented as the editor
// curating content, not a subject-matter expert with claimed credentials.
const AUTHOR_NAME = "Erik Lindberg";
const AUTHOR_SLUG = "erik-lindberg";

interface AuthorContent {
  authorPath: string;
  authorTitle: string;
  authorRole: string;
  authorBio: string[];
  aboutPath: string;
  aboutTitle: string;
  aboutBody: string[];
}

const PAGE_CONTENT: Record<Language, AuthorContent> = {
  sv: {
    authorPath: `forfattare/${AUTHOR_SLUG}`,
    authorTitle: `${AUTHOR_NAME} - Redaktör`,
    authorRole: "Redaktör, Hälsobladet",
    authorBio: [
      "Erik Lindberg är redaktör för Hälsobladet och ansvarar för redaktionsarbetet bakom guider, produkttester och hälsoartiklar. Han har en bakgrund inom hälsojournalistik och har skrivit om sömn, kost och välmående i över ett decennium.",
      "Som redaktör samarbetar Erik med läkare, sömnforskare och produkttestare för att kvalitetssäkra det som publiceras. Alla artiklar bygger på publicerade studier och refererar till primärkällor när det är relevant.",
      "Hälsobladet är en del av Swedish Balance, ett svenskt företag som specialiserar sig på sömnprodukter. Vi tar inte emot ersättning för att skriva positiva produktomdömen.",
    ],
    aboutPath: "om-oss",
    aboutTitle: "Om Hälsobladet",
    aboutBody: [
      "Hälsobladet drivs av Swedish Balance AB, ett svenskt företag som specialiserar sig på sömnprodukter och hälsoguider. Vi grundades med målet att hjälpa människor sova bättre och må bättre genom evidensbaserad information.",
      "Vad vi gör: vi testar och jämför kuddar, sömntillskott och andra produkter, och vi skriver guider om sömn, hälsa och vardagsproblem som påverkar livskvaliteten. Vårt redaktionsarbete leds av Erik Lindberg, och vi konsulterar läkare och sömnforskare när vi skriver om medicinska ämnen.",
      "Vad vi inte gör: vi tar inte emot betalning från tillverkare för positiva produktomdömen. Vissa länkar till produkter är annonslänkar — det innebär att vi får en mindre ersättning om du handlar via dem, men det påverkar inte vilka produkter vi rekommenderar eller vad vi skriver. Detta står även i den specifika artikelns disclosure.",
      "Kontakt: redaktion@halsobladet.com",
    ],
  },
  da: {
    authorPath: `forfattere/${AUTHOR_SLUG}`,
    authorTitle: `${AUTHOR_NAME} - Redaktør`,
    authorRole: "Redaktør, SmartHelse",
    authorBio: [
      "Erik Lindberg er redaktør for SmartHelse og ansvarlig for redaktionsarbejdet bag guides, produkttests og sundhedsartikler. Han har en baggrund inden for sundhedsjournalistik og har skrevet om søvn, kost og velvære i over et årti.",
      "Som redaktør samarbejder Erik med læger, søvnforskere og produkttestere for at kvalitetssikre det, der publiceres. Alle artikler bygger på publicerede studier og refererer til primærkilder, når det er relevant.",
      "SmartHelse er en del af Swedish Balance, et svensk firma der specialiserer sig i søvnprodukter. Vi modtager ikke betaling for at skrive positive produktanmeldelser.",
    ],
    aboutPath: "om-os",
    aboutTitle: "Om SmartHelse",
    aboutBody: [
      "SmartHelse drives af Swedish Balance AB, et svensk firma der specialiserer sig i søvnprodukter og sundhedsguides. Vi blev grundlagt med målet at hjælpe folk med at sove bedre og have det bedre gennem evidensbaseret information.",
      "Hvad vi gør: vi tester og sammenligner puder, søvntilskud og andre produkter, og vi skriver guides om søvn, sundhed og dagligdagsproblemer der påvirker livskvaliteten. Vores redaktionsarbejde ledes af Erik Lindberg, og vi konsulterer læger og søvnforskere, når vi skriver om medicinske emner.",
      "Hvad vi ikke gør: vi modtager ikke betaling fra producenter for positive produktanmeldelser. Visse links til produkter er annoncelinks — det betyder, at vi får en mindre kompensation, hvis du handler via dem, men det påvirker ikke, hvilke produkter vi anbefaler, eller hvad vi skriver. Dette står også i den enkelte artikels disclosure.",
      "Kontakt: redaktion@smarthelse.dk",
    ],
  },
  no: {
    authorPath: `forfattere/${AUTHOR_SLUG}`,
    authorTitle: `${AUTHOR_NAME} - Redaktør`,
    authorRole: "Redaktør, Helseguiden",
    authorBio: [
      "Erik Lindberg er redaktør for Helseguiden og ansvarlig for redaksjonsarbeidet bak guider, produkttester og helseartikler. Han har en bakgrunn innen helsejournalistikk og har skrevet om søvn, kosthold og velvære i over et tiår.",
      "Som redaktør samarbeider Erik med leger, søvnforskere og produkttestere for å kvalitetssikre det som publiseres. Alle artikler bygger på publiserte studier og refererer til primærkilder når det er relevant.",
      "Helseguiden er en del av Swedish Balance, et svensk selskap som spesialiserer seg på søvnprodukter. Vi tar ikke imot betaling for å skrive positive produktanmeldelser.",
    ],
    aboutPath: "om-oss",
    aboutTitle: "Om Helseguiden",
    aboutBody: [
      "Helseguiden drives av Swedish Balance AB, et svensk selskap som spesialiserer seg på søvnprodukter og helseguider. Vi ble grunnlagt med målet om å hjelpe folk å sove bedre og ha det bedre gjennom evidensbasert informasjon.",
      "Hva vi gjør: vi tester og sammenligner puter, søvntilskudd og andre produkter, og vi skriver guider om søvn, helse og hverdagsproblemer som påvirker livskvaliteten. Vårt redaksjonsarbeid ledes av Erik Lindberg, og vi konsulterer leger og søvnforskere når vi skriver om medisinske emner.",
      "Hva vi ikke gjør: vi tar ikke imot betaling fra produsenter for positive produktanmeldelser. Enkelte lenker til produkter er annonselenker — det betyr at vi får en mindre kompensasjon hvis du handler via dem, men det påvirker ikke hvilke produkter vi anbefaler eller hva vi skriver. Dette står også i den enkelte artikkelens disclosure.",
      "Kontakt: redaksjon@helseguiden.com",
    ],
  },
};

export function getAuthorPath(lang: Language): string {
  return PAGE_CONTENT[lang]?.authorPath ?? `forfattare/${AUTHOR_SLUG}`;
}

export function getAboutPath(lang: Language): string {
  return PAGE_CONTENT[lang]?.aboutPath ?? "om-oss";
}

const FOOTER_NAV_LABELS: Record<Language, { about: string; author: string }> = {
  sv: { about: "Om oss", author: "Författare" },
  da: { about: "Om os", author: "Forfattere" },
  no: { about: "Om oss", author: "Forfattere" },
};

function renderFooterNav(language: Language, baseUrl: string): string {
  const labels = FOOTER_NAV_LABELS[language] ?? FOOTER_NAV_LABELS.sv;
  const c = PAGE_CONTENT[language];
  if (!c || c.authorBio.length === 0) return "";
  return `<nav class="blog-shell-footer-nav"><a href="${baseUrl}/${c.aboutPath}/">${labels.about}</a> · <a href="${baseUrl}/${c.authorPath}/">${labels.author}: ${AUTHOR_NAME}</a></nav>`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlogConfig {
  languages: Record<string, BlogLanguageConfig>;
  primary_color: string;
  logo_url?: string;
}

export interface BlogLanguageConfig {
  blog_name: string;
  blog_tagline: string;
  about_text: string;
  affiliate_disclosure: string;
  nav_home_label: string;
  copyright_text: string;
}

export interface BlogArticleSummary {
  title: string;
  slug: string;
  categorySlug?: string;
  excerpt: string;
  featuredImageUrl?: string;
  category?: string;
  publishedAt: string;
}

// ---------------------------------------------------------------------------
// Category URL helpers
// ---------------------------------------------------------------------------

/**
 * Convert a display category name to a URL-safe slug.
 * "Sömn & Hälsa" → "somn-halsa", "Produktguider" → "produktguider"
 */
export function slugifyCategory(category: string): string {
  return category
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build the full URL path for a blog article, including category prefix.
 * getArticlePath("nacksmarta-natten", "somn-halsa") → "somn-halsa/nacksmarta-natten"
 */
export function getArticlePath(slug: string, categorySlug?: string): string {
  return categorySlug ? `${categorySlug}/${slug}` : slug;
}

interface WrapOptions {
  articleBodyHtml: string;
  articleHeadHtml: string;
  seoTitle: string;
  seoDescription: string;
  slug: string;
  language: Language;
  blogConfig: BlogConfig;
  relatedArticles: BlogArticleSummary[];
  featuredImageUrl?: string;
  blogCategory?: string;
  publishedAt: string;
  updatedAt: string;
  baseUrl: string;
}

interface HomepageOptions {
  articles: BlogArticleSummary[];
  language: Language;
  blogConfig: BlogConfig;
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// Default config for the 3 blog domains
// ---------------------------------------------------------------------------

export function getDefaultBlogConfig(): BlogConfig {
  return {
    primary_color: "#16a34a",
    languages: {
      sv: {
        blog_name: "Hälsobladet",
        blog_tagline: "",
        about_text:
          "Hälsobladet är en oberoende hälsosajt som testar och jämför produkter för bättre sömn och hälsa. Vi köper alla produkter själva och delar ärliga omdömen.",
        affiliate_disclosure:
          "Denna artikel innehåller annonslänkar. Vi kan få ersättning om du köper via våra länkar, utan extra kostnad för dig.",
        nav_home_label: "Hem",
        copyright_text: `© ${new Date().getFullYear()} Hälsobladet. Alla rättigheter förbehållna.`,
      },
      da: {
        blog_name: "SmartHelse",
        blog_tagline: "",
        about_text:
          "SmartHelse er en uafhængig sundhedsside, der tester og sammenligner produkter til bedre søvn og sundhed. Vi køber alle produkter selv og deler ærlige anmeldelser.",
        affiliate_disclosure:
          "Denne artikel indeholder annoncelinks. Vi kan modtage kompensation, hvis du køber via vores links, uden ekstra omkostninger for dig.",
        nav_home_label: "Hjem",
        copyright_text: `© ${new Date().getFullYear()} SmartHelse. Alle rettigheder forbeholdes.`,
      },
      no: {
        blog_name: "Helseguiden",
        blog_tagline: "",
        about_text:
          "Helseguiden er en uavhengig helseside som tester og sammenligner produkter for bedre søvn og helse. Vi kjøper alle produkter selv og deler ærlige anmeldelser.",
        affiliate_disclosure:
          "Denne artikkelen inneholder annonselenker. Vi kan motta kompensasjon hvis du kjøper via våre lenker, uten ekstra kostnad for deg.",
        nav_home_label: "Hjem",
        copyright_text: `© ${new Date().getFullYear()} Helseguiden. Alle rettigheter forbeholdt.`,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Extract article body from full builder HTML
// ---------------------------------------------------------------------------

export function extractArticleBody(fullHtml: string): {
  bodyHtml: string;
  headHtml: string;
} {
  const $ = cheerio.load(fullHtml);

  // Remove tracking/editor scripts that will be re-injected by publish pipeline
  $(
    [
      "script[data-cc-ga4]",
      "script[data-cc-clarity]",
      "script[data-cc-fbpixel]",
      "script[data-cc-chpixel]",
      "script[data-cc-utm]",
      "script[data-cc-optout]",
      "script[data-cc-countdown]",
      "div[data-cc-custom]",
    ].join(", ")
  ).remove();

  const headHtml = $("head").html() || "";
  const bodyHtml = $("body").html() || "";

  return { bodyHtml, headHtml };
}

/**
 * Extract first <img> src from HTML for use as featured image fallback.
 */
export function extractFirstImage(html: string): string | undefined {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1];
}

/**
 * Extract a meta description from article body HTML.
 * Grabs the first meaningful paragraph text (skips TL;DR box, info boxes, etc.)
 * and truncates to ~155 characters at the nearest word boundary.
 */
export function extractMetaDescription(html: string): string {
  const $ = cheerio.load(html);

  // Remove elements that aren't good meta description candidates
  $(".tldr, .info-box, .faq-item, .cta-box, .pros-cons, table, script, style").remove();

  // Find the first <p> with enough text (skip short intros)
  let description = "";
  $("p").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length >= 40 && !description) {
      description = text;
    }
  });

  if (!description) return "";

  // Truncate at ~155 chars on word boundary
  if (description.length <= 155) return description;
  const truncated = description.slice(0, 155);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 80 ? truncated.slice(0, lastSpace) : truncated) + "...";
}

/**
 * Auto-fill empty or placeholder alt text on <img> elements in article HTML.
 * Uses the nearest preceding heading (H2/H3) + article title for context.
 * Called at publish time for seo_blog pages so no image ships without alt text.
 */
export function autoFillAltText(html: string, articleTitle: string): string {
  const $ = cheerio.load(html);
  const placeholders = new Set([
    "", "image", "illustration", "produktbild", "artikelbild",
    "guidebild", "forskning", "jämförelse", "guide",
    "steg-för-steg-guide", "köpguide", "a vs b", "produktjämförelse",
  ]);

  $("img").each((_, el) => {
    const img = $(el);
    const currentAlt = (img.attr("alt") || "").trim().toLowerCase();

    // Skip images that already have meaningful alt text
    if (currentAlt && !placeholders.has(currentAlt) && !currentAlt.includes("placehold")) {
      return;
    }

    // Walk backward to find the nearest heading
    let heading = "";
    let node = img.parent();
    for (let i = 0; i < 10 && node.length; i++) {
      const prev = node.prevAll("h2, h3").first();
      if (prev.length) {
        heading = prev.text().trim();
        break;
      }
      node = node.parent();
    }

    // Build alt text: heading context + article title
    let alt: string;
    if (heading) {
      // Strip trailing question marks for cleaner alt text
      const cleanHeading = heading.replace(/\?$/, "").trim();
      alt = `${cleanHeading} — ${articleTitle}`;
    } else {
      alt = articleTitle;
    }

    // Truncate to 125 chars
    if (alt.length > 125) {
      const truncated = alt.slice(0, 125);
      const lastSpace = truncated.lastIndexOf(" ");
      alt = lastSpace > 50 ? truncated.slice(0, lastSpace) : truncated;
    }

    img.attr("alt", alt);
  });

  // Return just the body content — cheerio.load() wraps fragments in <html><body>
  return $("body").html() || $.html();
}

/**
 * Inject UTM parameters into all outbound product links in blog article HTML.
 * Ensures Shopify order attribution back to the originating blog article.
 *
 * UTM scheme: utm_source=blog&utm_medium=organic&utm_campaign={slug}
 * Matched by shopify.ts getOrdersByPage() via utm_campaign (priority 2).
 */
export function injectBlogUTMs(html: string, articleSlug: string): string {
  const shopifyDomains = [
    "swedishbalance.se",
    "swedishbalance.dk",
    "get-renew.com",
  ];

  const domainPattern = shopifyDomains.map((d) => d.replace(/\./g, "\\.")).join("|");
  const linkRegex = new RegExp(
    `(href=["'])(https?://(?:www\\.)?(?:${domainPattern})[^"']*)(["'])`,
    "gi"
  );

  return html.replace(linkRegex, (match, prefix, url, suffix) => {
    try {
      const parsed = new URL(url);
      // Don't overwrite existing UTM params
      if (!parsed.searchParams.has("utm_source")) {
        parsed.searchParams.set("utm_source", "blog");
        parsed.searchParams.set("utm_medium", "organic");
        parsed.searchParams.set("utm_campaign", articleSlug);
      }
      return `${prefix}${parsed.toString()}${suffix}`;
    } catch {
      return match;
    }
  });
}

/**
 * After image optimization replaces absolute Supabase URLs with relative WebP paths
 * (global string replace), OG/Twitter/JSON-LD image URLs become relative too.
 * This function fixes them back to absolute URLs.
 */
export function fixMetaImageUrls(html: string, baseUrl: string): string {
  // Fix og:image and twitter:image meta tags with relative paths
  return html.replace(
    /(<meta\s+(?:property|name)=["'](?:og:image|twitter:image)["']\s+content=["'])(\/[^"']+)(["'])/gi,
    `$1${baseUrl}$2$3`
  ).replace(
    // Fix JSON-LD "image":"/relative/path"
    /"image"\s*:\s*"(\/[^"]+)"/g,
    `"image":"${baseUrl}$1"`
  );
}

// ---------------------------------------------------------------------------
// Hreflang tags for cross-language linking
// ---------------------------------------------------------------------------

const HREFLANG_MAP: Record<string, string> = {
  sv: "sv-SE",
  da: "da-DK",
  no: "nb-NO",
};

function getBlogDomain(lang: Language): string | undefined {
  return process.env[`CF_PAGES_DOMAIN_${lang.toUpperCase()}`]?.trim() || undefined;
}

function buildHreflangTags(
  slug: string,
  categorySlug: string | undefined,
  currentLang: Language,
  currentBaseUrl: string
): string {
  const urlPath = getArticlePath(slug, categorySlug);
  const tags: string[] = [];

  // Self-referencing hreflang (required by Google)
  const hreflang = HREFLANG_MAP[currentLang] || currentLang;
  tags.push(`<link rel="alternate" hreflang="${hreflang}" href="${esc(currentBaseUrl)}/${esc(urlPath)}/">`);

  // Other languages — only include if the domain is configured
  const allLangs: Language[] = ["sv", "da", "no"];
  for (const lang of allLangs) {
    if (lang === currentLang) continue;
    const domain = getBlogDomain(lang);
    if (!domain) continue;
    const hl = HREFLANG_MAP[lang] || lang;
    tags.push(`<link rel="alternate" hreflang="${hl}" href="https://${esc(domain)}/${esc(urlPath)}/">`);
  }

  // x-default points to Swedish version
  tags.push(`<link rel="alternate" hreflang="x-default" href="${esc(currentBaseUrl)}/${esc(urlPath)}/">`);

  return tags.join("\n  ");
}

// ---------------------------------------------------------------------------
// Wrap article body in blog shell
// ---------------------------------------------------------------------------

export function wrapInBlogShell(opts: WrapOptions): string {
  const langConfig =
    opts.blogConfig.languages[opts.language] ??
    getDefaultBlogConfig().languages[opts.language] ??
    getDefaultBlogConfig().languages.sv;

  const color = opts.blogConfig.primary_color || "#16a34a";
  const categorySlug = opts.blogCategory ? slugifyCategory(opts.blogCategory) : undefined;
  const urlPath = getArticlePath(opts.slug, categorySlug);

  // Ensure featured image URL is absolute (image optimizer produces relative paths)
  const absoluteImageUrl = opts.featuredImageUrl
    ? opts.featuredImageUrl.startsWith("http")
      ? opts.featuredImageUrl
      : `${opts.baseUrl}${opts.featuredImageUrl.startsWith("/") ? "" : "/"}${opts.featuredImageUrl}`
    : undefined;
  const ogImage = absoluteImageUrl
    ? `<meta property="og:image" content="${esc(absoluteImageUrl)}">`
    : "";

  // Breadcrumbs
  const breadcrumbItems: { name: string; url: string }[] = [
    { name: langConfig.nav_home_label, url: `${opts.baseUrl}/` },
  ];
  if (categorySlug && opts.blogCategory) {
    breadcrumbItems.push({ name: opts.blogCategory, url: `${opts.baseUrl}/${categorySlug}/` });
  }
  breadcrumbItems.push({ name: opts.seoTitle, url: `${opts.baseUrl}/${urlPath}` });

  const breadcrumbHtml = breadcrumbItems
    .map((item, i) => {
      if (i === breadcrumbItems.length - 1) {
        return `<span>${esc(item.name)}</span>`;
      }
      if (item.url) {
        return `<a href="${esc(item.url)}">${esc(item.name)}</a>`;
      }
      return `<span>${esc(item.name)}</span>`;
    })
    .join(' <span class="blog-shell-sep">/</span> ');

  // Related articles
  const relatedHtml =
    opts.relatedArticles.length > 0
      ? `<aside class="blog-shell-related">
        <h2>${opts.language === "sv" ? "Relaterade artiklar" : opts.language === "da" ? "Relaterede artikler" : "Relaterte artikler"}</h2>
        <div class="blog-shell-related-grid">
          ${opts.relatedArticles
            .slice(0, 4)
            .map(
              (a) => `<a href="${esc(opts.baseUrl)}/${esc(getArticlePath(a.slug, a.categorySlug))}" class="blog-shell-card">
              ${a.featuredImageUrl ? `<img src="${esc(a.featuredImageUrl)}" alt="${esc(a.title)}" loading="lazy">` : ""}
              <h3>${esc(a.title)}</h3>
              ${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ""}
            </a>`
            )
            .join("\n          ")}
        </div>
      </aside>`
      : "";

  // Schema: FAQPage JSON-LD (auto-extracted from .faq-item elements)
  const faqItems = extractFaqItems(opts.articleBodyHtml);
  const faqSchema = faqItems.length > 0
    ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      })
    : "";

  // Schema: Article JSON-LD. Includes Person author with @id pointing at the
  // dedicated author page so Google can resolve the entity across articles
  // (E-E-A-T signal). Without this the byline is purely cosmetic.
  const authorPageUrl = `${opts.baseUrl}/${getAuthorPath(opts.language)}/`;
  const articleSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.seoTitle,
    description: opts.seoDescription,
    url: `${opts.baseUrl}/${urlPath}/`,
    datePublished: opts.publishedAt,
    dateModified: opts.updatedAt,
    ...(absoluteImageUrl ? { image: absoluteImageUrl } : {}),
    author: {
      "@type": "Person",
      "@id": authorPageUrl,
      name: AUTHOR_NAME,
      url: authorPageUrl,
      image: AUTHOR_AVATAR_URL,
      jobTitle: PAGE_CONTENT[opts.language]?.authorRole ?? "Editor",
      worksFor: { "@type": "Organization", name: langConfig.blog_name },
    },
    publisher: {
      "@type": "Organization",
      name: langConfig.blog_name,
      ...(opts.blogConfig.logo_url
        ? { logo: { "@type": "ImageObject", url: opts.blogConfig.logo_url } }
        : {}),
    },
  });

  // Schema: BreadcrumbList JSON-LD
  const breadcrumbSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems
      .filter((item) => item.url)
      .map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        item: item.url,
      })),
  });

  // Merge article's original <head> content (stylesheets, fonts, etc.)
  // but strip tags that the blog shell already provides
  let preservedHead = opts.articleHeadHtml;
  // Remove title, meta tags we already define, and charset/viewport (avoid duplicates)
  preservedHead = preservedHead.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "");
  preservedHead = preservedHead.replace(
    /<meta[^>]+(name=["'](description|robots|viewport)["']|property=["']og:[^"']*["']|charset=)[^>]*>/gi,
    ""
  );

  // Format publish date
  const publishDate = new Date(opts.publishedAt);
  const dateFormatted = publishDate.toLocaleDateString(
    opts.language === "sv" ? "sv-SE" : opts.language === "da" ? "da-DK" : "nb-NO",
    { year: "numeric", month: "long", day: "numeric" }
  );
  const authorName = AUTHOR_NAME;
  const lastUpdatedLabel =
    opts.language === "sv" ? "Senast uppdaterad" :
    opts.language === "da" ? "Sidst opdateret" : "Sist oppdatert";
  const byPrefix = opts.language === "da" ? "Af" : "Av";

  // Build author byline HTML — injected into article after hero image.
  // The name links to the author bio page so the cosmetic byline becomes a
  // real entity reference Google can crawl.
  const authorBylineHtml = `
    <div class="blog-shell-byline">
      <a href="${esc(authorPageUrl)}"><img class="blog-shell-avatar" src="${AUTHOR_AVATAR_URL}" alt="${authorName}"></a>
      <div>
        <a class="blog-shell-byline-name" href="${esc(authorPageUrl)}">${byPrefix} ${esc(authorName)}</a>
        <span class="blog-shell-byline-date">${lastUpdatedLabel} ${dateFormatted}</span>
      </div>
    </div>`;

  // Inject author byline after hero image (or after H1 if no hero)
  let articleHtml = opts.articleBodyHtml;
  const heroMatch = articleHtml.match(/<img\s+class="hero-img"[^>]*>/i);
  if (heroMatch) {
    const insertPos = heroMatch.index! + heroMatch[0].length;
    articleHtml = articleHtml.slice(0, insertPos) + authorBylineHtml + articleHtml.slice(insertPos);
  } else {
    const h1End = articleHtml.indexOf("</h1>");
    if (h1End !== -1) {
      const insertPos = h1End + "</h1>".length;
      articleHtml = articleHtml.slice(0, insertPos) + authorBylineHtml + articleHtml.slice(insertPos);
    }
  }

  return `<!DOCTYPE html>
<html lang="${opts.language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer-when-downgrade">
  <title>${opts.seoTitle.includes(langConfig.blog_name) ? esc(opts.seoTitle) : `${esc(opts.seoTitle)} | ${esc(langConfig.blog_name)}`}</title>
  <meta name="description" content="${esc(opts.seoDescription)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(opts.seoTitle)}">
  <meta property="og:description" content="${esc(opts.seoDescription)}">
  <meta property="og:url" content="${esc(opts.baseUrl)}/${esc(urlPath)}/">
  ${ogImage}
  <meta name="twitter:card" content="${absoluteImageUrl ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${esc(opts.seoTitle)}">
  <meta name="twitter:description" content="${esc(opts.seoDescription)}">
  ${absoluteImageUrl ? `<meta name="twitter:image" content="${esc(absoluteImageUrl)}">` : ""}
  <link rel="canonical" href="${esc(opts.baseUrl)}/${esc(urlPath)}/">
  ${buildHreflangTags(opts.slug, categorySlug, opts.language, opts.baseUrl)}
  <link rel="alternate" type="application/rss+xml" title="${esc(langConfig.blog_name)}" href="${esc(opts.baseUrl)}/rss.xml">
  <script type="application/ld+json">${articleSchema}</script>
  <script type="application/ld+json">${breadcrumbSchema}</script>${faqSchema ? `\n  <script type="application/ld+json">${faqSchema}</script>` : ""}
  ${preservedHead}
  <style>${BLOG_SHELL_CSS(color)}</style>
</head>
<body>
  <header class="blog-shell-header">
    <div class="blog-shell-container">
      <a href="${esc(opts.baseUrl)}/" class="blog-shell-logo">
        <svg class="blog-shell-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 1c1 2 2 4.5 2 8 0 5.5-4.78 11-10 11Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
        ${esc(langConfig.blog_name)}
      </a>
      <nav class="blog-shell-nav">
        <a href="${esc(opts.baseUrl)}/">${esc(langConfig.nav_home_label)}</a>
      </nav>
    </div>
  </header>

  <main class="blog-shell-main">
    <div class="blog-shell-container">
      <nav class="blog-shell-breadcrumbs" aria-label="Breadcrumb">
        ${breadcrumbHtml}
      </nav>

      <article class="blog-shell-article">
        ${articleHtml}
      </article>

      ${relatedHtml}
    </div>
  </main>

  <footer class="blog-shell-footer">
    <div class="blog-shell-container">
      <p class="blog-shell-about">${esc(langConfig.about_text)}</p>
      ${renderFooterNav(opts.language, opts.baseUrl)}
      <p class="blog-shell-disclosure">${esc(langConfig.affiliate_disclosure)}</p>
      <p class="blog-shell-copyright">${esc(langConfig.copyright_text)}</p>
    </div>
  </footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Generate blog homepage
// ---------------------------------------------------------------------------

export function generateBlogHomepage(opts: HomepageOptions): string {
  const langConfig =
    opts.blogConfig.languages[opts.language] ??
    getDefaultBlogConfig().languages[opts.language] ??
    getDefaultBlogConfig().languages.sv;

  const color = opts.blogConfig.primary_color || "#16a34a";

  const articleCards = opts.articles
    .map(
      (a) => `<a href="${esc(opts.baseUrl)}/${esc(getArticlePath(a.slug, a.categorySlug))}" class="blog-shell-card">
        ${a.featuredImageUrl ? `<img src="${esc(a.featuredImageUrl)}" alt="${esc(a.title)}" loading="lazy">` : `<div class="blog-shell-card-placeholder"></div>`}
        <div class="blog-shell-card-body">
          ${a.category ? `<span class="blog-shell-card-cat">${esc(a.category)}</span>` : ""}
          <h2>${esc(a.title)}</h2>
          ${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ""}
        </div>
      </a>`
    )
    .join("\n      ");

  const emptyState =
    opts.articles.length === 0
      ? `<p style="text-align:center;color:#6b7280;padding:3rem 0;">${opts.language === "sv" ? "Inga artiklar publicerade ännu." : opts.language === "da" ? "Ingen artikler publiceret endnu." : "Ingen artikler publisert ennå."}</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="${opts.language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer-when-downgrade">
  <title>${esc(langConfig.blog_name)} - ${esc(langConfig.blog_tagline)}</title>
  <meta name="description" content="${esc(langConfig.about_text.slice(0, 160))}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(langConfig.blog_name)}">
  <meta property="og:description" content="${esc(langConfig.about_text.slice(0, 160))}">
  <link rel="canonical" href="${esc(opts.baseUrl)}/">
  <link rel="alternate" type="application/rss+xml" title="${esc(langConfig.blog_name)}" href="${esc(opts.baseUrl)}/rss.xml">
  <style>${BLOG_SHELL_CSS(color)}${HOMEPAGE_EXTRA_CSS}</style>
</head>
<body>
  <header class="blog-shell-header">
    <div class="blog-shell-container">
      <a href="${esc(opts.baseUrl)}/" class="blog-shell-logo">
        <svg class="blog-shell-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 1c1 2 2 4.5 2 8 0 5.5-4.78 11-10 11Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
        ${esc(langConfig.blog_name)}
      </a>
    </div>
  </header>

  <main class="blog-shell-main">
    <div class="blog-shell-container">
      <h1 class="blog-shell-home-title">${esc(langConfig.blog_name)}</h1>
      <div class="blog-shell-home-grid">
        ${articleCards}
      </div>
      ${emptyState}
    </div>
  </main>

  <footer class="blog-shell-footer">
    <div class="blog-shell-container">
      <p class="blog-shell-about">${esc(langConfig.about_text)}</p>
      ${renderFooterNav(opts.language, opts.baseUrl)}
      <p class="blog-shell-copyright">${esc(langConfig.copyright_text)}</p>
    </div>
  </footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Category index page
// ---------------------------------------------------------------------------

interface CategoryPageOptions {
  categoryName: string;
  categorySlug: string;
  articles: BlogArticleSummary[];
  language: Language;
  blogConfig: BlogConfig;
  baseUrl: string;
}

export function generateCategoryPage(opts: CategoryPageOptions): string {
  const langConfig =
    opts.blogConfig.languages[opts.language] ??
    getDefaultBlogConfig().languages[opts.language] ??
    getDefaultBlogConfig().languages.sv;

  const color = opts.blogConfig.primary_color || "#16a34a";

  const articleCards = opts.articles
    .map(
      (a) => `<a href="${esc(opts.baseUrl)}/${esc(getArticlePath(a.slug, a.categorySlug))}" class="blog-shell-card">
        ${a.featuredImageUrl ? `<img src="${esc(a.featuredImageUrl)}" alt="${esc(a.title)}" loading="lazy">` : `<div class="blog-shell-card-placeholder"></div>`}
        <div class="blog-shell-card-body">
          <h2>${esc(a.title)}</h2>
          ${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ""}
        </div>
      </a>`
    )
    .join("\n      ");

  const breadcrumbHtml = `<a href="${esc(opts.baseUrl)}/">${esc(langConfig.nav_home_label)}</a> <span class="blog-shell-sep">/</span> <span>${esc(opts.categoryName)}</span>`;

  return `<!DOCTYPE html>
<html lang="${opts.language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(opts.categoryName)} | ${esc(langConfig.blog_name)}</title>
  <meta name="description" content="${esc(opts.categoryName)} — ${esc(langConfig.blog_tagline)}">
  <link rel="canonical" href="${esc(opts.baseUrl)}/${esc(opts.categorySlug)}/">
  <style>${BLOG_SHELL_CSS(color)}${HOMEPAGE_EXTRA_CSS}</style>
</head>
<body>
  <header class="blog-shell-header">
    <div class="blog-shell-container">
      <a href="${esc(opts.baseUrl)}/" class="blog-shell-logo">
        <svg class="blog-shell-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 1c1 2 2 4.5 2 8 0 5.5-4.78 11-10 11Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
        ${esc(langConfig.blog_name)}
      </a>
    </div>
  </header>

  <main class="blog-shell-main">
    <div class="blog-shell-container">
      <nav class="blog-shell-breadcrumbs" aria-label="Breadcrumb">
        ${breadcrumbHtml}
      </nav>
      <h1 class="blog-shell-home-title">${esc(opts.categoryName)}</h1>
      <div class="blog-shell-home-grid">
        ${articleCards}
      </div>
    </div>
  </main>

  <footer class="blog-shell-footer">
    <div class="blog-shell-container">
      <p class="blog-shell-about">${esc(langConfig.about_text)}</p>
      ${renderFooterNav(opts.language, opts.baseUrl)}
      <p class="blog-shell-copyright">${esc(langConfig.copyright_text)}</p>
    </div>
  </footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Author bio + About page (E-E-A-T signals)
// ---------------------------------------------------------------------------

interface StaticPageOptions {
  language: Language;
  blogConfig: BlogConfig;
  baseUrl: string;
}

function renderStaticPage(
  opts: StaticPageOptions,
  pageTitle: string,
  pagePath: string,
  bodyHtml: string,
  jsonLd: string
): string {
  const langConfig =
    opts.blogConfig.languages[opts.language] ??
    getDefaultBlogConfig().languages[opts.language] ??
    getDefaultBlogConfig().languages.sv;
  const color = opts.blogConfig.primary_color || "#16a34a";
  const pageUrl = `${opts.baseUrl}/${pagePath}/`;

  return `<!DOCTYPE html>
<html lang="${opts.language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer-when-downgrade">
  <title>${esc(pageTitle)} | ${esc(langConfig.blog_name)}</title>
  <meta name="description" content="${esc(pageTitle)} - ${esc(langConfig.blog_name)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:url" content="${esc(pageUrl)}">
  <link rel="canonical" href="${esc(pageUrl)}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>${BLOG_SHELL_CSS(color)}${HOMEPAGE_EXTRA_CSS}${STATIC_PAGE_CSS}</style>
</head>
<body>
  <header class="blog-shell-header">
    <div class="blog-shell-container">
      <a href="${esc(opts.baseUrl)}/" class="blog-shell-logo">
        <svg class="blog-shell-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 1c1 2 2 4.5 2 8 0 5.5-4.78 11-10 11Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
        ${esc(langConfig.blog_name)}
      </a>
    </div>
  </header>

  <main class="blog-shell-main">
    <div class="blog-shell-container">
      <article class="blog-shell-static">
        ${bodyHtml}
      </article>
    </div>
  </main>

  <footer class="blog-shell-footer">
    <div class="blog-shell-container">
      <p class="blog-shell-about">${esc(langConfig.about_text)}</p>
      ${renderFooterNav(opts.language, opts.baseUrl)}
      <p class="blog-shell-copyright">${esc(langConfig.copyright_text)}</p>
    </div>
  </footer>
</body>
</html>`;
}

export function generateAboutPage(opts: StaticPageOptions): string {
  const c = PAGE_CONTENT[opts.language];
  if (!c || c.aboutBody.length === 0) return "";
  const langConfig =
    opts.blogConfig.languages[opts.language] ??
    getDefaultBlogConfig().languages[opts.language] ??
    getDefaultBlogConfig().languages.sv;
  const aboutUrl = `${opts.baseUrl}/${c.aboutPath}/`;
  const orgJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": aboutUrl,
    name: langConfig.blog_name,
    url: opts.baseUrl,
    parentOrganization: { "@type": "Organization", name: "Swedish Balance AB" },
    ...(opts.blogConfig.logo_url
      ? { logo: { "@type": "ImageObject", url: opts.blogConfig.logo_url } }
      : {}),
  });
  const bodyHtml = `
    <h1>${esc(c.aboutTitle)}</h1>
    ${c.aboutBody.map((p) => `<p>${esc(p)}</p>`).join("\n    ")}
  `;
  return renderStaticPage(opts, c.aboutTitle, c.aboutPath, bodyHtml, orgJsonLd);
}

export function generateAuthorPage(opts: StaticPageOptions): string {
  const c = PAGE_CONTENT[opts.language];
  if (!c || c.authorBio.length === 0) return "";
  const langConfig =
    opts.blogConfig.languages[opts.language] ??
    getDefaultBlogConfig().languages[opts.language] ??
    getDefaultBlogConfig().languages.sv;
  const authorUrl = `${opts.baseUrl}/${c.authorPath}/`;
  const personJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": authorUrl,
    name: AUTHOR_NAME,
    url: authorUrl,
    image: AUTHOR_AVATAR_URL,
    jobTitle: c.authorRole,
    description: c.authorBio[0],
    worksFor: { "@type": "Organization", name: langConfig.blog_name },
  });
  const bodyHtml = `
    <div class="blog-shell-author-hero">
      <img class="blog-shell-author-avatar" src="${AUTHOR_AVATAR_URL}" alt="${AUTHOR_NAME}">
      <div>
        <h1>${esc(AUTHOR_NAME)}</h1>
        <p class="blog-shell-author-role">${esc(c.authorRole)}</p>
      </div>
    </div>
    ${c.authorBio.map((p) => `<p>${esc(p)}</p>`).join("\n    ")}
  `;
  return renderStaticPage(opts, c.authorTitle, c.authorPath, bodyHtml, personJsonLd);
}

const STATIC_PAGE_CSS = `
.blog-shell-static{max-width:680px;margin:32px auto;padding:0 4px}
.blog-shell-static h1{font-size:1.9rem;line-height:1.25;margin:0 0 24px}
.blog-shell-static p{margin:0 0 18px;color:#374151}
.blog-shell-author-hero{display:flex;gap:18px;align-items:center;margin:0 0 24px}
.blog-shell-author-avatar{width:84px;height:84px;border-radius:50%;object-fit:cover;flex-shrink:0}
.blog-shell-author-hero h1{margin:0;font-size:1.6rem}
.blog-shell-author-role{margin:4px 0 0;color:#6b7280;font-size:.95rem}
@media(max-width:600px){.blog-shell-static h1{font-size:1.5rem}}
`;

// ---------------------------------------------------------------------------
// RSS feed
// ---------------------------------------------------------------------------

interface RssFeedOptions {
  articles: BlogArticleSummary[];
  language: Language;
  blogConfig: BlogConfig;
  baseUrl: string;
}

export function generateRssFeed(opts: RssFeedOptions): string {
  const langConfig =
    opts.blogConfig.languages[opts.language] ??
    getDefaultBlogConfig().languages[opts.language] ??
    getDefaultBlogConfig().languages.sv;

  const langLabel =
    opts.language === "sv" ? "sv-SE" : opts.language === "da" ? "da-DK" : "nb-NO";

  const items = opts.articles
    .slice(0, 50)
    .map((a) => {
      const pubDate = a.publishedAt
        ? new Date(a.publishedAt).toUTCString()
        : new Date().toUTCString();
      const link = `${opts.baseUrl}/${getArticlePath(a.slug, a.categorySlug)}`;
      return `    <item>
      <title>${escXml(a.title)}</title>
      <link>${escXml(link)}</link>
      <guid isPermaLink="true">${escXml(link)}</guid>
      <description>${escXml(a.excerpt)}</description>
      <pubDate>${pubDate}</pubDate>${a.category ? `\n      <category>${escXml(a.category)}</category>` : ""}${a.featuredImageUrl ? `\n      <enclosure url="${escXml(a.featuredImageUrl)}" type="image/jpeg" length="0"/>` : ""}
    </item>`;
    })
    .join("\n");

  const lastBuildDate = opts.articles[0]?.publishedAt
    ? new Date(opts.articles[0].publishedAt).toUTCString()
    : new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escXml(langConfig.blog_name)}</title>
    <link>${escXml(opts.baseUrl)}/</link>
    <description>${escXml(langConfig.about_text)}</description>
    <language>${langLabel}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escXml(opts.baseUrl)}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

function BLOG_SHELL_CSS(primaryColor: string): string {
  return `
*,*::before,*::after{box-sizing:border-box}
html,body{overflow-x:hidden;max-width:100vw}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#1f2937;line-height:1.6;background:#fff}
.blog-shell-container{max-width:800px;margin:0 auto;padding:0 20px}
.blog-shell-header{background:${primaryColor};border-bottom:none;padding:14px 0;position:sticky;top:0;z-index:100}
.blog-shell-header .blog-shell-container{display:flex;align-items:center;justify-content:space-between}
.blog-shell-logo{color:#ffffff;text-decoration:none;font-size:1.2rem;font-weight:700;display:flex;align-items:center;gap:8px}
.blog-shell-logo:hover{opacity:.85}
.blog-shell-logo-icon{width:22px;height:22px;color:#ffffff}
.blog-shell-nav{display:flex;gap:20px;font-size:.9rem}
.blog-shell-nav a{color:rgba(255,255,255,0.85);text-decoration:none;font-weight:500}
.blog-shell-nav a:hover{color:#ffffff}
.blog-shell-breadcrumbs{padding:16px 0 0;font-size:.85rem;color:#6b7280}
.blog-shell-breadcrumbs a{color:${primaryColor};text-decoration:none}
.blog-shell-breadcrumbs a:hover{text-decoration:underline}
.blog-shell-sep{margin:0 6px;color:#d1d5db}
.blog-shell-byline{display:flex;align-items:center;gap:12px;padding:8px 0 12px}
.blog-shell-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0}
.blog-shell-byline-name{display:block;font-weight:600;color:#374151;font-size:.9rem;text-decoration:none}
.blog-shell-byline-name:hover{color:${primaryColor}}
.blog-shell-byline > a{flex-shrink:0}
.blog-shell-byline-date{display:block;font-size:.8rem;color:#9ca3af;margin-top:2px}
.blog-shell-main{padding:0 0 40px}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:20px 0;max-width:100%;display:block}
.table-wrap table{min-width:400px;width:100%}
.table-wrap th,.table-wrap td{white-space:nowrap;padding:8px 12px}
.table-wrap td:first-child,.table-wrap th:first-child{white-space:normal}
.blog-shell-article{padding:4px 0 32px}
.blog-shell-related{border-top:1px solid #e5e7eb;padding:32px 0 0}
.blog-shell-related h2{font-size:1.25rem;margin:0 0 16px}
.blog-shell-related-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.blog-shell-card{display:block;text-decoration:none;color:inherit;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;transition:box-shadow .15s}
.blog-shell-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.1)}
.blog-shell-card img{width:100%;height:160px;object-fit:cover;display:block}
.blog-shell-card h3,.blog-shell-card h2{font-size:.95rem;margin:12px 12px 4px;line-height:1.3}
.blog-shell-card p{font-size:.8rem;color:#6b7280;margin:0 12px 12px;line-height:1.4}
.blog-shell-footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:32px 0;font-size:.85rem;color:#6b7280}
.blog-shell-footer-nav{margin:8px 0;font-size:.85rem}
.blog-shell-footer-nav a{color:${primaryColor};text-decoration:none}
.blog-shell-footer-nav a:hover{text-decoration:underline}
.blog-shell-about{margin:0 0 12px}
.blog-shell-disclosure{margin:0 0 12px;font-size:.8rem;color:#9ca3af;font-style:italic}
.blog-shell-copyright{margin:0;color:#9ca3af}
@media(max-width:640px){
  .blog-shell-container{padding:0 12px}
  .blog-shell-breadcrumbs{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:10px 0 0;font-size:.78rem}
  .blog-shell-byline{padding:6px 0 8px;gap:10px}
  .blog-shell-avatar{width:40px;height:40px}
  .blog-shell-byline-name{font-size:.82rem}
  .blog-shell-byline-date{font-size:.75rem}
  .blog-shell-article{padding:4px 0 24px}
  .table-wrap table{min-width:0}
  .table-wrap th,.table-wrap td{white-space:normal;padding:6px 8px;font-size:.85rem}
  .table-wrap th:not(:first-child):not(:last-child),.table-wrap td:not(:first-child):not(:last-child){display:none}
  .blog-shell-related-grid{grid-template-columns:1fr}
  .blog-shell-footer{padding:24px 0}
}
`;
}

const HOMEPAGE_EXTRA_CSS = `
.blog-shell-home-title{font-size:1.75rem;margin:32px 0 24px;text-align:center}
.blog-shell-home-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.blog-shell-card-body{padding:12px}
.blog-shell-card-cat{font-size:.75rem;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}
.blog-shell-card-placeholder{height:160px;background:#f3f4f6}
@media(max-width:640px){.blog-shell-home-grid{grid-template-columns:1fr}}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract FAQ items from article HTML.
 * Looks for .faq-item elements with h3 (question) + p (answer).
 */
function extractFaqItems(html: string): { question: string; answer: string }[] {
  const $ = cheerio.load(html);
  const items: { question: string; answer: string }[] = [];

  $(".faq-item").each((_, el) => {
    const question = $(el).find("h3").first().text().trim();
    const answer = $(el).find("p").first().text().trim();
    if (question && answer) {
      items.push({ question, answer });
    }
  });

  return items;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
