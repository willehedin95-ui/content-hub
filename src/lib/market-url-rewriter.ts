import { createServerSupabase } from "./supabase-admin";
import { Language } from "@/types";

/**
 * Map translation language codes to market country codes used in `market_product_urls`.
 */
const LANGUAGE_TO_COUNTRY: Record<Language, string> = {
  sv: "SE",
  da: "DK",
  no: "NO",
};

/**
 * Rewrite Shopify product CTA URLs in a translated HTML document to point at
 * the correct market for the target language.
 *
 * Why: Translation prompts only translate text — they leave original URLs
 * untouched. When a Swedish landing page has hardcoded `swedishbalance.se`
 * CTAs and we translate it to Danish, Danes get sent to the SE store with
 * SEK prices and bounce. This function replaces every known market URL for
 * a product with the target market's URL.
 *
 * How it works:
 * 1. Look up all market URLs for this product + workspace from `market_product_urls`.
 * 2. Determine the target URL based on the target language.
 * 3. String-replace every "other market" URL with the target URL.
 *
 * Returns `{ html, replacements }`. If no product URLs exist, or no target
 * URL is configured, or target URL is a placeholder ("#" / ""), the HTML is
 * returned unchanged.
 */
export async function rewriteMarketUrls(
  html: string,
  productSlug: string | null | undefined,
  language: Language,
  workspaceId: string,
): Promise<{ html: string; replacements: number; targetUrl: string | null }> {
  if (!productSlug || !html) {
    return { html, replacements: 0, targetUrl: null };
  }

  const db = createServerSupabase();

  const { data: marketUrls, error } = await db
    .from("market_product_urls")
    .select("country, url")
    .eq("workspace_id", workspaceId)
    .eq("product", productSlug);

  if (error) {
    console.warn(`[market-url-rewriter] Failed to load URLs for ${productSlug}:`, error.message);
    return { html, replacements: 0, targetUrl: null };
  }

  if (!marketUrls || marketUrls.length === 0) {
    return { html, replacements: 0, targetUrl: null };
  }

  const targetCountry = LANGUAGE_TO_COUNTRY[language];
  const targetEntry = marketUrls.find((m) => m.country === targetCountry);
  const targetUrl = targetEntry?.url || null;

  // Skip if no target URL configured or it's a placeholder
  if (!targetUrl || targetUrl === "#" || targetUrl.trim() === "") {
    console.log(
      `[market-url-rewriter] No target URL for ${productSlug} ${targetCountry} — skipping rewrite`,
    );
    return { html, replacements: 0, targetUrl: null };
  }

  // Build list of OTHER market URLs to replace (not the target itself, not empty, not "#")
  const otherUrls = marketUrls
    .filter((m) => m.country !== targetCountry)
    .map((m) => m.url)
    .filter((u): u is string => !!u && u !== "#" && u.trim() !== "" && u !== targetUrl);

  // Deduplicate — some markets may share URLs
  const uniqueOthers = [...new Set(otherUrls)];

  let replacements = 0;
  let rewrittenHtml = html;

  // Sort by length descending so longer URLs replace before shorter substrings match
  // (e.g. `.se/no-no/pages/happysleep-no` must replace before `.se/products/happysleep`)
  uniqueOthers.sort((a, b) => b.length - a.length);

  for (const otherUrl of uniqueOthers) {
    // Escape regex special chars and do a global literal replace
    const escaped = otherUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = rewrittenHtml.match(new RegExp(escaped, "g"));
    if (matches && matches.length > 0) {
      rewrittenHtml = rewrittenHtml.split(otherUrl).join(targetUrl);
      replacements += matches.length;
    }
  }

  if (replacements > 0) {
    console.log(
      `[market-url-rewriter] ${productSlug} ${language} → ${targetCountry}: replaced ${replacements} URLs`,
    );
  }

  return { html: rewrittenHtml, replacements, targetUrl };
}
