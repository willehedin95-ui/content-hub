import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 15;

/**
 * GET /api/pipeline/concept/[id]
 *
 * Fetch complete concept detail by image_job_id.
 * Returns: concept info, CASH DNA, source images, per-market metrics,
 * ad sets, individual ads, and recent performance.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // 1. Fetch image_job with source images
  const { data: job, error: jobErr } = await db
    .from("image_jobs")
    .select(
      "id, name, product, status, concept_number, cash_dna, ad_copy_primary, ad_copy_headline, landing_page_id, iteration_of, iteration_type, iteration_context, tags, created_at, updated_at, source_images(id, original_url, thumbnail_url, filename, processing_order)"
    )
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: "Concept not found" },
      { status: 404 }
    );
  }

  // 2. Fetch all markets this concept is pushed to
  const { data: markets } = await db
    .from("image_job_markets")
    .select("id, image_job_id, market, created_at")
    .eq("image_job_id", id)
    .order("created_at", { ascending: true });

  const marketIds = (markets ?? []).map((m: { id: string }) => m.id);

  // 3. Fetch latest lifecycle stage per market
  const lifecycleMap = new Map<
    string,
    { stage: string; entered_at: string; signal: string | null }
  >();
  if (marketIds.length > 0) {
    const { data: lifecycle } = await db
      .from("concept_lifecycle")
      .select("image_job_market_id, stage, entered_at, exited_at, signal")
      .in("image_job_market_id", marketIds)
      .is("exited_at", null)
      .order("entered_at", { ascending: false });

    for (const lc of lifecycle ?? []) {
      if (!lifecycleMap.has(lc.image_job_market_id)) {
        lifecycleMap.set(lc.image_job_market_id, {
          stage: lc.stage,
          entered_at: lc.entered_at,
          signal: lc.signal,
        });
      }
    }
  }

  // 4. Fetch aggregated metrics per market (last 7 days)
  const metricsMap = new Map<
    string,
    {
      spend: number;
      revenue: number;
      impressions: number;
      clicks: number;
      conversions: number;
      frequency: number;
    }
  >();
  if (marketIds.length > 0) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sinceDate = sevenDaysAgo.toISOString().slice(0, 10);

    const { data: metrics } = await db
      .from("concept_metrics")
      .select(
        "image_job_market_id, spend, revenue, impressions, clicks, conversions, frequency"
      )
      .in("image_job_market_id", marketIds)
      .gte("date", sinceDate);

    for (const m of metrics ?? []) {
      const existing = metricsMap.get(m.image_job_market_id) ?? {
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        frequency: 0,
      };
      existing.spend += Number(m.spend || 0);
      existing.revenue += Number(m.revenue || 0);
      existing.impressions += Number(m.impressions || 0);
      existing.clicks += Number(m.clicks || 0);
      existing.conversions += Number(m.conversions || 0);
      // For frequency, take the latest (not sum)
      if (Number(m.frequency || 0) > existing.frequency) {
        existing.frequency = Number(m.frequency || 0);
      }
      metricsMap.set(m.image_job_market_id, existing);
    }
  }

  // 5. Fetch ad sets (meta_campaigns) linked to this concept
  const { data: adSets } = await db
    .from("meta_campaigns")
    .select(
      "id, name, meta_adset_id, meta_campaign_id, countries, language, status, daily_budget, created_at, meta_ads(id, name, meta_ad_id, image_url, headline, ad_copy, status, created_at)"
    )
    .eq("image_job_id", id)
    .order("created_at", { ascending: true });

  // 6. Fetch recent ad performance for all ad sets
  const adsetIds = (adSets ?? [])
    .map((a: { meta_adset_id: string | null }) => a.meta_adset_id)
    .filter(Boolean) as string[];

  const adPerfMap = new Map<
    string,
    { spend: number; revenue: number; impressions: number; clicks: number; purchases: number }
  >();
  if (adsetIds.length > 0) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sinceDate = sevenDaysAgo.toISOString().slice(0, 10);

    const { data: adPerf } = await db
      .from("meta_ad_performance")
      .select(
        "meta_ad_id, spend, purchase_value, impressions, clicks, purchases"
      )
      .in("adset_id", adsetIds)
      .gte("date", sinceDate);

    for (const p of adPerf ?? []) {
      const existing = adPerfMap.get(p.meta_ad_id) ?? {
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
      };
      existing.spend += Number(p.spend || 0);
      existing.revenue += Number(p.purchase_value || 0);
      existing.impressions += Number(p.impressions || 0);
      existing.clicks += Number(p.clicks || 0);
      existing.purchases += Number(p.purchases || 0);
      adPerfMap.set(p.meta_ad_id, existing);
    }
  }

  // 7. If this is an iteration, fetch parent concept name
  let parentConcept: { id: string; name: string; concept_number: number | null } | null = null;
  if (job.iteration_of) {
    const { data: parent } = await db
      .from("image_jobs")
      .select("id, name, concept_number")
      .eq("id", job.iteration_of)
      .single();
    if (parent) parentConcept = parent;
  }

  // 8. Fetch iterations of this concept
  const { data: iterations } = await db
    .from("image_jobs")
    .select("id, name, concept_number, iteration_type, created_at")
    .eq("iteration_of", id)
    .order("created_at", { ascending: true });

  // Assemble response
  const now = Date.now();

  const enrichedMarkets = (markets ?? []).map(
    (m: { id: string; market: string; created_at: string }) => {
      const lc = lifecycleMap.get(m.id);
      const met = metricsMap.get(m.id);
      const daysSincePush = Math.floor(
        (now - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysInStage = lc
        ? Math.floor(
            (now - new Date(lc.entered_at).getTime()) / (1000 * 60 * 60 * 24)
          )
        : daysSincePush;

      return {
        id: m.id,
        market: m.market,
        pushedAt: m.created_at,
        daysSincePush,
        stage: lc?.stage ?? "unknown",
        stageEnteredAt: lc?.entered_at ?? null,
        daysInStage,
        signal: lc?.signal ?? null,
        metrics: met
          ? {
              spend: round(met.spend),
              revenue: round(met.revenue),
              roas: met.spend > 0 ? round(met.revenue / met.spend) : 0,
              cpa:
                met.conversions > 0
                  ? round(met.spend / met.conversions)
                  : 0,
              ctr:
                met.impressions > 0
                  ? round((met.clicks / met.impressions) * 100, 2)
                  : 0,
              impressions: met.impressions,
              clicks: met.clicks,
              conversions: met.conversions,
              frequency: round(met.frequency, 2),
            }
          : null,
      };
    }
  );

  const enrichedAdSets = (adSets ?? []).map(
    (as: {
      id: string;
      name: string | null;
      meta_adset_id: string | null;
      meta_campaign_id: string | null;
      countries: string[];
      language: string;
      status: string;
      daily_budget: number;
      created_at: string;
      meta_ads: Array<{
        id: string;
        name: string;
        meta_ad_id: string | null;
        image_url: string | null;
        headline: string | null;
        ad_copy: string | null;
        status: string;
        created_at: string;
      }>;
    }) => ({
      id: as.id,
      name: as.name,
      metaAdsetId: as.meta_adset_id,
      metaCampaignId: as.meta_campaign_id,
      countries: as.countries,
      language: as.language,
      status: as.status,
      dailyBudget: as.daily_budget,
      createdAt: as.created_at,
      ads: (as.meta_ads ?? []).map((ad) => {
        const perf = ad.meta_ad_id ? adPerfMap.get(ad.meta_ad_id) : null;
        return {
          id: ad.id,
          name: ad.name,
          metaAdId: ad.meta_ad_id,
          imageUrl: ad.image_url,
          headline: ad.headline,
          adCopy: ad.ad_copy,
          status: ad.status,
          performance: perf
            ? {
                spend: round(perf.spend),
                revenue: round(perf.revenue),
                roas:
                  perf.spend > 0 ? round(perf.revenue / perf.spend) : 0,
                ctr:
                  perf.impressions > 0
                    ? round((perf.clicks / perf.impressions) * 100, 2)
                    : 0,
                cpa:
                  perf.purchases > 0
                    ? round(perf.spend / perf.purchases)
                    : 0,
                purchases: perf.purchases,
              }
            : null,
        };
      }),
    })
  );

  // Sort source images by processing_order
  const sortedImages = (
    job.source_images as Array<{
      id: string;
      original_url: string;
      thumbnail_url: string | null;
      filename: string | null;
      processing_order: number | null;
    }>
  )
    ?.sort(
      (a, b) => (a.processing_order ?? 0) - (b.processing_order ?? 0)
    ) ?? [];

  return NextResponse.json({
    concept: {
      id: job.id,
      name: job.name,
      product: job.product,
      status: job.status,
      conceptNumber: job.concept_number,
      cashDna: job.cash_dna,
      adCopyPrimary: job.ad_copy_primary ?? [],
      adCopyHeadline: job.ad_copy_headline ?? [],
      tags: job.tags ?? [],
      iterationOf: job.iteration_of,
      iterationType: job.iteration_type,
      createdAt: job.created_at,
    },
    sourceImages: sortedImages.map((img) => ({
      id: img.id,
      url: img.thumbnail_url || img.original_url,
      originalUrl: img.original_url,
      filename: img.filename,
    })),
    markets: enrichedMarkets,
    adSets: enrichedAdSets,
    parentConcept,
    iterations: iterations ?? [],
  });
}

function round(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
