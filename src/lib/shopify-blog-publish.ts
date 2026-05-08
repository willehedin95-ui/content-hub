/**
 * Publishes a blog article to a workspace's Shopify store (replaces the
 * Cloudflare Pages flow in blog-autopilot for workspaces with
 * `blog_publish_target: "shopify"`).
 *
 * Input: full-document article HTML (same shape blog-autopilot hands to the
 * CF Pages publisher). We extract the <body>, strip duplicates that Shopify's
 * theme renders itself (H1, hero image), inject scoped CSS that overrides
 * the theme's small-rem font sizes + serif default, rewrite cross-article
 * links to /blogs/{handle}/{slug}, and upload each inline image to Shopify
 * Files API (pre-compressed via sharp). Finally we upsertArticle on Shopify.
 */

import * as cheerio from "cheerio";
import type { Language } from "@/types";
import { createServerSupabase } from "./supabase-admin";
import { getShopifyCredsForWorkspace } from "./shopify";
import {
  findBlogByHandle,
  upsertArticle,
  uploadImageFromUrl,
} from "./shopify-blog";

// ---------------------------------------------------------------------------
// Workspace settings shape (subset that's relevant here)
// ---------------------------------------------------------------------------

export interface ShopifyBlogSettings {
  blog_publish_target?: "cf_pages" | "shopify";
  shopify_blog_handle?: string;
  shopify_blog_author?: string;
}

// ---------------------------------------------------------------------------
// Scoped article CSS — mirrors fix-shopify-styling.ts SCOPED_CSS. Stays
// colocated with the publish logic so new articles get the same styling
// contract as the migrated ones. If you change this, update the migration
// script too (or vice versa) — they must stay in sync.
// ---------------------------------------------------------------------------

