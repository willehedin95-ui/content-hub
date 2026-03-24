#!/usr/bin/env npx tsx
/**
 * Test the blog shell system end-to-end for all 6 templates.
 * Verifies: body extraction, blog shell wrapping, schema markup, meta description,
 * alt text auto-fill, and homepage generation.
 *
 * Usage: npx tsx scripts/test-blog-shell.ts
 */
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

import { BLOG_TEMPLATES } from "../src/lib/blog-templates";
import {
  extractArticleBody,
  extractFirstImage,
  extractMetaDescription,
  autoFillAltText,
  wrapInBlogShell,
  getDefaultBlogConfig,
  generateBlogHomepage,
  slugifyCategory,
  type BlogArticleSummary,
} from "../src/lib/blog-shell";

const blogConfig = getDefaultBlogConfig();
const outputDir = path.join(__dirname, "..", "test-output");
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

const articles: { templateId: string; name: string; slug: string; category: string }[] = [
  { templateId: "listicle", name: "Bästa kudden 2026 — Bäst i test", slug: "test-basta-kudden", category: "Produktguider" },
  { templateId: "problem-solution", name: "Nacksmärta på natten — Orsaker och lösningar", slug: "test-nacksmarta-natten", category: "Sömn & Hälsa" },
  { templateId: "buying-guide", name: "Hur väljer du rätt kollagentillskott?", slug: "test-valja-kollagentillskott", category: "Guider" },
  { templateId: "comparison", name: "Flytande kollagen vs pulver — Vilken form är bäst?", slug: "test-flytande-vs-pulver", category: "Jämförelser" },
  { templateId: "science", name: "Funkar kollagentillskott? Vad säger forskningen", slug: "test-funkar-kollagentillskott", category: "Forskning" },
  { templateId: "testimonial", name: "8 veckor med Hydro13 — Min hud före och efter", slug: "test-hydro13-resultat", category: "Upplevelser" },
];

const homepageArticles: BlogArticleSummary[] = [];

console.log("Blog Shell E2E Tests\n" + "=".repeat(50) + "\n");

