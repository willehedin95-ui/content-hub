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

  // Walk paragraphs and list items only. All matching happens on TEXT NODES
  // (never on raw inner HTML) — the old regex-on-HTML approach could match a
  // brand name inside an attribute value (e.g. alt="...Tempur...") and inject
  // an <a> tag INSIDE the attribute, corrupting the markup.
  const elements = $("p, li").toArray();

  const brandRegex = (brandName: string): RegExp => {
    const escapedBrand = brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\d])(${escapedBrand})(?![\\p{L}\\d])`, "iu");
  };

  type TextNode = { type: string; data?: string };

  /** Find the first text node (in document order, within p/li) matching the regex. */
  const findFirstTextMatch = (
    re: RegExp
  ): { node: TextNode; index: number; text: string; matchText: string } | null => {
    for (const el of elements) {
      const $el = $(el);
      // Whole element inside an existing link — never inject here
      if ($el.parents("a").length > 0) continue;

      let found: { node: TextNode; index: number; text: string; matchText: string } | null = null;
      $el.contents().each(function walkNode() {
        if (found) return false;
        const node = this as unknown as TextNode;
        if (node.type !== "text") {
          // Descend into inline children (strong/em/span) but never into <a>
          const childEl = this as unknown as { name?: string };
          if (childEl.name?.toLowerCase() === "a") return;
          $(this).contents().each(walkNode);
          return;
        }
        const text = node.data ?? "";
        const m = text.match(re);
        if (!m || m.index === undefined) return;
        if ($(this).parents("a").length > 0) return;
        found = { node, index: m.index, text, matchText: m[0] };
      });
      if (found) return found;
    }
    return null;
  };

  // Phase 1 (sync): decide WHICH brands get linked, in document order —
  // preserves the old first-paragraph-wins semantics under the max cap.
  const selected: JoinedBrand[] = [];
  const locallySeen = new Set<string>();
  outer: for (const el of elements) {
    const $el = $(el);
    if ($el.parents("a").length > 0) continue;
    const elText = $el.text();
    for (const b of brands) {
      const key = b.brandName.toLowerCase();
      if (locallySeen.has(key)) continue;
      if (!brandRegex(b.brandName).test(elText)) continue;
      locallySeen.add(key);
      selected.push(b);
      if (selected.length >= brands.length) break outer;
    }
  }

  // Phase 2 (async): resolve deep links and wrap the first text-node match.
  for (const b of selected) {
    if (totalInjected >= max) break;
    const brandKey = b.brandName.toLowerCase();
    if (injectedBrands.has(brandKey)) continue;

    // Resolve deep link (cache or live API call)
    const link = await resolveAffiliateLink(b.brandName);
    if (!link) continue;

    // Fresh lookup at wrap time — earlier replacements may have re-split
    // text nodes, so stored node references would be stale.
    const hit = findFirstTextMatch(brandRegex(b.brandName));
    if (!hit) continue;

    const before = hit.text.slice(0, hit.index);
    const after = hit.text.slice(hit.index + hit.matchText.length);
    const tag = `<a href="${escAttr(link.url)}" target="_blank" rel="sponsored noopener" data-affiliate-network="${escAttr(link.network)}">${escText(hit.matchText)}</a>`;
    $(hit.node as never).replaceWith(`${escText(before)}${tag}${escText(after)}`);

    injectedBrands.add(brandKey);
    matched.push({ brand: b.brandName, network: link.network });
    totalInjected++;

    // Cache generated link if not already cached
    if (!b.cachedTemplate) {
      const { error: cacheErr } = await db
        .from("affiliate_programs")
        .update({ deep_link_template: link.url, updated_at: new Date().toISOString() })
        .eq("network", link.network)
        .eq("advertiser_id", link.advertiserId);
      if (cacheErr) {
        console.warn("[affiliate] deep_link_template cache update failed:", cacheErr.message);
      }
    }
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

/** Entity-escape plain text that gets re-parsed as HTML via replaceWith */
function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