const SCOPED_CSS = `<style>
.hydro-article { max-width: 760px; margin: 0 auto; padding: 12px 16px 40px; color: #1f2937; line-height: 1.7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important; font-size: 17px; }
.hydro-article * { font-family: inherit !important; }
.hydro-article h1 { font-size: 34px !important; line-height: 1.2 !important; margin: 0 0 16px !important; font-weight: 700 !important; color: #0f172a !important; }
.hydro-article h2 { font-size: 26px !important; line-height: 1.3 !important; margin: 48px 0 14px !important; color: #111827 !important; font-weight: 700 !important; }
.hydro-article h3 { font-size: 20px !important; line-height: 1.4 !important; margin: 32px 0 10px !important; color: #111827 !important; font-weight: 600 !important; }
.hydro-article h4 { font-size: 18px !important; line-height: 1.4 !important; margin: 24px 0 8px !important; font-weight: 600 !important; }
.hydro-article p { margin: 0 0 16px !important; font-size: 17px !important; line-height: 1.7 !important; }
.hydro-article ul, .hydro-article ol { font-size: 17px !important; line-height: 1.7 !important; padding-left: 22px !important; margin: 0 0 16px !important; }
.hydro-article li { margin-bottom: 6px !important; }
.hydro-article a { color: #0369a1 !important; text-decoration: underline !important; }
.hydro-article img { max-width: 100% !important; height: auto !important; border-radius: 8px !important; }
.hydro-article .section-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 8px; margin: 28px 0; }
.hydro-article .product-img { display: block; max-width: 400px; margin: 32px auto 8px; border-radius: 12px; }
.hydro-article .intro { font-size: 19px !important; color: #374151 !important; margin: 0 0 28px !important; line-height: 1.6 !important; }
.hydro-article .tldr { background: #f0f9ff; border-left: 4px solid #0284c7; padding: 18px 22px; border-radius: 0 10px 10px 0; margin: 0 0 32px; }
.hydro-article .tldr strong { display: block; margin-bottom: 8px; color: #0369a1 !important; font-size: 16px !important; text-transform: uppercase; letter-spacing: 0.05em; }
.hydro-article .tldr ul { margin: 0 !important; padding-left: 20px !important; }
.hydro-article .tldr li { margin-bottom: 6px !important; }
.hydro-article .product-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin: 0 0 24px; background: #fff; }
.hydro-article .product-card h3 { margin: 0 0 10px !important; }
.hydro-article .product-card .verdict { font-weight: 600; color: #059669; }
.hydro-article .pros-cons { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0 20px; }
.hydro-article .pros-cons ul { margin: 0 !important; padding-left: 20px !important; }
.hydro-article .pros h4 { color: #059669 !important; margin: 0 0 8px !important; font-size: 16px !important; }
.hydro-article .cons h4 { color: #dc2626 !important; margin: 0 0 8px !important; font-size: 16px !important; }
.hydro-article .cta-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; text-align: center; margin: 40px 0; }
.hydro-article .cta-box a { display: inline-block; background: #059669 !important; color: #fff !important; padding: 14px 32px; border-radius: 8px; text-decoration: none !important; font-weight: 600 !important; font-size: 17px !important; }
.hydro-article .info-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 22px; border-radius: 0 8px 8px 0; margin: 28px 0; }
.hydro-article .faq-item { margin: 0 0 24px; }
.hydro-article .faq-item h3 { margin: 0 0 8px !important; font-size: 19px !important; }
.hydro-article .faq-item p { margin: 0 !important; color: #4b5563; }
.hydro-article .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 28px 0; max-width: 100%; display: block; }
.hydro-article table { width: 100%; border-collapse: collapse; font-size: 16px !important; min-width: 400px; }
.hydro-article th, .hydro-article td { text-align: left !important; padding: 12px 14px !important; border-bottom: 1px solid #e5e7eb !important; }
.hydro-article th { background: #f9fafb !important; font-weight: 600 !important; }
.hydro-article .timeline { border-left: 3px solid #e5e7eb; padding-left: 24px; margin: 28px 0; }
.hydro-article .timeline-entry { position: relative; margin: 0 0 32px; }
.hydro-article .timeline-entry::before { content: ""; position: absolute; left: -30px; top: 6px; width: 14px; height: 14px; border-radius: 50%; background: #059669; border: 2px solid #fff; box-shadow: 0 0 0 2px #059669; }
.hydro-article .timeline-entry h3 { margin: 0 0 8px !important; color: #059669 !important; }
.hydro-article .before-after { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 28px 0; }
.hydro-article .before-after .label { font-weight: 600 !important; text-align: center; margin-bottom: 8px; font-size: 13px !important; text-transform: uppercase; letter-spacing: 0.05em; }
.hydro-article .before-after .before .label { color: #9ca3af !important; }
.hydro-article .before-after .after .label { color: #059669 !important; }
/* Hide theme's blog-post-image placeholder block (some themes - notably
 * Horizon - render a placeholder web component instead of binding to
 * article.image automatically). Safe across themes: only matches blocks
 * that contain a placeholder-image element. */
.image-block:has(placeholder-image),
.shopify-block:has(placeholder-image) { display: none !important; }
@media(max-width: 640px) {
  .hydro-article { padding: 8px 14px 32px; font-size: 16px; }
  .hydro-article h1 { font-size: 26px !important; margin: 0 0 10px !important; }
  .hydro-article h2 { font-size: 22px !important; margin: 36px 0 12px !important; }
  .hydro-article h3 { font-size: 18px !important; margin: 24px 0 8px !important; }
  .hydro-article p, .hydro-article ul, .hydro-article ol { font-size: 16px !important; }
  .hydro-article .intro { font-size: 17px !important; }
  .hydro-article .pros-cons { grid-template-columns: 1fr; }
  .hydro-article .before-after { grid-template-columns: 1fr; }
  .hydro-article table { font-size: 14px !important; }
}
</style>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripToBody(fullHtml: string): { bodyInner: string; heroImage: string | null } {
  const $ = cheerio.load(fullHtml);
  $(
    [
      "script[data-cc-ga4]",
      "script[data-cc-clarity]",
      "script[data-cc-fbpixel]",
      "script[data-cc-chpixel]",
      "script[data-cc-utm]",
      "script[data-cc-optout]",
      "script[data-cc-countdown]",
      "script[src*='googletagmanager']",
      "script[src*='clarity.ms']",
      "script[src*='facebook.net']",
      "div[data-cc-custom]",
      "head style",
      "head link",
    ].join(", ")
  ).remove();

  const heroSrc = $("body").find("img").first().attr("src") || null;
  return { bodyInner: $("body").html() || "", heroImage: heroSrc };
}

function rewriteInternalLinks(
  html: string,
  blogHandle: string,
  knownSlugs: Set<string>,
  blogDomain: string
): string {
  const $ = cheerio.load(`<div id="r">${html}</div>`);
  $("a[href]").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") || "";

    // Relative URLs to our old blog structure: /category/slug
    const relMatch = href.match(/^\/[a-z0-9-]+\/([a-z0-9-]+)\/?$/i);
    if (relMatch && knownSlugs.has(relMatch[1])) {
      $a.attr("href", `/blogs/${blogHandle}/${relMatch[1]}`);
      return;
    }

    // Absolute URLs to halsobladet (or other CF Pages blog domain)
    const absMatch = href.match(
      new RegExp(`https?://${blogDomain.replace(/\./g, "\\.")}/[^/]+/([a-z0-9-]+)/?$`, "i")
    );
    if (absMatch && knownSlugs.has(absMatch[1])) {
      $a.attr("href", `/blogs/${blogHandle}/${absMatch[1]}`);
    }
  });
  return $("#r").html() || html;
}

// ---------------------------------------------------------------------------
// Main publish entry point
// ---------------------------------------------------------------------------

export interface PublishToShopifyArgs {
  articleHtml: string;
  slug: string;
  category: string;
  seoTitle: string;
  seoDescription: string;
  language: Language;
  workspaceId: string;
  /** Blog domain the internal-link rewriter should strip (e.g. "halsobladet.com") */
  sourceBlogDomain: string;
  /** ISO datetime to use as article publish date (keeps URL/canonical stable) */
  createdAt: string;
  /** Slugs of other published articles on this target blog (for link rewriting) */
  knownSlugs?: string[];
}

export interface PublishToShopifyResult {
  url: string;
  articleId: number;
  created: boolean;
}

