import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const pageAId = req.nextUrl.searchParams.get("page_a_id");
  const pageBId = req.nextUrl.searchParams.get("page_b_id");

  if (!pageAId || !pageBId) {
    return NextResponse.json(
      { error: "page_a_id and page_b_id are required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Fetch all page_tests for this page pair
  const { data: tests, error: testsError } = await db
    .from("page_tests")
    .select(
      "id, image_job_id, image_jobs(id, name, concept_number, source_images(original_url))"
    )
    .eq("workspace_id", workspaceId)
    .eq("page_a_id", pageAId)
    .eq("page_b_id", pageBId);

  if (testsError) {
    return safeError(testsError, "Failed to fetch page tests");
  }

  if (!tests || tests.length === 0) {
    return NextResponse.json({
      aggregated: { variants: { a: null, b: null }, byMarket: [], significance: null },
      perConcept: [],
    });
  }

  const testIds = tests.map((t) => t.id);

  // Get all ad sets linked to these tests
  const { data: adsets, error: adsetsError } = await db
    .from("page_test_adsets")
    .select("page_test_id, variant, meta_adset_id, language, country")
    .in("page_test_id", testIds);

  if (adsetsError) {
    return safeError(adsetsError, "Failed to fetch test ad sets");
  }

  if (!adsets || adsets.length === 0) {
    return NextResponse.json({
      aggregated: { variants: { a: null, b: null }, byMarket: [], significance: null },
      perConcept: [],
    });
  }

  // Fetch performance data for all ad sets
  const adsetIds = adsets.map((a) => a.meta_adset_id);
  const { data: perfData, error: perfError } = await db
    .from("meta_adset_performance")
    .select("adset_id, spend, impressions, clicks, purchases, purchase_value, date")
    .in("adset_id", adsetIds);

  if (perfError) {
    return safeError(perfError, "Failed to fetch performance data");
  }

  // Build lookups
  const adsetToVariant = new Map<string, string>();
  const adsetToCountry = new Map<string, string>();
  const adsetToTestId = new Map<string, string>();
  for (const a of adsets) {
    adsetToVariant.set(a.meta_adset_id, a.variant);
    adsetToCountry.set(a.meta_adset_id, a.country);
    adsetToTestId.set(a.meta_adset_id, a.page_test_id);
  }

  // --- Aggregated totals ---
  const totals: Record<
    string,
    { spend: number; impressions: number; clicks: number; purchases: number; revenue: number; days: Set<string> }
  > = {
    a: { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, days: new Set() },
    b: { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, days: new Set() },
  };

  // --- Per-concept totals ---
  const perConceptTotals = new Map<
    string,
    {
      a: { spend: number; impressions: number; clicks: number; purchases: number; revenue: number; days: Set<string> };
      b: { spend: number; impressions: number; clicks: number; purchases: number; revenue: number; days: Set<string> };
    }
  >();
  for (const t of tests) {
    perConceptTotals.set(t.id, {
      a: { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, days: new Set() },
      b: { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, days: new Set() },
    });
  }

  // --- By market ---
  const byMarketKey = new Map<
    string,
    { variant: string; country: string; spend: number; impressions: number; clicks: number; purchases: number; revenue: number }
  >();

  for (const row of perfData ?? []) {
    const variant = adsetToVariant.get(row.adset_id);
    const country = adsetToCountry.get(row.adset_id);
    const testId = adsetToTestId.get(row.adset_id);
    if (!variant || !totals[variant]) continue;

    const spend = Number(row.spend) || 0;
    const impressions = Number(row.impressions) || 0;
    const clicks = Number(row.clicks) || 0;
    const purchases = Number(row.purchases) || 0;
    const revenue = Number(row.purchase_value) || 0;

    // Aggregated
    totals[variant].spend += spend;
    totals[variant].impressions += impressions;
    totals[variant].clicks += clicks;
    totals[variant].purchases += purchases;
    totals[variant].revenue += revenue;
    totals[variant].days.add(row.date);

    // Per concept
    if (testId && perConceptTotals.has(testId)) {
      const ct = perConceptTotals.get(testId)!;
      const cv = ct[variant as "a" | "b"];
      cv.spend += spend;
      cv.impressions += impressions;
      cv.clicks += clicks;
      cv.purchases += purchases;
      cv.revenue += revenue;
      cv.days.add(row.date);
    }

    // By market
    const mKey = `${variant}:${country}`;
    if (!byMarketKey.has(mKey)) {
      byMarketKey.set(mKey, { variant, country: country!, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 });
    }
    const m = byMarketKey.get(mKey)!;
    m.spend += spend;
    m.impressions += impressions;
    m.clicks += clicks;
    m.purchases += purchases;
    m.revenue += revenue;
  }

  // Build per-concept results
  const perConcept = tests.map((t) => {
    const ct = perConceptTotals.get(t.id)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = t.image_jobs as any as { id: string; name: string; concept_number: number | null; source_images: Array<{ original_url: string }> } | null;
    return {
      conceptId: job?.id ?? t.image_job_id,
      conceptName: job?.name ?? "Unknown",
      conceptNumber: job?.concept_number ?? null,
      thumbnail: job?.source_images?.[0]?.original_url ?? null,
      variants: {
        a: computeMetrics(ct.a),
        b: computeMetrics(ct.b),
      },
    };
  });

  // Significance (Z-test on aggregated CVR)
  const significance = computeSignificance(totals.a, totals.b);

  return NextResponse.json({
    aggregated: {
      variants: {
        a: computeMetrics(totals.a),
        b: computeMetrics(totals.b),
      },
      byMarket: Array.from(byMarketKey.values()).map((m) => ({
        ...m,
        roas: m.spend > 0 ? Math.round((m.revenue / m.spend) * 100) / 100 : 0,
        cpa: m.purchases > 0 ? Math.round((m.spend / m.purchases) * 100) / 100 : 0,
      })),
      significance,
    },
    perConcept,
  });
}

function computeMetrics(t: {
  spend: number; impressions: number; clicks: number;
  purchases: number; revenue: number; days: Set<string>;
}) {
  return {
    spend: Math.round(t.spend * 100) / 100,
    impressions: t.impressions,
    clicks: t.clicks,
    purchases: t.purchases,
    revenue: Math.round(t.revenue * 100) / 100,
    ctr: t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : 0,
    roas: t.spend > 0 ? Math.round((t.revenue / t.spend) * 100) / 100 : 0,
    cpa: t.purchases > 0 ? Math.round((t.spend / t.purchases) * 100) / 100 : 0,
    cvr: t.clicks > 0 ? Math.round((t.purchases / t.clicks) * 10000) / 100 : 0,
    days: t.days.size,
  };
}

function computeSignificance(
  a: { clicks: number; purchases: number },
  b: { clicks: number; purchases: number }
) {
  const minSample = 30;
  if (a.clicks >= minSample && b.clicks >= minSample) {
    const p1 = a.purchases / a.clicks;
    const p2 = b.purchases / b.clicks;
    const pPooled = (a.purchases + b.purchases) / (a.clicks + b.clicks);
    const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / a.clicks + 1 / b.clicks));
    if (se > 0) {
      const z = (p2 - p1) / se;
      const absZ = Math.abs(z);
      const pValue = 2 * (1 - normalCDF(absZ));
      return {
        confident: pValue < 0.05,
        p_value: Math.round(pValue * 10000) / 10000,
        winner: pValue < 0.05 ? (p2 > p1 ? "b" : "a") : null,
        sample_size_ok: true,
      };
    }
  }
  return { confident: false, p_value: 1, winner: null, sample_size_ok: a.clicks < minSample || b.clicks < minSample ? false : true };
}

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}
