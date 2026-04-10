import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import * as cheerio from "cheerio";

/**
 * Page diagnostics for gap keywords.
 * Matches a GSC page URL to a translation in our DB, analyzes the HTML,
 * and returns actionable diagnostics: is the keyword in the title? H1?
 * First paragraph? How long is the page? What should be fixed?
 */

interface Diagnostics {
  found: boolean;
  slug?: string;
  inTitle: boolean;
  inH1: boolean;
  inFirstParagraph: boolean;
  inMetaDescription: boolean;
  wordCount: number;
  h2Count: number;
  internalLinkCount: number;
  keywordDensity: number;
  recommendations: string[];
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pageUrl = url.searchParams.get("url");
  const keyword = url.searchParams.get("keyword");

  if (!pageUrl || !keyword) {
    return NextResponse.json({ error: "url and keyword params required" }, { status: 400 });
  }

  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();

  // Extract slug from URL path (last segment)
  let slug: string;
  try {
    const parsed = new URL(pageUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    slug = segments[segments.length - 1] || "";
  } catch {
    return NextResponse.json({ found: false, recommendations: ["Could not parse page URL"] } as Diagnostics);
  }

  if (!slug) {
    return NextResponse.json({
      found: false, inTitle: false, inH1: false, inFirstParagraph: false,
      inMetaDescription: false, wordCount: 0, h2Count: 0, internalLinkCount: 0,
      keywordDensity: 0, recommendations: [],
    } satisfies Diagnostics);
  }

  // Find the translation in our DB
  const { data: translation } = await db
    .from("translations")
    .select("slug, seo_title, seo_description, translated_html, pages!inner(workspace_id, content_type)")
    .eq("slug", slug)
    .eq("status", "published")
    .eq("pages.workspace_id", workspaceId)
    .maybeSingle();

  if (!translation?.translated_html) {
    return NextResponse.json({
      found: false,
      inTitle: false,
      inH1: false,
      inFirstParagraph: false,
      inMetaDescription: false,
      wordCount: 0,
      h2Count: 0,
      internalLinkCount: 0,
      keywordDensity: 0,
      recommendations: ["Page not found in database - may be an external page we don't control"],
    } satisfies Diagnostics);
  }

  const html = translation.translated_html;
  const $ = cheerio.load(html);
  const kw = keyword.toLowerCase();

  // Check title
  const title = (translation.seo_title || $("title").text() || "").toLowerCase();
  const inTitle = title.includes(kw);

  // Check H1
  const h1Text = $("h1").first().text().toLowerCase();
  const inH1 = h1Text.includes(kw);

  // Check meta description
  const metaDesc = (translation.seo_description || "").toLowerCase();
  const inMetaDescription = metaDesc.includes(kw);

  // Check first paragraph
  const firstP = $("p").first().text().toLowerCase();
  const inFirstParagraph = firstP.includes(kw);

  // Word count
  const textContent = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = textContent.split(" ").filter(Boolean).length;

  // H2 count
  const h2Count = $("h2").length;

  // Internal link count (links to our blog domains)
  const blogDomains = ["halsobladet.com", "smarthelse.dk", "helseguiden.com"];
  let internalLinkCount = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (blogDomains.some((d) => href.includes(d))) {
      internalLinkCount++;
    }
  });

  // Keyword density
  const kwWords = kw.split(" ").length;
  const textLower = textContent.toLowerCase();
  let kwOccurrences = 0;
  let searchStart = 0;
  while (true) {
    const idx = textLower.indexOf(kw, searchStart);
    if (idx === -1) break;
    kwOccurrences++;
    searchStart = idx + 1;
  }
  const keywordDensity = wordCount > 0 ? Math.round((kwOccurrences * kwWords / wordCount) * 1000) / 10 : 0;

  // Build recommendations
  const recommendations: string[] = [];

  if (!inTitle) {
    recommendations.push(`Add "${keyword}" to the page title`);
  }
  if (!inH1) {
    recommendations.push(`Add "${keyword}" to the H1 heading`);
  }
  if (!inFirstParagraph) {
    recommendations.push(`Mention "${keyword}" in the first paragraph`);
  }
  if (!inMetaDescription) {
    recommendations.push(`Add "${keyword}" to the meta description for better CTR`);
  }
  if (wordCount < 1000) {
    recommendations.push(`Page is thin (${wordCount} words) - aim for 2000+ words`);
  } else if (wordCount < 1500) {
    recommendations.push(`Content is light (${wordCount} words) - consider expanding to 2000+`);
  }
  if (h2Count < 3) {
    recommendations.push(`Only ${h2Count} H2 headings - add more structured sections`);
  }
  if (internalLinkCount < 2) {
    recommendations.push(`Only ${internalLinkCount} internal links - add 3-5 links to related articles`);
  }
  if (keywordDensity < 0.3) {
    recommendations.push(`Keyword density is very low (${keywordDensity}%) - mention the keyword more naturally`);
  } else if (keywordDensity > 3) {
    recommendations.push(`Keyword density is high (${keywordDensity}%) - reduce to avoid over-optimization`);
  }

  if (recommendations.length === 0) {
    recommendations.push("Page looks well-optimized for this keyword");
  }

  return NextResponse.json({
    found: true,
    slug,
    inTitle,
    inH1,
    inFirstParagraph,
    inMetaDescription,
    wordCount,
    h2Count,
    internalLinkCount,
    keywordDensity,
    recommendations,
  } satisfies Diagnostics);
}
