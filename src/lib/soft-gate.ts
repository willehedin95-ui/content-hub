/**
 * Soft quality gate for autopilot-generated articles.
 *
 * Runs a fast set of static checks on the HTML a writer just produced. If
 * everything passes we auto-publish like before; if anything fails the
 * article lands in `pending_review` instead and the operator gets a
 * Telegram alert listing the specific failures.
 *
 * Design principle: each check targets a concrete failure mode we've
 * actually seen in published articles (missing citations, hallucinated
 * URLs, banned phrases leaking through, thin content). Cheap filter —
 * we're not asking Claude to judge itself, just running regex + string
 * checks + small lookups.
 */

import * as cheerio from "cheerio";
import { BANNED_PHRASES, BANNED_WORDS } from "./blog-writer";

export interface GateContext {
  /** Full article HTML returned by the writer (before Shopify wrapping). */
  html: string;
  /** Article metadata */
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  /** Verified PubMed study URLs passed to the writer (empty if citations disabled). */
  verifiedCitationUrls?: string[];
  /** Whether the workspace requires research citations. */
  requireResearchCitations: boolean;
  /** Known slugs on the target blog — used to flag unresolvable internal links. */
  knownSlugs: string[];
  /** Allow-listed external domains the writer may link to. */
  allowedExternalDomains: string[];
}

export interface GateResult {
  pass: boolean;
  reasons: string[];
  /** Non-blocking notes (informational, not gate failures) */
  warnings: string[];
}

const MIN_WORD_COUNT = 2500;
const MAX_WORD_COUNT = 6500;
const MIN_RESEARCH_CITATIONS = 3;
const MIN_META_DESC_LEN = 80;
const MAX_META_DESC_LEN = 170;
const MIN_H2_COUNT = 4;
const MIN_INTERNAL_LINKS = 2;