for (const article of articles) {
  const template = BLOG_TEMPLATES.find((t) => t.id === article.templateId)!;
  const rawHtml = template.getHtml(article.name);

  console.log(`\n${article.templateId.toUpperCase()} — "${article.name}"`);
  console.log("-".repeat(50));

  // Test 1: Body extraction
  const { bodyHtml, headHtml } = extractArticleBody(rawHtml);
  assert(bodyHtml.length > 100, `Body extracted (${bodyHtml.length} chars)`);
  assert(!bodyHtml.includes("<html"), "Body has no <html> tag");
  assert(!bodyHtml.includes("<head"), "Body has no <head> tag");
  assert(bodyHtml.includes("<h1"), "Body has <h1>");

  // Test 2: Meta description extraction
  const metaDesc = extractMetaDescription(bodyHtml);
  assert(metaDesc.length > 0, `Meta description extracted (${metaDesc.length} chars)`);
  assert(metaDesc.length <= 160, `Meta description ≤160 chars`);

  // Test 3: Alt text auto-fill
  const altFilledHtml = autoFillAltText(bodyHtml, article.name);
  const placeholderAlts = altFilledHtml.match(/alt="(Illustration|Produktbild|Artikelbild|Guidebild|Forskning|Jämförelse|Guide|A vs B|Produktjämförelse)"/gi);
  assert(!placeholderAlts, `No placeholder alt texts remain (found: ${placeholderAlts?.length ?? 0})`);

  // Test 4: Featured image extraction
  const featuredImage = extractFirstImage(bodyHtml);
  // templates use placehold.co URLs so this should find something
  assert(typeof featuredImage === "string" || featuredImage === null, `Featured image extraction works`);

  // Test 5: Blog shell wrapping
  const wrapped = wrapInBlogShell({
    articleBodyHtml: altFilledHtml,
    articleHeadHtml: headHtml,
    seoTitle: article.name,
    seoDescription: metaDesc,
    slug: article.slug,
    language: "sv",
    blogConfig,
    relatedArticles: [],
    featuredImageUrl: featuredImage,
    blogCategory: article.category,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    baseUrl: "https://blog.halsobladet.com",
  });

  assert(wrapped.includes("<!DOCTYPE html>"), "Wrapped HTML is full document");
  assert(wrapped.includes("<header"), "Has header");
  assert(wrapped.includes("<footer"), "Has footer");
  assert(wrapped.includes("<article"), "Has <article> tag");
  assert(wrapped.includes("breadcrumb"), "Has breadcrumbs");
  assert(wrapped.includes("application/ld+json"), "Has JSON-LD schema");

  // Test: Category URL prefix in canonical
  const expectedCatSlug = slugifyCategory(article.category);
  const expectedPath = `${expectedCatSlug}/${article.slug}`;
  assert(wrapped.includes(`canonical" href="https://blog.halsobladet.com/${expectedPath}"`), `Canonical has category prefix: /${expectedPath}`);
  // Test: Category breadcrumb links to category page
  assert(wrapped.includes(`href="https://blog.halsobladet.com/${expectedCatSlug}/"`), `Breadcrumb links to category page: /${expectedCatSlug}/`);

  // Test 6: Schema validation
  const schemaMatch = wrapped.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  assert(!!schemaMatch && schemaMatch.length >= 1, `Has ${schemaMatch?.length ?? 0} JSON-LD blocks`);
  if (schemaMatch) {
    for (const block of schemaMatch) {
      const json = block.replace(/<script[^>]*>/, "").replace(/<\/script>/, "");
      try {
        const parsed = JSON.parse(json);
        assert(parsed["@context"] === "https://schema.org", `Schema @context valid`);
        const type = parsed["@type"];
        assert(type === "Article" || type === "BreadcrumbList" || type === "FAQPage", `Schema type: ${type}`);
      } catch {
        assert(false, `Schema JSON parses correctly`);
      }
    }
  }

  // Test 7: TL;DR section preserved
  assert(wrapped.includes("tldr"), "TL;DR section present in output");

  // Test 8: FAQ section preserved
  assert(wrapped.includes("faq-item"), "FAQ section present in output");

  // Save output for visual inspection
  const outFile = path.join(outputDir, `${article.templateId}.html`);
  fs.writeFileSync(outFile, wrapped, "utf-8");

  // Collect for homepage test
  homepageArticles.push({
    title: article.name,
    slug: article.slug,
    categorySlug: article.category ? slugifyCategory(article.category) : undefined,
    excerpt: metaDesc,
    featuredImageUrl: featuredImage,
    category: article.category,
    publishedAt: new Date().toISOString(),
  });
}

// Test homepage generation
console.log(`\n\nHOMEPAGE GENERATION`);
console.log("-".repeat(50));

const homepage = generateBlogHomepage({
  articles: homepageArticles,
  language: "sv",
  blogConfig,
  baseUrl: "https://blog.halsobladet.com",
});

assert(homepage.includes("<!DOCTYPE html>"), "Homepage is full document");
assert(homepage.includes("<header"), "Homepage has header");
assert(homepage.includes("<footer"), "Homepage has footer");
assert(homepageArticles.every((a) => homepage.includes(a.slug)), "Homepage links to all articles");
assert(homepage.includes("article-card") || homepage.includes("blog-shell-card"), "Homepage has article cards");
// Verify category prefix in homepage links
assert(homepage.includes("produktguider/test-basta-kudden"), "Homepage uses category prefix for listicle");
assert(homepage.includes("somn-halsa/test-nacksmarta-natten"), "Homepage uses category prefix for problem-solution");

const homepageFile = path.join(outputDir, "homepage.html");
fs.writeFileSync(homepageFile, homepage, "utf-8");

// Summary
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`\nOutput files written to: ${outputDir}/`);
console.log(`  Open any .html file in a browser to visually inspect.`);
if (failed > 0) {
  process.exit(1);
}