export async function publishToShopify(args: PublishToShopifyArgs): Promise<PublishToShopifyResult> {
  const db = createServerSupabase();

  // Resolve workspace settings
  const { data: workspace } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", args.workspaceId)
    .single();
  const settings = (workspace?.settings ?? {}) as Record<string, unknown>;
  const blogHandle =
    ((settings as ShopifyBlogSettings).shopify_blog_handle as string) || "news";
  const author = ((settings as ShopifyBlogSettings).shopify_blog_author as string) || "Renew";

  const creds = await getShopifyCredsForWorkspace(args.workspaceId);
  if (!creds) {
    throw new Error(`No Shopify credentials for workspace ${args.workspaceId}`);
  }
  const blog = await findBlogByHandle(creds, blogHandle);
  if (!blog) {
    throw new Error(`Shopify blog with handle "${blogHandle}" not found on ${creds.storefrontHost}`);
  }

  // 1. Extract body, strip head chrome + tracking scripts
  const { bodyInner, heroImage } = stripToBody(args.articleHtml);

  // 2. Upload inline images to Shopify CDN (pre-compressed WebP).
  //    Cache by source URL across the loop so the same image referenced
  //    twice doesn't double-upload.
  const $body = cheerio.load(`<div id="r">${bodyInner}</div>`);
  const imageSrcs = Array.from(new Set(
    $body("img").map((_, el) => $body(el).attr("src") || "").get().filter(Boolean)
  ));

  const imageCache = new Map<string, string>();
  for (const src of imageSrcs) {
    // Skip if already a Shopify CDN URL (re-publish case)
    if (src.includes("cdn.shopify.com")) {
      imageCache.set(src, src);
      continue;
    }
    const filename = src.split("/").pop()?.split("?")[0] || "image.webp";
    try {
      const cdnUrl = await uploadImageFromUrl(creds, src, filename);
      imageCache.set(src, cdnUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[shopify-publish] image upload failed for ${src}: ${msg}`);
      imageCache.set(src, src); // fall back to original URL
    }
  }

  // 3. Swap image src + set perf attributes
  let isFirstImage = true;
  $body("img").each((_, el) => {
    const $el = $body(el);
    const src = $el.attr("src") || "";
    const cdn = imageCache.get(src);
    if (cdn && cdn !== src) {
      // Append width param for Shopify CDN resize
      const cls = $el.attr("class") || "";
      const width = cls.includes("hero-img") ? 1600 : cls.includes("product-img") ? 800 : 1200;
      const sep = cdn.includes("?") ? "&" : "?";
      $el.attr("src", `${cdn}${sep}width=${width}`);
    }
    if (!$el.attr("decoding")) $el.attr("decoding", "async");
    if (isFirstImage) {
      if (!$el.attr("fetchpriority")) $el.attr("fetchpriority", "high");
      isFirstImage = false;
    } else {
      if (!$el.attr("loading")) $el.attr("loading", "lazy");
    }
  });

  let processed = $body("#r").html() || bodyInner;

  // 4. Rewrite internal links (category/slug paths -> /blogs/handle/slug)
  if (args.knownSlugs && args.knownSlugs.length > 0) {
    processed = rewriteInternalLinks(
      processed,
      blogHandle,
      new Set(args.knownSlugs),
      args.sourceBlogDomain
    );
  }

  // 5. Strip theme duplicates (first H1 + hero img class) and wrap in scoped container.
  // Note: Horizon-themed shops (e.g. doginwork.se) don't auto-bind article.image
  // to the blog-post-image block - they render a placeholder instead. For those
  // shops we KEEP the body hero img so it renders inline at the top. We hide
  // the theme's placeholder block via CSS rule in SCOPED_CSS above.
  const themeRendersHero = !creds.storefrontHost?.includes("doginwork.se");
  const $final = cheerio.load(`<div id="r">${processed}</div>`);
  $final("#r > div, #r").find("style").remove();
  $final("h1").first().remove();
  if (themeRendersHero) {
    $final("img.hero-img, img.featured-img").first().remove();
  }
  const finalInner = $final("#r").html() || processed;
  const bodyHtml = `${SCOPED_CSS}\n<div class="hydro-article">\n${finalInner}\n</div>`;

  // 6. Resolve hero image for the article card (the theme renders it full-bleed
  //    as article.image). Prefer the uploaded CDN URL for our own hero image.
  const heroForCard = heroImage ? (imageCache.get(heroImage) || heroImage) : undefined;

  // 7. Upsert article
  const { article, created } = await upsertArticle(creds, blog.id, {
    title: args.seoTitle,
    handle: args.slug,
    bodyHtml,
    summaryHtml: args.seoDescription,
    author,
    tags: [args.category, "kollagen"].filter(Boolean),
    imageSrc: heroForCard,
    publishedAt: args.createdAt,
    published: true,
  });

  const url = `https://${creds.storefrontHost}/blogs/${blogHandle}/${article.handle}`;
  console.log(
    `[shopify-publish] ${created ? "created" : "updated"} article ${article.id} at ${url}`
  );

  return { url, articleId: article.id, created };
}
