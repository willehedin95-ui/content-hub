/**
 * Internal-link depth audit.
 *
 * Calculates shortest-path distance (in clicks) from homepage to each
 * published article via internal links. Articles >3 clicks deep are
 * effectively invisible to Google's crawler budget and rank poorly.
 *
 * Approach:
 *  1. Pull all published article HTMLs for workspace+language
 *  2. Parse internal hrefs from each (a[href] pointing to same domain)
 *  3. BFS from homepage: depth=0 = homepage, depth=1 = directly linked, etc.
 *  4. Return articles with depth > maxDepth + orphans (depth = Infinity)
 *
 * Use cases:
 *  - Surface "buried" articles that need more linking
 *  - Detect orphan content that nothing links to
 *  - Validate hub-and-spoke architecture (pillar at depth 1, spokes at depth 2)
 */

import * as cheerio from "cheerio";
import { createServerSupabase } from "./supabase-admin";
import type { Language } from "@/types";

export interface LinkDepthIssue {
  slug: string;
  title: string;
  url: string;
  depth: number;
  incomingLinks: number;
}

export interface LinkDepthReport {
  totalArticles: number;
  homepage: string;
  byDepth: Record<number, number>;
  orphans: LinkDepthIssue[];
  tooDeep: LinkDepthIssue[];
  averageDepth: number;
}

function extractSlugFromUrl(url: string, knownDomains: Set<string>): string | null {
  try {
    const u = url.startsWith("/") ? new URL(url, "https://placeholder.example") : new URL(url);
    // For absolute URLs, only consider same-domain links
    if (!url.startsWith("/")) {
      const host = u.hostname.replace(/^www\./, "");
      if (!Array.from(knownDomains).some((d) => host === d || host.endsWith(d))) {
        return null;
      }
    }
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return "__home__";
    return segments[segments.length - 1];
  } catch {
    return null;
  }
}

export async function auditLinkDepth(
  workspaceId: string,
  language: Language,
  opts?: { maxDepth?: number }
): Promise<LinkDepthReport> {
  const maxDepth = opts?.maxDepth ?? 3;
  const db = createServerSupabase();

  // Pull all published article HTMLs
  const { data: pubs } = await db
    .from("translations")
    .select("slug, seo_title, translated_html, published_url, pages!inner(workspace_id, content_type)")
    .eq("language", language)
    .eq("status", "published")
    .eq("pages.workspace_id", workspaceId)
    .eq("pages.content_type", "seo_blog")
    .not("translated_html", "is", null);

  if (!pubs || pubs.length === 0) {
    return {
      totalArticles: 0,
      homepage: "",
      byDepth: {},
      orphans: [],
      tooDeep: [],
      averageDepth: 0,
    };
  }

  // Determine homepage domain from first published URL
  let homepage = "";
  const knownDomains = new Set<string>();
  for (const p of pubs) {
    if (p.published_url) {
      try {
        const u = new URL(p.published_url as string);
        homepage = `https://${u.hostname}/`;
        knownDomains.add(u.hostname.replace(/^www\./, ""));
      } catch { /* ignore */ }
    }
  }

  // Build adjacency map: slug -> Set of outbound slugs
  const adjacency = new Map<string, Set<string>>();
  const titles = new Map<string, string>();
  const urls = new Map<string, string>();

  // Homepage links to all articles by default (since homepage lists them)
  adjacency.set("__home__", new Set());

  for (const p of pubs) {
    const slug = p.slug as string;
    titles.set(slug, (p.seo_title as string) || slug);
    urls.set(slug, (p.published_url as string) || "");

    const $ = cheerio.load((p.translated_html as string) || "");
    const outbound = new Set<string>();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const targetSlug = extractSlugFromUrl(href, knownDomains);
      if (targetSlug && targetSlug !== slug && targetSlug !== "__home__") {
        outbound.add(targetSlug);
      }
    });
    adjacency.set(slug, outbound);

    // Homepage is a permanent inbound source for every published article
    // (article listing on the homepage links to them) - so we add edges
    // from homepage to article.
    adjacency.get("__home__")!.add(slug);
  }

  // BFS from homepage
  const depths = new Map<string, number>();
  depths.set("__home__", 0);
  const queue: string[] = ["__home__"];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depths.get(current)!;
    const neighbors = adjacency.get(current) ?? new Set();
    for (const neighbor of neighbors) {
      if (!depths.has(neighbor)) {
        depths.set(neighbor, currentDepth + 1);
        queue.push(neighbor);
      }
    }
  }

  // Calculate incoming link counts
  const incoming = new Map<string, number>();
  for (const [, outbound] of adjacency) {
    for (const target of outbound) {
      incoming.set(target, (incoming.get(target) ?? 0) + 1);
    }
  }

  // Categorize results
  const byDepth: Record<number, number> = {};
  const orphans: LinkDepthIssue[] = [];
  const tooDeep: LinkDepthIssue[] = [];
  let depthSum = 0;
  let depthCount = 0;

  for (const p of pubs) {
    const slug = p.slug as string;
    const depth = depths.get(slug);
    const issue: LinkDepthIssue = {
      slug,
      title: titles.get(slug) || slug,
      url: urls.get(slug) || "",
      depth: depth ?? Infinity,
      incomingLinks: incoming.get(slug) ?? 0,
    };

    if (depth === undefined) {
      // Article isn't reachable from homepage - true orphan
      orphans.push(issue);
    } else {
      byDepth[depth] = (byDepth[depth] ?? 0) + 1;
      depthSum += depth;
      depthCount++;
      if (depth > maxDepth) {
        tooDeep.push(issue);
      }
    }
  }

  return {
    totalArticles: pubs.length,
    homepage,
    byDepth,
    orphans: orphans.sort((a, b) => b.incomingLinks - a.incomingLinks),
    tooDeep: tooDeep.sort((a, b) => b.depth - a.depth),
    averageDepth: depthCount > 0 ? Math.round((depthSum / depthCount) * 10) / 10 : 0,
  };
}
