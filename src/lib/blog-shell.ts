import * as cheerio from "cheerio";
import type { Language } from "@/types";

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
    primary_color: "#1a365d",
    languages: {
      sv: {
        blog_name: "Hälsobladet",
        blog_tagline: "Oberoende hälsorådgivning",
        about_text:
          "Hälsobladet är en oberoende hälsosajt som testar och jämför produkter för bättre sömn och hälsa. Vi köper alla produkter själva och delar ärliga omdömen.",
        affiliate_disclosure:
          "Denna artikel innehåller annonslänkar. Vi kan få ersättning om du köper via våra länkar, utan extra kostnad för dig.",
        nav_home_label: "Hem",
        copyright_text: `© ${new Date().getFullYear()} Hälsobladet. Alla rättigheter förbehållna.`,
      },
      da: {
        blog_name: "SmartHelse",
        blog_tagline: "Uafhængig sundhedsrådgivning",
        about_text:
          "SmartHelse er en uafhængig sundhedsside, der tester og sammenligner produkter til bedre søvn og sundhed. Vi køber alle produkter selv og deler ærlige anmeldelser.",
        affiliate_disclosure:
          "Denne artikel indeholder annoncelinks. Vi kan modtage kompensation, hvis du køber via vores links, uden ekstra omkostninger for dig.",
        nav_home_label: "Hjem",
        copyright_text: `© ${new Date().getFullYear()} SmartHelse. Alle rettigheder forbeholdes.`,
      },
      no: {
        blog_name: "Helseguiden",
        blog_tagline: "Uavhengig helserådgivning",
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

  return $.html();
}

// ---------------------------------------------------------------------------
// Wrap article body in blog shell
// ---------------------------------------------------------------------------

export function wrapInBlogShell(opts: WrapOptions): string {
  const langConfig =
    opts.blogConfig.languages[opts.language] ??
    getDefaultBlogConfig().languages[opts.language] ??
    getDefaultBlogConfig().languages.sv;

  const color = opts.blogConfig.primary_color || "#1a365d";
  const categorySlug = opts.blogCategory ? slugifyCategory(opts.blogCategory) : undefined;
  const urlPath = getArticlePath(opts.slug, categorySlug);
  const ogImage = opts.featuredImageUrl
    ? `<meta property="og:image" content="${esc(opts.featuredImageUrl)}">`
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

  // Schema: Article JSON-LD
  const articleSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.seoTitle,
    description: opts.seoDescription,
    url: `${opts.baseUrl}/${urlPath}`,
    datePublished: opts.publishedAt,
    dateModified: opts.updatedAt,
    ...(opts.featuredImageUrl ? { image: opts.featuredImageUrl } : {}),
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
  // but strip title/meta tags since we set our own
  let preservedHead = opts.articleHeadHtml;
  // Remove title and meta description/og from original head (we define our own)
  preservedHead = preservedHead.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "");
  preservedHead = preservedHead.replace(
    /<meta[^>]+(name=["'](description|robots)["']|property=["']og:[^"']*["'])[^>]*>/gi,
    ""
  );

  return `<!DOCTYPE html>
<html lang="${opts.language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${opts.seoTitle.includes(langConfig.blog_name) ? esc(opts.seoTitle) : `${esc(opts.seoTitle)} | ${esc(langConfig.blog_name)}`}</title>
  <meta name="description" content="${esc(opts.seoDescription)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(opts.seoTitle)}">
  <meta property="og:description" content="${esc(opts.seoDescription)}">
  <meta property="og:url" content="${esc(opts.baseUrl)}/${esc(urlPath)}">
  ${ogImage}
  <meta name="twitter:card" content="${opts.featuredImageUrl ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${esc(opts.seoTitle)}">
  <meta name="twitter:description" content="${esc(opts.seoDescription)}">
  ${opts.featuredImageUrl ? `<meta name="twitter:image" content="${esc(opts.featuredImageUrl)}">` : ""}
  <link rel="canonical" href="${esc(opts.baseUrl)}/${esc(urlPath)}">
  <link rel="alternate" type="application/rss+xml" title="${esc(langConfig.blog_name)}" href="${esc(opts.baseUrl)}/rss.xml">
  <script type="application/ld+json">${articleSchema}</script>
  <script type="application/ld+json">${breadcrumbSchema}</script>${faqSchema ? `\n  <script type="application/ld+json">${faqSchema}</script>` : ""}
  ${preservedHead}
  <style>${BLOG_SHELL_CSS(color)}</style>
</head>
<body>
  <header class="blog-shell-header">
    <div class="blog-shell-container">
      <a href="${esc(opts.baseUrl)}/" class="blog-shell-logo">${esc(langConfig.blog_name)}</a>
      <span class="blog-shell-tagline">${esc(langConfig.blog_tagline)}</span>
    </div>
  </header>

  <div class="blog-shell-disclosure">
    <div class="blog-shell-container">
      ${esc(langConfig.affiliate_disclosure)}
    </div>
  </div>

  <main class="blog-shell-main">
    <div class="blog-shell-container">
      <nav class="blog-shell-breadcrumbs" aria-label="Breadcrumb">
        ${breadcrumbHtml}
      </nav>

      <article class="blog-shell-article">
        ${opts.articleBodyHtml}
      </article>

      ${relatedHtml}
    </div>
  </main>

  <footer class="blog-shell-footer">
    <div class="blog-shell-container">
      <p class="blog-shell-about">${esc(langConfig.about_text)}</p>
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

  const color = opts.blogConfig.primary_color || "#1a365d";

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
  <title>${esc(langConfig.blog_name)} — ${esc(langConfig.blog_tagline)}</title>
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
      <a href="${esc(opts.baseUrl)}/" class="blog-shell-logo">${esc(langConfig.blog_name)}</a>
      <span class="blog-shell-tagline">${esc(langConfig.blog_tagline)}</span>
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

  const color = opts.blogConfig.primary_color || "#1a365d";

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
      <a href="${esc(opts.baseUrl)}/" class="blog-shell-logo">${esc(langConfig.blog_name)}</a>
      <span class="blog-shell-tagline">${esc(langConfig.blog_tagline)}</span>
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
      <p class="blog-shell-copyright">${esc(langConfig.copyright_text)}</p>
    </div>
  </footer>
</body>
</html>`;
}

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
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#1f2937;line-height:1.6;background:#fff}
.blog-shell-container{max-width:800px;margin:0 auto;padding:0 20px}
.blog-shell-header{background:${primaryColor};color:#fff;padding:16px 0}
.blog-shell-header .blog-shell-container{display:flex;align-items:center;gap:12px}
.blog-shell-logo{color:#fff;text-decoration:none;font-size:1.25rem;font-weight:700}
.blog-shell-logo:hover{opacity:.9}
.blog-shell-tagline{color:rgba(255,255,255,.75);font-size:.85rem}
.blog-shell-disclosure{background:#fef3c7;border-bottom:1px solid #fcd34d;padding:8px 0;font-size:.8rem;color:#92400e}
.blog-shell-breadcrumbs{padding:12px 0;font-size:.85rem;color:#6b7280}
.blog-shell-breadcrumbs a{color:${primaryColor};text-decoration:none}
.blog-shell-breadcrumbs a:hover{text-decoration:underline}
.blog-shell-sep{margin:0 6px;color:#d1d5db}
.blog-shell-main{padding:0 0 40px}
.blog-shell-article{padding:12px 0 32px}
.blog-shell-related{border-top:1px solid #e5e7eb;padding:32px 0 0}
.blog-shell-related h2{font-size:1.25rem;margin:0 0 16px}
.blog-shell-related-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.blog-shell-card{display:block;text-decoration:none;color:inherit;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;transition:box-shadow .15s}
.blog-shell-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.1)}
.blog-shell-card img{width:100%;height:160px;object-fit:cover;display:block}
.blog-shell-card h3,.blog-shell-card h2{font-size:.95rem;margin:12px 12px 4px;line-height:1.3}
.blog-shell-card p{font-size:.8rem;color:#6b7280;margin:0 12px 12px;line-height:1.4}
.blog-shell-footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:32px 0;font-size:.85rem;color:#6b7280}
.blog-shell-about{margin:0 0 8px}
.blog-shell-copyright{margin:0}
@media(max-width:640px){
  .blog-shell-related-grid{grid-template-columns:1fr}
  .blog-shell-header .blog-shell-container{flex-direction:column;align-items:flex-start;gap:4px}
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
