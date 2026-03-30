import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/pages/recommendations?product=happysleep
 *
 * Returns page performance data aggregated from concept_metrics.
 * Data path: pages → image_jobs (landing_page_id) → image_job_markets → concept_metrics
 *
 * Response: { recommendations: Array<{ page_id, spend, conversions, revenue, roas, cpa, concept_count, confidence }> }
 */
export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const product = req.nextUrl.searchParams.get("product");

  if (!product) {
    return NextResponse.json(
      { error: "product is required" },
      { status: 400 }
    );
  }

  // 1. Get all image_jobs for this product that have a landing page
  const { data: jobs, error: jobsErr } = await db
    .from("image_jobs")
    .select("id, landing_page_id")
    .eq("workspace_id", workspaceId)
    .eq("product", product)
    .not("landing_page_id", "is", null);

  if (jobsErr) {
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }

  if (!jobs?.length) {
    return NextResponse.json({ recommendations: [] });
  }

  // Build page_id → [job_ids] mapping
  const pageJobMap = new Map<string, string[]>();
  for (const job of jobs) {
    const pageId = job.landing_page_id as string;
    const existing = pageJobMap.get(pageId) ?? [];
    existing.push(job.id);
    pageJobMap.set(pageId, existing);
  }

  // Filter out blog pages from recommendations (only include landing pages)
  const pageIds = [...pageJobMap.keys()];
  if (pageIds.length > 0) {
    const { data: validPages } = await db
      .from("pages")
      .select("id")
      .in("id", pageIds)
      .or("content_type.eq.landing_page,content_type.is.null");

    const validPageIds = new Set((validPages ?? []).map((p) => p.id));
    for (const pageId of pageIds) {
      if (!validPageIds.has(pageId)) {
        pageJobMap.delete(pageId);
      }
    }
  }

  const allJobIds = jobs.map((j) => j.id);

  // 2. Get image_job_markets for these jobs
  const { data: markets, error: marketsErr } = await db
    .from("image_job_markets")
    .select("id, image_job_id")
    .in("image_job_id", allJobIds);

  if (marketsErr || !markets?.length) {
    return NextResponse.json({ recommendations: [] });
  }

  // Build job_id → [ijm_ids] mapping
  const jobMarketMap = new Map<string, string[]>();
  for (const m of markets) {
    const existing = jobMarketMap.get(m.image_job_id) ?? [];
    existing.push(m.id);
    jobMarketMap.set(m.image_job_id, existing);
  }

  const allIjmIds = markets.map((m) => m.id);

  // 3. Get concept_metrics for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sinceStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const { data: metrics, error: metricsErr } = await db
    .from("concept_metrics")
    .select(
      "image_job_market_id, spend, conversions, revenue"
    )
    .in("image_job_market_id", allIjmIds)
    .gte("date", sinceStr);

  if (metricsErr) {
    return NextResponse.json({ recommendations: [] });
  }

  // Build ijm_id → { spend, conversions, revenue }
  const ijmMetrics = new Map<
    string,
    { spend: number; conversions: number; revenue: number }
  >();
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

  // 4. Roll up by page_id
  const recommendations: Array<{
    page_id: string;
    spend: number;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number;
    concept_count: number;
    confidence: "high" | "medium" | "low" | "no_data";
  }> = [];

  for (const [pageId, jobIds] of pageJobMap) {
    let totalSpend = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    for (const jobId of jobIds) {
      const ijmIds = jobMarketMap.get(jobId) ?? [];
      for (const ijmId of ijmIds) {
        const m = ijmMetrics.get(ijmId);
        if (m) {
          totalSpend += m.spend;
          totalConversions += m.conversions;
          totalRevenue += m.revenue;
        }
      }
    }

    // Determine confidence based on spend and conversions
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
      roas:
        totalSpend > 0
          ? Math.round((totalRevenue / totalSpend) * 100) / 100
          : 0,
      cpa:
        totalConversions > 0
          ? Math.round((totalSpend / totalConversions) * 100) / 100
          : 0,
      concept_count: jobIds.length,
      confidence,
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
