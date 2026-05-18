import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import { getOrdersByPage, getShopifyCredsForWorkspace, type OrderAttribution } from "@/lib/shopify";
import { extractSlug } from "@/lib/seo-workspace-filter";
import { fetchAllGA4Metrics } from "@/lib/ga4";
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
  const propertyUrls = gscProperties.map((p) => p.property);

  // Get all published seo_blog translations with their slugs, filtered to the
  // current workspace (previously returned every workspace's blog pages).
  const { data: blogPages } = await db
    .from("translations")
    .select(
      "id, slug, seo_title, language, status, created_at, updated_at, pages!inner(id, workspace_id, content_type, blog_category, blog_featured_image_url)"
    )
    .eq("status", "published")
    .eq("pages.content_type", "seo_blog")
    .eq("pages.workspace_id", workspaceId)
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

  const [curRes, prevRes] = propertyUrls.length > 0
    ? await Promise.all([
        db
          .from("gsc_keywords")
          .select("query, page, country, clicks, impressions, ctr, position")
          .in("property", propertyUrls)
          .gte("date", fmt(dStart))
          .lte("date", fmt(d3)),
        db
          .from("gsc_keywords")
          .select("query, page, country, clicks, impressions, position")
          .in("property", propertyUrls)
          .gte("date", fmt(dPrevStart))
          .lt("date", fmt(dStart)),
      ])
    : [{ data: [] }, { data: [] }];

  const curRows = curRes.data ?? [];
  const prevRows = prevRes.data ?? [];

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

  // Fetch Shopify conversion data (per-workspace store).
  let shopifyMap = new Map<string, OrderAttribution>();
  let blogReferralTotal: OrderAttribution | null = null;
  try {
    const creds = await getShopifyCredsForWorkspace(workspaceId);
    if (creds) {
      shopifyMap = await getOrdersByPage(
        new Date(Date.now() - days * 86400000).toISOString(),
        creds
      );
      blogReferralTotal = shopifyMap.get("__blog__") ?? null;
    }
  } catch {
    // Shopify data is optional
  }

  // Fetch GA4 page-level metrics (pageviews, sessions, bounce rate, engagement).
  // Shows traffic BEFORE GSC starts ranking - critical for new articles where
  // GSC has 0 impressions but GA4 may show direct/social traffic.
  // Falls through silently if GA4 not configured.
  const ga4PropertyIds: Record<string, string> =
    (settings?.ga4_property_ids as Record<string, string>) ?? {};
  let ga4Metrics: Map<string, import("@/lib/ga4").GA4PageMetrics> | null = null;
  if (Object.values(ga4PropertyIds).filter(Boolean).length > 0) {
    try {
      ga4Metrics = await fetchAllGA4Metrics(ga4PropertyIds, days);
    } catch (err) {
      console.warn("[blog-articles] GA4 fetch failed (non-fatal):", err);
    }
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
    const attribution = shopify?.source ?? null;

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

    // GA4 lookup - key format from fetchAllGA4Metrics is `${lang}:${pagePath}`.
    // Pages live under /<category>/<slug>/ so we try a couple of likely paths.
    let ga4 = null as import("@/lib/ga4").GA4PageMetrics | null;
    if (ga4Metrics) {
      const categorySlug = (page?.blog_category || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const candidates = [
        `${bp.language}:/${categorySlug}/${slug}/`,
        `${bp.language}:/${categorySlug}/${slug}`,
        `${bp.language}:/${slug}/`,
        `${bp.language}:/${slug}`,
        `${bp.language}:/blogs/kollagen/${slug}`,
        `${bp.language}:/blogs/kollagen/${slug}/`,
      ];
      for (const key of candidates) {
        const m = ga4Metrics.get(key);
        if (m) { ga4 = m; break; }
      }
    }

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
      // GA4 metrics (null when GA4 not configured or no data for this page)
      ga4PageViews: ga4?.screenPageViews ?? null,
      ga4Sessions: ga4?.sessions ?? null,
      ga4Users: ga4?.totalUsers ?? null,
      ga4BounceRate: ga4 ? Math.round(ga4.bounceRate * 100) / 100 : null,
      ga4EngagementRate: ga4 ? Math.round(ga4.engagementRate * 100) / 100 : null,
      ga4AvgSessionSec: ga4 ? Math.round(ga4.averageSessionDuration) : null,
      ga4Conversions: ga4?.conversions ?? null,
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
      attribution, // "utm" | "referrer" | "mixed" | null
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

  // Blog-referred orders where we couldn't pinpoint the article (UTM stripped
  // but referring_site is one of our blog domains). Exposed so the UI can
  // display "+ N untracked blog conversions".
  const blogReferralUnattributed = blogReferralTotal
    ? {
        orders: blogReferralTotal.orders,
        revenue: blogReferralTotal.revenue,
        currency: blogReferralTotal.currency,
      }
    : null;

  return NextResponse.json({ articles, totals, days, blogReferralUnattributed });
}
