import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/pages/recommendations?product=happysleep
 *
 * Returns 30-day page performance for the landing-page picker.
 *
 * Primary source ("live"): meta_ad_performance joined to meta_ad_links (ad ->
 * destination URL), aggregated per page source_url. This counts EVERY ad in the
 * ad account - hub-pushed or not. The old hub-only chain (pages -> image_jobs ->
 * image_job_markets -> concept_metrics) made landers whose ads were created
 * outside the hub (e.g. the doginwork advertorial, the account's best performer)
 * look dataless and sink below hub-pushed pages in the "Top pick" sort.
 *
 * Fallback ("hub"): the concept_metrics chain, for pages without a matchable
 * source_url or without live rows. concept_count always comes from the hub chain.
 *
 * Response: { recommendations: Array<{ page_id, spend, conversions, revenue,
 *   roas, cpa, concept_count, confidence, source }> }
 */

/** Normalize a URL for destination matching: host + path, no protocol/www/query/trailing slash. */
function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const product = req.nextUrl.searchParams.get("product");

  if (!product) {
    return NextResponse.json({ error: "product is required" }, { status: 400 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sinceStr = thirtyDaysAgo.toISOString().slice(0, 10);

  // ── Candidate pages (ALL landing pages for the product, not only ones with concepts) ──
  const { data: pages } = await db
    .from("pages")
    .select("id, source_url, content_type")
    .eq("workspace_id", workspaceId)
    .eq("product", product)
    .or("content_type.eq.landing_page,content_type.is.null");
  const pageUrl = new Map<string, string | null>(
    (pages ?? []).map((p) => [p.id as string, normalizeUrl(p.source_url as string | null)])
  );

  // ── Hub chain: concept counts + fallback metrics ──
  const { data: jobs } = await db
    .from("image_jobs")
    .select("id, landing_page_id")
    .eq("workspace_id", workspaceId)
    .eq("product", product)
    .not("landing_page_id", "is", null);

  const pageJobMap = new Map<string, string[]>();
  for (const job of jobs ?? []) {
    const pageId = job.landing_page_id as string;
    if (!pageUrl.has(pageId)) continue; // blog pages etc. stay excluded
    const existing = pageJobMap.get(pageId) ?? [];
    existing.push(job.id);
    pageJobMap.set(pageId, existing);
  }

  const allJobIds = [...pageJobMap.values()].flat();
  const jobMarketMap = new Map<string, string[]>();
  const ijmMetrics = new Map<string, { spend: number; conversions: number; revenue: number }>();
  if (allJobIds.length > 0) {
    const { data: markets } = await db
      .from("image_job_markets")
      .select("id, image_job_id")
      .in("image_job_id", allJobIds);
    for (const m of markets ?? []) {
      const existing = jobMarketMap.get(m.image_job_id) ?? [];
      existing.push(m.id);
      jobMarketMap.set(m.image_job_id, existing);
    }
    const allIjmIds = (markets ?? []).map((m) => m.id);
    if (allIjmIds.length > 0) {
      const { data: metrics } = await db
        .from("concept_metrics")
        .select("image_job_market_id, spend, conversions, revenue")
        .in("image_job_market_id", allIjmIds)
        .gte("date", sinceStr);
      for (const row of metrics ?? []) {
        const existing = ijmMetrics.get(row.image_job_market_id) ?? {
          spend: 0,
          conversions: 0,
          revenue: 0,
        };
        existing.spend += Number(row.spend ?? 0);
        existing.conversions += Number(row.conversions ?? 0);
        existing.revenue += Number(row.revenue ?? 0);
        ijmMetrics.set(row.image_job_market_id, existing);
      }
    }
  }

  // ── Live account data per destination URL ──
  const { data: wsRow } = await db
    .from("workspaces")
    .select("meta_config")
    .eq("id", workspaceId)
    .single();
  const metaConfig = (wsRow?.meta_config ?? null) as { ad_account_id?: string } | null;
  const adAccountId = (metaConfig?.ad_account_id || process.env.META_AD_ACCOUNT_ID || "")
    .replace(/^act_/, "")
    .trim();

  const liveByUrl = new Map<string, { spend: number; conversions: number; revenue: number }>();
  if (adAccountId) {
    const { data: links } = await db
      .from("meta_ad_links")
      .select("meta_ad_id, link_url")
      .eq("ad_account_id", adAccountId);
    const adToUrl = new Map<string, string>();
    for (const l of links ?? []) {
      const norm = normalizeUrl(l.link_url as string | null);
      if (norm) adToUrl.set(l.meta_ad_id as string, norm);
    }
    if (adToUrl.size > 0) {
      const { data: perf } = await db
        .from("meta_ad_performance")
        .select("meta_ad_id, spend, purchases, purchase_value")
        .eq("ad_account_id", adAccountId)
        .gte("date", sinceStr)
        .limit(20000);
      for (const row of perf ?? []) {
        const url = adToUrl.get(row.meta_ad_id as string);
        if (!url) continue;
        const agg = liveByUrl.get(url) ?? { spend: 0, conversions: 0, revenue: 0 };
        agg.spend += Number(row.spend ?? 0);
        agg.conversions += Number(row.purchases ?? 0);
        agg.revenue += Number(row.purchase_value ?? 0);
        liveByUrl.set(url, agg);
      }
    }
  }

  // ── Merge per page: live wins, hub chain is fallback ──
  const recommendations: Array<{
    page_id: string;
    spend: number;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number;
    concept_count: number;
    confidence: "high" | "medium" | "low" | "no_data";
    source: "live" | "hub";
  }> = [];

  for (const [pageId, norm] of pageUrl) {
    const jobIds = pageJobMap.get(pageId) ?? [];

    let hubSpend = 0;
    let hubConversions = 0;
    let hubRevenue = 0;
    for (const jobId of jobIds) {
      for (const ijmId of jobMarketMap.get(jobId) ?? []) {
        const m = ijmMetrics.get(ijmId);
        if (m) {
          hubSpend += m.spend;
          hubConversions += m.conversions;
          hubRevenue += m.revenue;
        }
      }
    }

    const live = norm ? liveByUrl.get(norm) : undefined;
    const source: "live" | "hub" = live && live.spend > 0 ? "live" : "hub";
    const totalSpend = source === "live" ? live!.spend : hubSpend;
    const totalConversions = source === "live" ? live!.conversions : hubConversions;
    const totalRevenue = source === "live" ? live!.revenue : hubRevenue;

    if (totalSpend === 0 && jobIds.length === 0) continue; // nothing to say about this page

    let confidence: "high" | "medium" | "low" | "no_data";
    if (totalSpend === 0) {
      confidence = "no_data";
    } else if (totalConversions >= 10 && totalSpend >= 2000) {
      confidence = "high";
    } else if (totalConversions >= 3 && totalSpend >= 500) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    recommendations.push({
      page_id: pageId,
      spend: Math.round(totalSpend * 100) / 100,
      conversions: totalConversions,
      revenue: Math.round(totalRevenue * 100) / 100,
      roas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0,
      cpa:
        totalConversions > 0
          ? Math.round((totalSpend / totalConversions) * 100) / 100
          : 0,
      concept_count: jobIds.length,
      confidence,
      source,
    });
  }

  // Sort by ROAS descending (pages with data first, then no_data)
  recommendations.sort((a, b) => {
    if (a.confidence === "no_data" && b.confidence !== "no_data") return 1;
    if (a.confidence !== "no_data" && b.confidence === "no_data") return -1;
    return b.roas - a.roas;
  });

  return NextResponse.json({ recommendations });
}
