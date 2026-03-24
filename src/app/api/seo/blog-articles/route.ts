import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import { getOrdersByPage } from "@/lib/shopify";
import type { GscProperty } from "@/types";

/**
 * Blog article analytics: per-article GSC metrics + Shopify conversions.
 * Returns aggregated performance data for all published seo_blog pages.
 */
export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const settings = await getWorkspaceSettings();
  const url = new URL(req.url);
  const days = Math.min(parseInt(url.searchParams.get("days") ?? "30"), 90);

  const gscProperties: GscProperty[] = (settings?.gsc_properties as GscProperty[]) ?? [];

  // Get all published seo_blog translations with their slugs
  const { data: blogPages } = await db
    .from("translations")
    .select(
      "id, slug, seo_title, language, status, created_at, updated_at, pages!inner(id, content_type, blog_category, blog_featured_image_url)"
    )
    .eq("status", "published")
    .eq("pages.content_type", "seo_blog")
    .not("slug", "is", null);

  if (!blogPages || blogPages.length === 0) {
    return NextResponse.json({ articles: [], totals: null });
  }

  // Date ranges for GSC (2-3 day delay)
  const now = new Date();
  const d3 = new Date(now);
  d3.setDate(d3.getDate() - 3);
  const dStart = new Date(now);
  dStart.setDate(dStart.getDate() - days - 3);
  const dPrevStart = new Date(dStart);
  dPrevStart.setDate(dPrevStart.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Fetch GSC data for blog pages
  const slugSet = new Set(blogPages.map((p) => p.slug as string));

  const [curRes, prevRes] = await Promise.all([
    db
      .from("gsc_keywords")
      .select("query, page, country, clicks, impressions, ctr, position")
      .eq("workspace_id", workspaceId)
      .gte("date", fmt(dStart))
      .lte("date", fmt(d3)),
    db
      .from("gsc_keywords")
      .select("query, page, country, clicks, impressions, position")
      .eq("workspace_id", workspaceId)
      .gte("date", fmt(dPrevStart))
      .lt("date", fmt(dStart)),
  ]);

  const curRows = curRes.data ?? [];
  const prevRows = prevRes.data ?? [];

  // Helper: extract slug from GSC page URL
  // GSC URLs look like https://blog.halsobladet.com/produktguider/test-basta-kudden
  // The slug is the last path segment
  function extractSlug(pageUrl: string): string | null {
    try {
      const u = new URL(pageUrl);
      const parts = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
      return parts[parts.length - 1] || null;
    } catch {
      return null;
    }
  }

  // Aggregate GSC data per slug (current period)
  const curBySlug = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      posSum: number;
      posCount: number;
      keywords: Map<string, { clicks: number; impressions: number; position: number; count: number }>;
    }
  >();

  for (const r of curRows) {
    const slug = extractSlug(r.page);
    if (!slug || !slugSet.has(slug)) continue;

    const existing = curBySlug.get(slug) ?? {
      clicks: 0,
      impressions: 0,
      posSum: 0,
      posCount: 0,
      keywords: new Map(),
    };
    existing.clicks += r.clicks ?? 0;
    existing.impressions += r.impressions ?? 0;
    existing.posSum += r.position ?? 0;
    existing.posCount += 1;

    // Track per-keyword metrics
    const kw = existing.keywords.get(r.query) ?? { clicks: 0, impressions: 0, position: 0, count: 0 };
    kw.clicks += r.clicks ?? 0;
    kw.impressions += r.impressions ?? 0;
    kw.position += r.position ?? 0;
    kw.count += 1;
    existing.keywords.set(r.query, kw);

    curBySlug.set(slug, existing);
  }

  // Aggregate previous period per slug
  const prevBySlug = new Map<string, { clicks: number; impressions: number; posSum: number; posCount: number }>();
  for (const r of prevRows) {
    const slug = extractSlug(r.page);
    if (!slug || !slugSet.has(slug)) continue;

    const existing = prevBySlug.get(slug) ?? { clicks: 0, impressions: 0, posSum: 0, posCount: 0 };
    existing.clicks += r.clicks ?? 0;
    existing.impressions += r.impressions ?? 0;
    existing.posSum += r.position ?? 0;
    existing.posCount += 1;
    prevBySlug.set(slug, existing);
  }

  // Fetch Shopify conversion data
  let shopifyMap = new Map<string, { orders: number; revenue: number; currency: string }>();
  try {
    shopifyMap = await getOrdersByPage(new Date(Date.now() - days * 86400000).toISOString());
  } catch {
    // Shopify data is optional
  }

  // Build per-article response
  const articles = blogPages.map((bp) => {
    const slug = bp.slug as string;
    const page = bp.pages as unknown as {
      id: string;
      blog_category?: string;
      blog_featured_image_url?: string;
    };

    const cur = curBySlug.get(slug);
    const prev = prevBySlug.get(slug);
    const shopify = shopifyMap.get(slug);

    const avgPosition = cur && cur.posCount > 0 ? cur.posSum / cur.posCount : null;
    const prevAvgPosition = prev && prev.posCount > 0 ? prev.posSum / prev.posCount : null;

    // Top 5 keywords by impressions
    const topKeywords = cur
      ? Array.from(cur.keywords.entries())
          .map(([query, kw]) => ({
            query,
            clicks: kw.clicks,
            impressions: kw.impressions,
            avgPosition: kw.count > 0 ? Math.round((kw.position / kw.count) * 10) / 10 : 0,
          }))
          .sort((a, b) => b.impressions - a.impressions)
          .slice(0, 5)
      : [];

    return {
      slug,
      title: bp.seo_title || slug,
      language: bp.language,
      category: page?.blog_category || null,
      publishedAt: bp.created_at,
      // GSC metrics
      clicks: cur?.clicks ?? 0,
      impressions: cur?.impressions ?? 0,
      avgPosition: avgPosition !== null ? Math.round(avgPosition * 10) / 10 : null,
      // Trends (vs previous period)
      clicksTrend: prev && prev.clicks > 0
        ? Math.round((((cur?.clicks ?? 0) - prev.clicks) / prev.clicks) * 100)
        : null,
      impressionsTrend: prev && prev.impressions > 0
        ? Math.round((((cur?.impressions ?? 0) - prev.impressions) / prev.impressions) * 100)
        : null,
      positionTrend: avgPosition !== null && prevAvgPosition !== null
        ? Math.round((prevAvgPosition - avgPosition) * 10) / 10  // positive = improved
        : null,
      // Shopify conversions
      orders: shopify?.orders ?? 0,
      revenue: shopify?.revenue ?? 0,
      currency: shopify?.currency ?? "SEK",
      // Top keywords
      topKeywords,
      // Unique keyword count
      keywordCount: cur?.keywords.size ?? 0,
    };
  });

  // Sort by clicks desc (most traffic first)
  articles.sort((a, b) => b.clicks - a.clicks);

  // Compute totals
  const totals = {
    totalArticles: articles.length,
    totalClicks: articles.reduce((s, a) => s + a.clicks, 0),
    totalImpressions: articles.reduce((s, a) => s + a.impressions, 0),
    totalOrders: articles.reduce((s, a) => s + a.orders, 0),
    totalRevenue: articles.reduce((s, a) => s + a.revenue, 0),
    avgPosition: (() => {
      const withPos = articles.filter((a) => a.avgPosition !== null);
      if (withPos.length === 0) return null;
      return Math.round((withPos.reduce((s, a) => s + a.avgPosition!, 0) / withPos.length) * 10) / 10;
    })(),
    totalKeywords: new Set(
      articles.flatMap((a) => a.topKeywords.map((k) => k.query))
    ).size,
  };

  return NextResponse.json({ articles, totals, days });
}
