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
    max_tokens: 16000,
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

  return `You are a senior ${langName} health & wellness journalist writing for ${blogName} (https://${request.blogDomain}). You write thoroughly researched, honest editorial content that ranks well in Google.

## Your Identity
- You are the editorial team at ${blogName}, a small independent health review site
- First-person plural: "vi har testat", "vår bedömning", "vi rekommenderar"
- Your style: knowledgeable but conversational, like a helpful expert friend
- You have personally tested every product you review
- You buy all products yourself — no sponsorships

## Product Knowledge
${productContext}

## Internal Links
These are published articles on ${blogName}. Link to them where relevant using descriptive anchor text:
${internalLinks || "(No other articles published yet)"}

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
- IMPORTANT: Use real source URLs where possible. For Swedish health: 1177.se, ki.se, livsmedelsverket.se, internetmedicin.se
- At least 3 FAQ items in a .faq-item section at the bottom
- Include a TL;DR box (.tldr class) near the top
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
  return `Write the complete article based on this brief:

## Content Brief
${request.contentBrief}

## HTML Template (structural reference)
Follow this HTML structure exactly. Replace ALL placeholder text with real, researched content. Every product card, FAQ item, and section must have real content. Do not leave any placeholder or example text.

${templateHtml}

## Requirements
1. Output a complete HTML document matching the template structure
2. Replace ALL placeholder text — every heading, paragraph, product card, FAQ, and link
3. All product reviews must be specific and detailed (not generic filler)
4. Include at least 3 real source citations with URLs
5. FAQ section must have 3-5 real, useful questions and answers
6. TL;DR box must be specific (not vague summaries)
7. CTA links should point to relevant product pages
8. Word count target: ${request.wordCount}
9. Include 2 editorial image placeholders between major sections using this exact format:
   <img class="section-img" src="https://placehold.co/1200x675/e2e8f0/64748b?text=Section+Image" alt="[descriptive alt text matching section topic]">
   Place them after H2 sections where a visual break would help readability. Use descriptive alt text that describes what the image should show.

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
