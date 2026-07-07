/**
 * Internal linking for blog articles.
 * Injects contextual <a> links between published blog articles.
 *
 * Two modes:
 * 1. Forward: At write time, inject links to already-published articles
 *    (supplements what Claude adds via prompt — catches any it missed)
 * 2. Retroactive: After publishing a new article, update older articles
 *    to link to it (and fill any other missing cross-links)
 */

import * as cheerio from "cheerio";
import { createServerSupabase } from "./supabase-admin";
import { slugifyCategory, getArticlePath } from "./blog-shell";
import { getProjectCustomDomain, getProjectName, getWorkspaceIdForCfProject } from "./cloudflare-pages";
import type { Language } from "@/types";

// ---------------------------------------------------------------------------
// Primary keyword mapping (from CONTENT_PLAN in blog-autopilot.ts)
// Keep in sync when adding new articles to the content plan.
// For articles NOT in this map, keyword is extracted from the SEO title.
// ---------------------------------------------------------------------------

const SLUG_KEYWORDS: Record<string, string> = {
  // Swedish (SV)
  "basta-kudden": "bästa kudden",
  "kudde-for-sidosovare": "kudde för sidosovare",
  "nacksmarta-pa-natten": "nacksmärta på natten",
  "minnesskum-vs-latex-kudde": "minnesskum vs latex",
  "hur-ofta-byta-kudde": "byta kudde",
  "tvatta-kudde": "tvätta kudde",
  "somn-och-halsa": "sömn och hälsa",
  "sovstallningar": "sovställningar",
  "sluta-snarka": "sluta snarka",
  "ergonomisk-kudde-bast-i-test": "ergonomisk kudde",
  "kollagentillskott-guide": "kollagentillskott",
  "basta-kollagentillskottet": "bästa kollagentillskottet",
  "funkar-kollagentillskott": "funkar kollagen",
  "flytande-kollagen-vs-pulver": "flytande kollagen",
  "kollagen-for-hud-rynkor": "kollagen hud",
  "somn-och-hudhalsa": "skönhetssömn",
  "kollagen-for-har-naglar": "kollagen hår",
  "basta-kollagen-mot-rynkor": "kollagen mot rynkor",
  // Danish (DA)
  "bedste-nakkepude": "nakkepude",
  "hovedpude-bedst-i-test": "hovedpude bedst i test",
  "ergonomisk-hovedpude": "ergonomisk hovedpude",
  "stop-snorken": "stop snorken",
  "sovnloshed": "søvnløshed",
  "bedre-sovn": "bedre søvn",
  "memory-foam-pude": "memory foam pude",
  "vask-af-hovedpude": "vask af hovedpude",
  "sovestillinger": "sovestilling",
  "sovn-og-sundhed": "søvn og sundhed",
  "nakkesmerter-om-natten": "nakkesmerter",
  // Norwegian (NO)
  "beste-nakkepute": "nakkepute",
  "ergonomisk-pute": "ergonomisk pute",
  "snorking-behandling": "snorking",
  "pute-for-vond-nakke": "pute for vond nakke",
  "hodepute-best-i-test": "hodepute best i test",
  "pute-for-sidesovere": "pute for sidesovere",
  "sovnloshet": "søvnløshet",
  "sov-bedre": "sove bedre",
  "soveposisjoner": "soveposisjon",
  "sovn-og-helse": "søvn og helse",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkTarget {
  slug: string;
  title: string;
  keyword: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Core: inject internal links into article HTML
// ---------------------------------------------------------------------------

const MAX_LINKS = 5;

/**
 * Inject internal links into article body HTML.
 * Finds the first natural occurrence of each target's keyword in <p> or <li>
 * elements and wraps it in an <a> tag. Skips already-linked URLs.
 *
 * @param html Article body HTML (not wrapped in blog shell)
 * @param targets Articles to link to
 * @param ownSlug Current article's slug (to avoid self-links)
 */
export function injectInternalLinks(
  html: string,
  targets: LinkTarget[],
  ownSlug?: string
): { html: string; linksInjected: number } {
  if (!targets.length) return { html, linksInjected: 0 };

  const $ = cheerio.load(html);
  let linksInjected = 0;

  // Collect URLs already linked in the article
  const linkedUrls = new Set<string>();
  $("a[href]").each((_, el) => {
    linkedUrls.add($(el).attr("href") || "");
  });

  for (const target of targets) {
    if (linksInjected >= MAX_LINKS) break;
    if (target.slug === ownSlug) continue;
    if (linkedUrls.has(target.url)) continue;

    // Search terms ordered by match likelihood:
    //   1. Full primary keyword ("kollagen hyaluronsyra") — ideal but often no match
    //   2. Title's first segment ("Vad är kollagen") — mid-length phrase
    //   3. Distinguishing slug word ("hyaluronsyra", "klimakteriet", "haravfall")
    //      — pulled from the slug by removing generic stopwords like "kollagen",
    //      "kudde", "somn". This dramatically increases match rate since articles
    //      rarely use full multi-word keywords verbatim.
    const titleFirst = target.title
      .split(/\s*[—|:]\s*/)[0]
      ?.trim()
      .replace(/\s*\d{4}\s*$/, "")
      .trim();
    const distinguishing = extractDistinguishingTerm(target.slug, target.keyword);
    const terms: string[] = [target.keyword];
    if (titleFirst && titleFirst.toLowerCase() !== target.keyword.toLowerCase()) {
      terms.push(titleFirst);
    }
    if (distinguishing && !terms.some((t) => t.toLowerCase() === distinguishing.toLowerCase())) {
      terms.push(distinguishing);
    }

    let linked = false;

    for (const term of terms) {
      if (linked || !term || term.length < 3) continue;

      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");

      // Only search in paragraphs and list items (text-heavy, safe to modify)
      $("p, li").each(function () {
        if (linked) return false;

        const elem = $(this);
        // Skip if inside heading, existing link, or button
        if (elem.parents("a, h1, h2, h3, h4, h5, button").length > 0) return;

        // Walk through text nodes
        elem.contents().each(function () {
          if (linked) return false;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((this as any).type !== "text") return;

          const textNode = $(this);
          const text = textNode.text();
          const match = text.match(regex);
          if (!match || match.index === undefined) return;

          // Don't link inside an <a> ancestor
          if (textNode.parents("a").length > 0) return;

          const before = text.slice(0, match.index);
          const matched = match[0];
          const after = text.slice(match.index + matched.length);

          textNode.replaceWith(
            `${esc(before)}<a href="${target.url}">${esc(matched)}</a>${esc(after)}`
          );

          linked = true;
          linksInjected++;
          linkedUrls.add(target.url);
        });
      });
    }
  }

  return { html: $.html(), linksInjected };
}

/** Minimal HTML entity escaping for text nodes */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Extract a single distinguishing word from a slug, skipping generic topic
 * words that repeat across every article in a cluster.
 *
 * Example: "kollagen-hyaluronsyra" → "hyaluronsyra"
 *          "kollagen-klimakteriet" → "klimakteriet"
 *          "kollagen-for-haravfall" → "haravfall"
 *          "basta-kollagen-mot-rynkor" → "rynkor"
 *
 * Returns null if no distinguishing term can be found (e.g. "vad-ar-kollagen"
 * where every word is too generic).
 */
const GENERIC_TERMS = new Set([
  // Topic-cluster words that repeat everywhere
  "kollagen",
  "kollagentillskott",
  "kudde",
  "kuddar",
  "somn",
  "sömn",
  "pute",
  "hovedpude",
  "nakkepude",
  // Filler words
  "vad",
  "ar",
  "är",
  "hur",
  "for",
  "för",
  "mot",
  "och",
  "eller",
  "med",
  "av",
  "till",
  "pa",
  "på",
  "i",
  "en",
  "ett",
  "det",
  "den",
  "om",
  "ska",
  "man",
  "nar",
  "när",
  "basta",
  "bästa",
  "best",
  "bedste",
  "beste",
  "test",
  "guide",
  "the",
  "a",
  "an",
]);

function extractDistinguishingTerm(slug: string, keyword: string): string | null {
  // Tokenize slug AND keyword, pick the most distinguishing (longest non-generic) word
  const tokens = [
    ...slug.split(/[-_\s]+/),
    ...keyword.split(/[\s-]+/),
  ]
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean)
    .filter((t) => t.length >= 4)
    .filter((t) => !GENERIC_TERMS.has(t));

  if (tokens.length === 0) return null;

  // Pick longest unique token (most likely to be the distinguishing concept)
  const unique = Array.from(new Set(tokens));
  unique.sort((a, b) => b.length - a.length);
  return unique[0];
}

// ---------------------------------------------------------------------------
// Build link targets from published articles in the database
// ---------------------------------------------------------------------------

/**
 * Query all published blog articles and build LinkTarget array.
 * Uses SLUG_KEYWORDS for known content-plan articles, extracts from
 * SEO title for dynamically-generated articles.
 *
 * Workspace-scoped (audit 2026-07-07, E1): targets live on the language's
 * CF Pages domain, so only articles from the workspace that OWNS that CF
 * project may be linked. Callers from another workspace (e.g. hydro13's
 * Shopify blog) can pass `workspaceId`; if it differs from the CF project's
 * owner, no targets are returned - cross-brand links to halsobladet was a
 * live bug.
 */
export async function buildLinkTargetsFromDB(
  language: Language,
  excludeSlug?: string,
  workspaceId?: string
): Promise<LinkTarget[]> {
  const db = createServerSupabase();
  const domain = getProjectCustomDomain(language);
  if (!domain) return [];

  let cfWorkspaceId: string | null = null;
  try {
    cfWorkspaceId = await getWorkspaceIdForCfProject(getProjectName(language));
  } catch {
    // No CF project configured for this language - no valid link domain
    return [];
  }
  if (!cfWorkspaceId) {
    console.warn(
      `[buildLinkTargetsFromDB] No workspace mapping for language "${language}" - returning no targets to avoid cross-workspace links`
    );
    return [];
  }
  if (workspaceId && workspaceId !== cfWorkspaceId) {
    // Caller's workspace doesn't own this CF domain - linking its articles
    // to another brand's blog is exactly the bug this guards against.
    console.warn(
      `[buildLinkTargetsFromDB] workspace ${workspaceId} does not own the ${language} CF project - no targets`
    );
    return [];
  }

  const { data: articles } = await db
    .from("translations")
    .select("slug, seo_title, pages!inner(blog_category, content_type, workspace_id)")
    .eq("language", language)
    .eq("status", "published")
    .eq("pages.content_type", "seo_blog")
    .eq("pages.workspace_id", cfWorkspaceId);

  if (!articles?.length) return [];

  // Fetch primary keywords from blog_content_plan for all slugs in this language.
  // This replaces the need for the hardcoded SLUG_KEYWORDS map for planned articles.
  const slugs = articles.map((a) => a.slug).filter(Boolean);
  const { data: planRows } = await db
    .from("blog_content_plan")
    .select("slug, primary_keyword")
    .eq("language", language)
    .in("slug", slugs);

  const planKeywords = new Map<string, string>();
  for (const row of planRows ?? []) {
    if (row.primary_keyword) {
      planKeywords.set(row.slug, row.primary_keyword);
    }
  }

  const seenSlugs = new Set<string>();
  return articles
    .filter((a) => {
      if (!a.slug || a.slug === excludeSlug || seenSlugs.has(a.slug)) return false;
      seenSlugs.add(a.slug);
      return true;
    })
    .map((a) => {
      const page = a.pages as unknown as { blog_category?: string };
      const catSlug = page.blog_category
        ? slugifyCategory(page.blog_category)
        : "";
      const path = getArticlePath(a.slug, catSlug);

      // Priority: DB content plan keyword > hardcoded map > title extraction > slug
      const keyword =
        planKeywords.get(a.slug) ||
        SLUG_KEYWORDS[a.slug] ||
        (a.seo_title || "")
          .split(/\s*[—|:]\s*/)[0]
          ?.trim()
          .replace(/\s*\d{4}\s*$/, "")
          .trim() ||
        a.slug;

      return {
        slug: a.slug,
        title: a.seo_title || a.slug,
        keyword,
        url: `https://${domain}/${path}`,
      };
    });
}
