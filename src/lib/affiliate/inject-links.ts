/**
 * Multi-network affiliate link injection for blog articles.
 *
 * Replaces the older awin-only awin-links.ts:
 *  - Pulls brand list from affiliate_programs table (joined status)
 *  - Generates deep links via network API (Awin Publisher API or Adtraction)
 *  - Caches generated link in deep_link_template column so we don't regen
 *    every publish (links are stable once created)
 *  - Picks best network if same brand exists on multiple (highest commission)
 *
 * Anti-spam rules carried over:
 *  - Max 3 affiliate links per article
 *  - Skips matches inside existing <a> tags
 *  - First-match-per-brand only
 *  - Walks <p> and <li> only (skips headings, code, etc.)
 *
 * Output tag attributes:
 *  - rel="sponsored noopener" (Google compliance)
 *  - target="_blank"
 *  - data-affiliate-network for analytics
 */

import * as cheerio from "cheerio";
import { createServerSupabase } from "../supabase-admin";
import { resolveAffiliateLink } from "./sync";

export interface InjectResult {
  html: string;
  injected: number;
  brands: Array<{ brand: string; network: string }>;
}

interface JoinedBrand {
  brandName: string;
  network: string;
  advertiserId: string;
  defaultLanding: string | null;
  cachedTemplate: string | null;
  commission: number | null;
}

const DEFAULT_MAX = 3;

/**
 * Inject affiliate links on competitor brand mentions in article HTML.
 * Reads joined brands from affiliate_programs, resolves deep links via
 * network APIs (or cached templates), wraps first matches in anchors.
 */
export async function injectAffiliateLinks(
  html: string,
  opts?: { maxPerArticle?: number; clickRef?: string }
): Promise<InjectResult> {
  if (!html) return { html, injected: 0, brands: [] };
  const max = opts?.maxPerArticle ?? DEFAULT_MAX;
  const db = createServerSupabase();

  // Pull all joined brands. Order by commission rate so highest-paying brand
  // wins when same brand appears across multiple networks.
  const { data } = await db
    .from("affiliate_programs")
    .select("brand_name, network, advertiser_id, default_landing_url, deep_link_template, commission_rate")
    .eq("status", "joined")
    .order("commission_rate", { ascending: false, nullsFirst: false });

  if (!data || data.length === 0) {
    return { html, injected: 0, brands: [] };
  }

  // Dedupe brand_name (case-insensitive) - keep first (highest commission)
  const byBrand = new Map<string, JoinedBrand>();
  for (const r of data) {
    const key = (r.brand_name as string).toLowerCase().trim();
    if (byBrand.has(key)) continue;
    byBrand.set(key, {
      brandName: r.brand_name as string,
      network: r.network as string,
      advertiserId: r.advertiser_id as string,
      defaultLanding: r.default_landing_url as string | null,
      cachedTemplate: r.deep_link_template as string | null,
      commission: r.commission_rate as number | null,
    });
  }

  const brands = Array.from(byBrand.values()).sort((a, b) => b.brandName.length - a.brandName.length);

  const $ = cheerio.load(html, null, false);
  const injectedBrands = new Set<string>();
  const matched: Array<{ brand: string; network: string }> = [];
  let totalInjected = 0;

  // Walk paragraphs and list items only
  const elements = $("p, li").toArray();
  for (const el of elements) {
    if (totalInjected >= max) break;
    if (injectedBrands.size === brands.length) break;

    const $el = $(el);
    if ($el.parents("a").length > 0) continue;

    const initialHtml = $el.html();
    if (!initialHtml) continue;
    let elementHtml: string = initialHtml;

    let changed = false;

    for (const b of brands) {
      if (totalInjected >= max) break;
      const brandKey = b.brandName.toLowerCase();
      if (injectedBrands.has(brandKey)) continue;

      const escapedBrand = b.brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<![\\p{L}\\d])(${escapedBrand})(?![\\p{L}\\d])`, "iu");
      const match: RegExpMatchArray | null = elementHtml.match(re);
      if (!match || match.index === undefined) continue;

      // Skip if inside existing <a>
      const before: string = elementHtml.slice(0, match.index);
      const opens = (before.match(/<a\b[^>]*>/gi) ?? []).length;
      const closes = (before.match(/<\/a>/gi) ?? []).length;
      if (opens > closes) continue;

      // Resolve deep link (cache or live API call)
      const link = await resolveAffiliateLink(b.brandName);
      if (!link) continue;

      const tag: string = `<a href="${escAttr(link.url)}" target="_blank" rel="sponsored noopener" data-affiliate-network="${escAttr(link.network)}">${match[1]}</a>`;
      const updated: string = elementHtml.slice(0, match.index) + tag + elementHtml.slice(match.index + match[0].length);
      elementHtml = updated;

      injectedBrands.add(brandKey);
      matched.push({ brand: b.brandName, network: link.network });
      totalInjected++;
      changed = true;

      // Cache generated link if not already cached
      if (!b.cachedTemplate) {
        await db
          .from("affiliate_programs")
          .update({ deep_link_template: link.url, updated_at: new Date().toISOString() })
          .eq("network", link.network)
          .eq("advertiser_id", link.advertiserId);
      }
    }

    if (changed) $el.html(elementHtml);
  }

  return {
    html: $.html(),
    injected: totalInjected,
    brands: matched,
  };
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