export function runSoftGate(ctx: GateContext): GateResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const $ = cheerio.load(ctx.html);

  // 1. Word count in body
  const textBody = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = textBody.split(" ").filter(Boolean).length;
  if (wordCount < MIN_WORD_COUNT) {
    reasons.push(`thin_content:${wordCount}<${MIN_WORD_COUNT}`);
  } else if (wordCount > MAX_WORD_COUNT) {
    warnings.push(`word_count_high:${wordCount}>${MAX_WORD_COUNT}`);
  }

  // 2. Title sanity
  if (!ctx.seoTitle || ctx.seoTitle.trim().length < 10) {
    reasons.push("title_missing_or_short");
  } else if (ctx.seoTitle.length > 120) {
    warnings.push(`title_too_long:${ctx.seoTitle.length}`);
  } else if (/\b(undefined|null|placeholder|lorem|xxx|todo)\b/i.test(ctx.seoTitle)) {
    reasons.push(`title_contains_placeholder:"${ctx.seoTitle}"`);
  }

  // 3. Meta description
  const desc = ctx.seoDescription ?? "";
  if (desc.length < MIN_META_DESC_LEN) {
    reasons.push(`meta_desc_too_short:${desc.length}<${MIN_META_DESC_LEN}`);
  } else if (desc.length > MAX_META_DESC_LEN) {
    warnings.push(`meta_desc_too_long:${desc.length}>${MAX_META_DESC_LEN}`);
  }

  // 4. Structure: enough H2s for a long-form article
  const h2Count = $("h2").length;
  if (h2Count < MIN_H2_COUNT) {
    reasons.push(`too_few_h2:${h2Count}<${MIN_H2_COUNT}`);
  }

  // 5. Research citations (only if workspace requires them)
  if (ctx.requireResearchCitations && ctx.verifiedCitationUrls?.length) {
    const verifiedSet = new Set(ctx.verifiedCitationUrls);
    const citedCount = Array.from(verifiedSet).filter((url) => ctx.html.includes(url)).length;
    if (citedCount < MIN_RESEARCH_CITATIONS) {
      reasons.push(`too_few_citations:${citedCount}<${MIN_RESEARCH_CITATIONS}`);
    }
    // Flag PubMed URLs that are NOT in the verified list — likely hallucinated
    const allPubmedLinks = Array.from(
      ctx.html.matchAll(/https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?/g)
    ).map((m) => m[0].replace(/\/+$/, "/"));
    const hallucinated = allPubmedLinks.filter((u) => {
      const normalized = u.endsWith("/") ? u : u + "/";
      return !Array.from(verifiedSet).some((v) => v.replace(/\/+$/, "/") === normalized);
    });
    if (hallucinated.length > 0) {
      reasons.push(`hallucinated_pubmed_urls:${hallucinated.slice(0, 3).join(",")}`);
    }
  }

  // 6. Internal links: at least a couple should point to other articles on
  //    our own blog (the internal-link injector usually handles this, so
  //    0 is a sign something broke).
  const ownLinks = $("a[href]")
    .map((_, el) => $(el).attr("href") || "")
    .get()
    .filter((h) => {
      if (!h) return false;
      // Match relative /blogs/kollagen/... or absolute same-domain links
      if (h.startsWith("/blogs/") || h.includes("get-renew.com/blogs/")) return true;
      if (h.includes("halsobladet.com/") && h.split("/").filter(Boolean).length >= 2) return true;
      return false;
    });
  if (ownLinks.length < MIN_INTERNAL_LINKS) {
    reasons.push(`too_few_internal_links:${ownLinks.length}<${MIN_INTERNAL_LINKS}`);
  }

  // 7. External links must be to allow-listed domains
  const allExternals = $("a[href^='http']")
    .map((_, el) => $(el).attr("href") || "")
    .get()
    .filter((h) => {
      // Strip our own domains
      if (h.includes("get-renew.com") || h.includes("halsobladet.com")) return false;
      if (h.includes("swedishbalance.se") || h.includes("smarthelse.dk")) return false;
      if (h.includes("helseguiden.com")) return false;
      if (h.includes("doginwork.se")) return false; // doginwork blog + quiz subdomain
      return true;
    });
  const unknownDomains = new Set<string>();
  const allowedDomains = new Set(ctx.allowedExternalDomains);
  // Research domains always allowed
  allowedDomains.add("pubmed.ncbi.nlm.nih.gov");
  allowedDomains.add("ncbi.nlm.nih.gov");
  allowedDomains.add("pmc.ncbi.nlm.nih.gov");
  allowedDomains.add("doi.org");
  for (const href of allExternals) {
    try {
      const hostname = new URL(href).hostname.replace(/^www\./, "");
      if (!allowedDomains.has(hostname)) {
        // Check suffix match (e.g. allow "cochranelibrary.com" for "www.cochranelibrary.com")
        const matched = Array.from(allowedDomains).some((d) => hostname.endsWith(d));
        if (!matched) unknownDomains.add(hostname);
      }
    } catch {
      // Malformed URL is suspicious — flag it
      unknownDomains.add(href.slice(0, 40));
    }
  }
  if (unknownDomains.size > 0) {
    reasons.push(`unknown_external_domains:${Array.from(unknownDomains).slice(0, 5).join(",")}`);
  }

  // 8. Banned phrases leaked through anti-slop
  const stripped = textBody.toLowerCase();
  const bannedPhraseHits = BANNED_PHRASES.filter((p) => stripped.includes(p));
  if (bannedPhraseHits.length > 0) {
    reasons.push(`banned_phrases:${bannedPhraseHits.slice(0, 3).join(",")}`);
  }
  // Post-processed single words should have been replaced already. If they
  // still appear it means the sub pipeline didn't run for some reason.
  const bannedWordHits = BANNED_WORDS.filter((w) =>
    new RegExp(`\\b${w}\\b`, "i").test(stripped)
  );
  if (bannedWordHits.length > 0) {
    warnings.push(`banned_words_present:${bannedWordHits.slice(0, 3).join(",")}`);
  }

  // 9. Internal link URLs must resolve to known slugs
  const unresolvedSlugs = new Set<string>();
  const knownSlugSet = new Set(ctx.knownSlugs);
  for (const href of ownLinks) {
    // Match /blogs/<blog>/<slug> or /<category>/<slug> path and pull the slug
    const match = href.match(/\/(?:blogs\/[^/]+\/|[^/]+\/)([a-z0-9-]+)\/?(?:\?|#|$)/);
    if (match) {
      const slug = match[1];
      if (slug !== ctx.slug && !knownSlugSet.has(slug)) {
        unresolvedSlugs.add(slug);
      }
    }
  }
  if (unresolvedSlugs.size > 0) {
    warnings.push(`unresolved_internal_slugs:${Array.from(unresolvedSlugs).slice(0, 3).join(",")}`);
  }

  return {
    pass: reasons.length === 0,
    reasons,
    warnings,
  };
}
