/**
 * Awin affiliate link injection for blog articles.
 *
 * Scans article HTML for competitor brand mentions and wraps them in
 * Awin-tracked affiliate links. Earns commission when readers click through
 * to competitor products (Awin = secondary revenue stream alongside our own
 * product sales).
 *
 * Configuration: per-workspace `awin_links` setting (JSONB map of
 * brand -> awin deep link). Empty = no-op. Brand match is case-insensitive
 * word boundary so "Oslo Skin Lab" matches but "oslobutiken" doesn't.
 *
 * Link attributes follow Google + Awin guidance:
 * - rel="sponsored noopener" (sponsored signals paid placement, prevents
 *   PageRank flow, opener-safe)
 * - target="_blank" (don't lose the reader)
 * - data-awin-brand for analytics
 *
 * Anti-spam rules:
 * - Max 3 affiliate links per article (Awin clusters look spammy to Google)
 * - Skips matches already inside <a> tags
 * - Skips matches inside headings (H1-H6) and titles
 * - First match per brand only (don't wrap every mention)
 */

import * as cheerio from "cheerio";

export interface AwinLinkConfig {
  /** Map of brand name (case-insensitive) -> Awin deep link URL */
  links: Record<string, string>;
  /** Max affiliate links to inject per article. Default 3. */
  maxPerArticle?: number;
}

export interface AwinInjectResult {
  html: string;
  injected: number;
  brands: string[];
}

const DEFAULT_MAX = 3;

/**
 * Wrap first occurrence of each configured brand name in an Awin affiliate
 * link. Returns updated HTML + count + which brands matched.
 */
export function injectAwinLinks(html: string, config: AwinLinkConfig): AwinInjectResult {
  const brands = Object.keys(config.links);
  if (brands.length === 0 || !html) {
    return { html, injected: 0, brands: [] };
  }

  const $ = cheerio.load(html, null, false);
  const maxPerArticle = config.maxPerArticle ?? DEFAULT_MAX;
  const injectedBrands = new Set<string>();
  let totalInjected = 0;

  // Build case-insensitive regex per brand with word boundaries.
  // Longer brand names checked first to avoid "Lab" eating "Oslo Skin Lab".
  const sortedBrands = brands.slice().sort((a, b) => b.length - a.length);

  // Walk only paragraphs and list items - skip headings, links, code, etc.
  $("p, li").each((_, el) => {
    if (totalInjected >= maxPerArticle) return false;
    if (injectedBrands.size === brands.length) return false;

    const $el = $(el);
    // Skip if inside an existing link (paragraph contains <a> wrapping content)
    if ($el.parents("a").length > 0) return;

    const html = $el.html();
    if (!html) return;

    let updated = html;
    let elementChanged = false;

    for (const brand of sortedBrands) {
      if (totalInjected >= maxPerArticle) break;
      if (injectedBrands.has(brand)) continue;

      // Escape regex special chars in brand name
      const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Word boundary using lookahead/lookbehind to support Unicode (Swedish chars)
      const re = new RegExp(`(?<![\\p{L}\\d])(${escapedBrand})(?![\\p{L}\\d])`, "iu");

      const match = updated.match(re);
      if (!match || match.index === undefined) continue;

      // Skip if match is inside an existing <a> tag in the HTML string
      const before = updated.slice(0, match.index);
      const openAnchors = (before.match(/<a\b[^>]*>/gi) ?? []).length;
      const closeAnchors = (before.match(/<\/a>/gi) ?? []).length;
      if (openAnchors > closeAnchors) continue;

      const url = config.links[brand];
      if (!url) continue;

      // Build affiliate link tag
      const replacement = `<a href="${escapeAttr(url)}" target="_blank" rel="sponsored noopener" data-awin-brand="${escapeAttr(brand)}">${match[1]}</a>`;
      updated = updated.slice(0, match.index) + replacement + updated.slice(match.index + match[0].length);

      injectedBrands.add(brand);
      totalInjected++;
      elementChanged = true;
    }

    if (elementChanged) {
      $el.html(updated);
    }
  });

  return {
    html: $.html(),
    injected: totalInjected,
    brands: Array.from(injectedBrands),
  };
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Load Awin config from workspace settings. Returns null if not configured.
 *
 * Expected settings shape:
 *   awin_links: { "Oslo Skin Lab": "https://www.awin1.com/cread.php?...", ... }
 *   awin_max_per_article: 3 (optional)
 */
export function loadAwinConfig(
  settings: Record<string, unknown> | null | undefined
): AwinLinkConfig | null {
  if (!settings) return null;
  const links = settings.awin_links as Record<string, string> | undefined;
  if (!links || typeof links !== "object" || Object.keys(links).length === 0) {
    return null;
  }
  // Sanity-filter: only entries with non-empty URLs
  const cleanLinks: Record<string, string> = {};
  for (const [brand, url] of Object.entries(links)) {
    if (typeof url === "string" && url.startsWith("http") && brand.trim().length > 0) {
      cleanLinks[brand.trim()] = url;
    }
  }
  if (Object.keys(cleanLinks).length === 0) return null;
  const maxPerArticle = typeof settings.awin_max_per_article === "number"
    ? (settings.awin_max_per_article as number)
    : undefined;
  return { links: cleanLinks, maxPerArticle };
}
