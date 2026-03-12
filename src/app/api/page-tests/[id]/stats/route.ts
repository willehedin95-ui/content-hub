import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Verify page test belongs to current workspace
  const { data: test, error: testError } = await db
    .from("page_tests")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (testError || !test) {
    return NextResponse.json({ error: "Page test not found" }, { status: 404 });
  }

  // Get all ad sets linked to this page test
  const { data: adsets, error: adsetsError } = await db
    .from("page_test_adsets")
    .select("variant, meta_adset_id, language, country")
    .eq("page_test_id", id);

  if (adsetsError) {
    return safeError(adsetsError, "Failed to fetch test ad sets");
  }

  if (!adsets || adsets.length === 0) {
    return NextResponse.json({ variants: { a: null, b: null }, byMarket: [] });
  }

  // Get all ad set IDs to query performance data
  const adsetIds = adsets.map((a) => a.meta_adset_id);

  const { data: perfData, error: perfError } = await db
    .from("meta_adset_performance")
    .select("adset_id, spend, impressions, clicks, purchases, purchase_value, ctr, date")
    .in("adset_id", adsetIds);

  if (perfError) {
    return safeError(perfError, "Failed to fetch performance data");
  }

  // Build lookup: meta_adset_id -> variant
  const adsetToVariant = new Map<string, string>();
  const adsetToCountry = new Map<string, string>();
  for (const a of adsets) {
    adsetToVariant.set(a.meta_adset_id, a.variant);
    adsetToCountry.set(a.meta_adset_id, a.country);
  }

  // Aggregate by variant (total)
  const totals: Record<string, {
    spend: number; impressions: number; clicks: number;
    purchases: number; revenue: number; days: Set<string>;
  }> = {
    a: { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, days: new Set() },
    b: { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, days: new Set() },
  };

  // Aggregate by variant + country
  const byMarketKey = new Map<string, {
    variant: string; country: string;
    spend: number; impressions: number; clicks: number;
    purchases: number; revenue: number;
  }>();

  for (const row of perfData ?? []) {
    const variant = adsetToVariant.get(row.adset_id);
    const country = adsetToCountry.get(row.adset_id);
    if (!variant || !totals[variant]) continue;

    const spend = Number(row.spend) || 0;
    const impressions = Number(row.impressions) || 0;
    const clicks = Number(row.clicks) || 0;
    const purchases = Number(row.purchases) || 0;
    const revenue = Number(row.purchase_value) || 0;

    totals[variant].spend += spend;
    totals[variant].impressions += impressions;
    totals[variant].clicks += clicks;
    totals[variant].purchases += purchases;
    totals[variant].revenue += revenue;
    totals[variant].days.add(row.date);

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

  function computeMetrics(t: typeof totals["a"]) {
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

  // Statistical significance (Z-test on conversion rate: purchases / clicks)
  let significance: { confident: boolean; p_value: number; winner: string | null; sample_size_ok: boolean } | null = null;
  const a = totals.a;
  const b = totals.b;
  const minSample = 30; // minimum clicks per variant

  if (a.clicks >= minSample && b.clicks >= minSample) {
    const p1 = a.purchases / a.clicks;
    const p2 = b.purchases / b.clicks;
    const pPooled = (a.purchases + b.purchases) / (a.clicks + b.clicks);
    const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / a.clicks + 1 / b.clicks));

    if (se > 0) {
      const z = (p2 - p1) / se;
      // Two-tailed p-value approximation
      const absZ = Math.abs(z);
      const pValue = 2 * (1 - normalCDF(absZ));

      significance = {
        confident: pValue < 0.05,
        p_value: Math.round(pValue * 10000) / 10000,
        winner: pValue < 0.05 ? (p2 > p1 ? "b" : "a") : null,
        sample_size_ok: true,
      };
    }
  } else {
    significance = {
      confident: false,
      p_value: 1,
      winner: null,
      sample_size_ok: false,
    };
  }

  return NextResponse.json({
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
  });
}

/** Standard normal CDF approximation */
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
