"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Calculator,
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ArrowUpRight,
  Lightbulb,
  Target,
  AlertTriangle,
  Wallet,
  Activity,
  CheckCircle2,
  Link2,
  BarChart3,
  MoreHorizontal,
  Pause,
  ArrowUp,
  ArrowDown,
  GraduationCap,
  Dna,
  type LucideIcon,
} from "lucide-react";

interface AnalyticsSummary {
  meta: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
  } | null;
  googleAds: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
    cpm: number;
  } | null;
  shopify: {
    orders: number;
    revenue: number;
    avgOrderValue: number;
    currency: string;
  } | null;
  roas: number | null;
  totalAdSpend: number;
  dateRange: { since: string; until: string };
  errors?: { meta?: string; shopify?: string; googleAds?: string };
}

interface CampaignPerformance {
  name: string;
  internalId: string;
  source: "meta" | "google";
  product: string | null;
  language: string;
  metaCampaignId: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions?: number;
  orders: number;
  revenue: number;
  roas: number;
}

interface AIInsights {
  summary: string;
  top_performers: Array<{ name: string; reason: string }>;
  underperformers: Array<{ name: string; issue: string; recommendation: string }>;
  budget_recommendations: Array<{ action: string; campaign: string; reason: string }>;
  trends: string[];
  action_items: string[];
  coaching_tips?: Array<{
    priority: "high" | "medium" | "low";
    category: "budget" | "creative" | "audience" | "testing";
    tip: string;
    reasoning: string;
  }>;
  dna_insights?: {
    best_angle: string;
    best_style: string;
    iteration_suggestions: string[];
  };
}

interface QuickTip {
  id: string;
  icon: LucideIcon;
  text: string;
  severity: "info" | "warning" | "critical";
}

function generateQuickTips(
  campaigns: CampaignPerformance[],
  summary: AnalyticsSummary | null
): QuickTip[] {
  const tips: QuickTip[] = [];
  if (!campaigns.length || !summary) return tips;

  const withSpend = campaigns.filter((c) => c.spend > 5);
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);

  // 1. Underperformer ratio
  const underperformers = withSpend.filter((c) => c.roas < 1 && c.roas > 0);
  if (underperformers.length > 0 && withSpend.length > 2) {
    const pct = Math.round((underperformers.length / withSpend.length) * 100);
    const wastedSpend = underperformers.reduce((s, c) => s + c.spend, 0);
    tips.push({
      id: "underperformer-ratio",
      icon: AlertTriangle,
      text: `${underperformers.length} of ${withSpend.length} campaigns (${pct}%) have ROAS below 1x. ${wastedSpend.toFixed(0)} SEK spent with negative returns.`,
      severity: pct > 50 ? "critical" : "warning",
    });
  }

  // 2. Budget bleeding to losers
  const loserSpend = underperformers.reduce((s, c) => s + c.spend, 0);
  if (totalSpend > 0 && loserSpend / totalSpend > 0.3) {
    tips.push({
      id: "budget-waste",
      icon: Wallet,
      text: `${Math.round((loserSpend / totalSpend) * 100)}% of your ad budget (${loserSpend.toFixed(0)} SEK) is going to campaigns with negative ROAS.`,
      severity: "critical",
    });
  }

  // 3. Zero-order campaigns
  const zeroOrders = campaigns.filter((c) => c.spend > 10 && c.orders === 0);
  if (zeroOrders.length > 0) {
    tips.push({
      id: "zero-orders",
      icon: ShoppingCart,
      text: `${zeroOrders.length} campaign${zeroOrders.length > 1 ? "s" : ""} spending money (${zeroOrders.reduce((s, c) => s + c.spend, 0).toFixed(0)} SEK) with zero orders.`,
      severity: "warning",
    });
  }

  // 4. Revenue concentration
  if (totalRevenue > 0 && campaigns.length > 3) {
    const sorted = [...campaigns].sort((a, b) => b.revenue - a.revenue);
    const topTwo = sorted.slice(0, 2).reduce((s, c) => s + c.revenue, 0);
    if (topTwo / totalRevenue > 0.8) {
      tips.push({
        id: "revenue-concentration",
        icon: Target,
        text: `Top 2 campaigns generate ${Math.round((topTwo / totalRevenue) * 100)}% of revenue. Consider testing new creatives to diversify.`,
        severity: "info",
      });
    }
  }

  // 5. CPC market gap
  const byLang = new Map<string, { totalSpend: number; totalClicks: number }>();
  for (const c of campaigns) {
    if (!c.language || c.clicks === 0) continue;
    const entry = byLang.get(c.language) ?? { totalSpend: 0, totalClicks: 0 };
    entry.totalSpend += c.spend;
    entry.totalClicks += c.clicks;
    byLang.set(c.language, entry);
  }
  if (byLang.size >= 2) {
    const cpcs = Array.from(byLang.entries())
      .map(([lang, d]) => ({ lang, cpc: d.totalSpend / d.totalClicks }))
      .sort((a, b) => a.cpc - b.cpc);
    const cheapest = cpcs[0];
    const most = cpcs[cpcs.length - 1];
    if (most.cpc > cheapest.cpc * 1.5) {
      tips.push({
        id: "market-cpc-gap",
        icon: TrendingUp,
        text: `${most.lang.toUpperCase()} costs ${most.cpc.toFixed(2)} SEK/click vs ${cheapest.cpc.toFixed(2)} SEK in ${cheapest.lang.toUpperCase()}. Consider audience refinement for ${most.lang.toUpperCase()}.`,
        severity: "info",
      });
    }
  }

  // 6. Overall ROAS health
  if (summary.roas !== null && summary.roas > 0) {
    if (summary.roas < 1) {
      tips.push({
        id: "roas-negative",
        icon: AlertCircle,
        text: `Overall ROAS is ${summary.roas.toFixed(2)}x — you're spending more on ads than you're earning. Review your worst performers.`,
        severity: "critical",
      });
    } else if (summary.roas >= 3) {
      tips.push({
        id: "roas-strong",
        icon: TrendingUp,
        text: `ROAS of ${summary.roas.toFixed(2)}x is strong. Consider scaling budget on your top campaigns to capture more volume.`,
        severity: "info",
      });
    }
  }

  return tips;
}

const PERIOD_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

type SortField = "name" | "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "orders" | "revenue" | "roas";

export default function TrackingClient({
  metaConfigured,
  shopifyConfigured,
  ga4Configured,
  clarityConfigured,
  googleAdsConfigured,
}: {
  metaConfigured: boolean;
  shopifyConfigured: boolean;
  ga4Configured: boolean;
  clarityConfigured: boolean;
  googleAdsConfigured: boolean;
}) {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // AI insights
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsCost, setInsightsCost] = useState<number | null>(null);
  const [insightsError, setInsightsError] = useState("");

  // Sort
  const [sortField, setSortField] = useState<SortField>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, perfRes] = await Promise.all([
        fetch(`/api/analytics/summary?days=${days}`),
        fetch(`/api/analytics/performance?days=${days}`),
      ]);
      if (!summaryRes.ok || !perfRes.ok) throw new Error("Failed to load analytics");
      const [summaryData, perfData] = await Promise.all([
        summaryRes.json(),
        perfRes.json(),
      ]);
      setSummary(summaryData);
      setCampaigns(perfData.campaigns);
    } catch {
      setError("Failed to load tracking data. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Clear insights when date range changes
  useEffect(() => {
    setInsights(null);
    setInsightsCost(null);
    setInsightsError("");
  }, [days]);

  async function handleAnalyze() {
    setInsightsLoading(true);
    setInsightsError("");
    try {
      const res = await fetch("/api/analytics/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setInsights(data.insights);
      setInsightsCost(data.cost?.cost_usd ?? null);
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setInsightsLoading(false);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const av = a[sortField] ?? "";
    const bv = b[sortField] ?? "";
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  function formatCurrency(amount: number, currency = "SEK") {
    return `${amount.toFixed(currency === "SEK" ? 0 : 2)} ${currency}`;
  }

  function roasColor(roas: number): string {
    if (roas >= 2) return "text-emerald-600";
    if (roas >= 1) return "text-amber-600";
    return "text-red-500";
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-0.5" />
    );
  }

  const currency = summary?.shopify?.currency || "SEK";

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Ad Tracking</h1>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                days === opt.value
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Not configured warnings */}
          {(!metaConfigured || !shopifyConfigured) && (
            <div className="flex items-center gap-4 mb-6">
              {!metaConfigured && (
                <div className="flex items-center gap-2 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Meta Ads not connected
                  <Link href="/settings" className="underline ml-1">Settings</Link>
                </div>
              )}
              {!shopifyConfigured && (
                <div className="flex items-center gap-2 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Shopify not connected
                  <Link href="/settings" className="underline ml-1">Settings</Link>
                </div>
              )}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <SummaryCard
              icon={<DollarSign className="w-4 h-4 text-red-500" />}
              label="Ad Spend"
              value={summary?.totalAdSpend ? formatCurrency(summary.totalAdSpend) : "—"}
              sub={
                summary?.meta && summary?.googleAds
                  ? `Meta: ${formatCurrency(summary.meta.spend)} / Google: ${formatCurrency(summary.googleAds.spend)}`
                  : summary?.meta
                  ? `${summary.meta.impressions.toLocaleString()} impressions`
                  : summary?.googleAds
                  ? `${summary.googleAds.impressions.toLocaleString()} impressions`
                  : undefined
              }
            />
            <SummaryCard
              icon={<ShoppingCart className="w-4 h-4 text-emerald-600" />}
              label="Revenue"
              value={summary?.shopify ? formatCurrency(summary.shopify.revenue, currency) : "—"}
              sub={summary?.shopify ? `${summary.shopify.orders} orders` : undefined}
            />
            <SummaryCard
              icon={<TrendingUp className="w-4 h-4 text-indigo-600" />}
              label="ROAS"
              value={summary?.roas !== null && summary?.roas !== undefined ? `${summary.roas.toFixed(2)}x` : "—"}
              valueClass={summary?.roas ? roasColor(summary.roas) : undefined}
              sub={summary?.roas !== null ? "revenue / spend" : undefined}
            />
            <SummaryCard
              icon={<Package className="w-4 h-4 text-blue-500" />}
              label="Orders"
              value={summary?.shopify ? String(summary.shopify.orders) : "—"}
              sub={summary?.meta ? `${summary.meta.clicks.toLocaleString()} clicks` : undefined}
            />
            <SummaryCard
              icon={<Calculator className="w-4 h-4 text-purple-500" />}
              label="Avg Order"
              value={summary?.shopify ? formatCurrency(summary.shopify.avgOrderValue, currency) : "—"}
              sub={summary?.meta ? `CPC: ${formatCurrency(summary.meta.cpc)}` : undefined}
            />
          </div>

          {/* Quick Tips — AI Coach */}
          <QuickTipsStrip campaigns={campaigns} summary={summary} />

          {/* Performance table */}
          {campaigns.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mb-6">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-sm font-medium text-gray-700">Campaign Performance</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <Th field="name" label="Campaign" onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                      <Th field="spend" label="Spend" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <Th field="impressions" label="Impr." onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <Th field="clicks" label="Clicks" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <Th field="ctr" label="CTR" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <Th field="cpc" label="CPC" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <Th field="orders" label="Orders" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <Th field="revenue" label="Revenue" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <Th field="roas" label="ROAS" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <th className="px-3 py-3 text-xs uppercase tracking-wider font-medium text-gray-400 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCampaigns.map((c) => (
                      <tr key={c.internalId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="text-xs font-medium text-gray-800 truncate max-w-[240px]">{c.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              c.source === "google"
                                ? "bg-blue-50 text-blue-600"
                                : "bg-indigo-50 text-indigo-600"
                            }`}>
                              {c.source === "google" ? "Google" : "Meta"}
                            </span>
                            {c.product && (
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                {c.product}
                              </span>
                            )}
                            {c.language && <span className="text-[10px] text-gray-400 uppercase">{c.language}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 text-right tabular-nums">
                          {formatCurrency(c.spend)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 text-right tabular-nums">
                          {c.impressions.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 text-right tabular-nums">
                          {c.clicks.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 text-right tabular-nums">
                          {c.ctr.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 text-right tabular-nums">
                          {formatCurrency(c.cpc)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 text-right tabular-nums font-medium">
                          {c.orders}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 text-right tabular-nums font-medium">
                          {c.revenue > 0 ? formatCurrency(c.revenue, currency) : "—"}
                        </td>
                        <td className={`px-4 py-2.5 text-xs text-right tabular-nums font-semibold ${roasColor(c.roas)}`}>
                          {c.roas > 0 ? `${c.roas.toFixed(2)}x` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <CampaignActionsDropdown />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {campaigns.length === 0 && !loading && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center mb-6">
              <BarChart3 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No campaign data for this period.</p>
              <p className="text-xs text-gray-400 mt-1">Push ads to Meta from the Ad Concepts page to see performance data here.</p>
            </div>
          )}

          {/* AI Insights */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-medium text-gray-700">AI Insights</h2>
              </div>
              <div className="flex items-center gap-3">
                {insightsCost !== null && (
                  <span className="text-[10px] text-gray-400">Cost: ${insightsCost.toFixed(4)}</span>
                )}
                <button
                  onClick={handleAnalyze}
                  disabled={insightsLoading || (!metaConfigured && !shopifyConfigured)}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  {insightsLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {insightsLoading ? "Analyzing..." : "Analyze with AI"}
                </button>
              </div>
            </div>

            {insightsError && (
              <div className="px-4 py-3 text-sm text-red-600 bg-red-50">
                {insightsError}
              </div>
            )}

            {insights ? (
              <div className="p-4 space-y-4">
                {/* Summary */}
                <div className="bg-indigo-50 rounded-lg p-3">
                  <p className="text-sm text-indigo-800">{insights.summary}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Top performers */}
                  {insights.top_performers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Top Performers</span>
                      </div>
                      <div className="space-y-2">
                        {insights.top_performers.map((p, i) => (
                          <div key={i} className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                            <p className="text-xs font-medium text-emerald-800">{p.name}</p>
                            <p className="text-xs text-emerald-600 mt-0.5">{p.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Underperformers */}
                  {insights.underperformers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Needs Attention</span>
                      </div>
                      <div className="space-y-2">
                        {insights.underperformers.map((u, i) => (
                          <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-2.5">
                            <p className="text-xs font-medium text-red-800">{u.name}</p>
                            <p className="text-xs text-red-600 mt-0.5">{u.issue}</p>
                            <p className="text-xs text-red-500 mt-0.5 italic">{u.recommendation}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Budget recommendations */}
                {insights.budget_recommendations.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Wallet className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Budget Recommendations</span>
                    </div>
                    <div className="space-y-1.5">
                      {insights.budget_recommendations.map((b, i) => (
                        <div key={i} className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                            b.action === "increase" ? "bg-emerald-100 text-emerald-700" :
                            b.action === "pause" ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>
                            {b.action}
                          </span>
                          <div className="flex-1">
                            <p className="text-xs font-medium text-blue-800">{b.campaign}</p>
                            <p className="text-xs text-blue-600 mt-0.5">{b.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trends + Action items side by side */}
                <div className="grid grid-cols-2 gap-4">
                  {insights.trends.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Activity className="w-3.5 h-3.5 text-purple-500" />
                        <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Trends</span>
                      </div>
                      <ul className="space-y-1">
                        {insights.trends.map((t, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                            <Lightbulb className="w-3 h-3 text-purple-400 mt-0.5 shrink-0" />
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {insights.action_items.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Target className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Action Items</span>
                      </div>
                      <ul className="space-y-1">
                        {insights.action_items.map((a, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                            <CheckCircle2 className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Coaching Tips */}
                {insights.coaching_tips && insights.coaching_tips.length > 0 && (
                  <CoachingTipsPanel tips={insights.coaching_tips} />
                )}

                {/* DNA Insights */}
                {insights.dna_insights && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Dna className="w-3.5 h-3.5 text-violet-500" />
                      <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Creative DNA Insights
                      </span>
                    </div>
                    <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-violet-800">
                        <strong>Best angle:</strong> {insights.dna_insights.best_angle}
                      </p>
                      <p className="text-xs text-violet-800">
                        <strong>Best style:</strong> {insights.dna_insights.best_style}
                      </p>
                      {insights.dna_insights.iteration_suggestions.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-violet-700 mb-1">Iteration suggestions:</p>
                          <ul className="list-disc list-inside text-xs text-violet-700 space-y-0.5">
                            {insights.dna_insights.iteration_suggestions.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : !insightsLoading ? (
              <div className="px-4 py-6 text-center">
                <Sparkles className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">
                  Click &quot;Analyze with AI&quot; to get performance insights, budget recommendations, and actionable suggestions.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <span className="text-sm text-gray-500 ml-2">Analyzing your data...</span>
              </div>
            )}
          </div>

          {/* GA4 + Clarity panels */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`bg-white border rounded-xl p-6 text-center ${ga4Configured ? "border-gray-200" : "border-dashed border-gray-300"}`}>
              <BarChart3 className={`w-6 h-6 mx-auto mb-2 ${ga4Configured ? "text-emerald-500" : "text-gray-300"}`} />
              <p className="text-sm font-medium text-gray-500">Google Analytics 4</p>
              {ga4Configured ? (
                <p className="inline-flex items-center gap-1 text-xs text-emerald-600 mt-2">
                  <CheckCircle2 className="w-3 h-3" />
                  Connected
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mt-1">Connect GA4 to see pageviews, sessions, and user behavior data.</p>
                  <Link
                    href="/settings"
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 mt-3"
                  >
                    <Link2 className="w-3 h-3" />
                    Connect in Settings
                  </Link>
                </>
              )}
            </div>
            <div className={`bg-white border rounded-xl p-6 text-center ${clarityConfigured ? "border-gray-200" : "border-dashed border-gray-300"}`}>
              <Activity className={`w-6 h-6 mx-auto mb-2 ${clarityConfigured ? "text-emerald-500" : "text-gray-300"}`} />
              <p className="text-sm font-medium text-gray-500">Microsoft Clarity</p>
              {clarityConfigured ? (
                <p className="inline-flex items-center gap-1 text-xs text-emerald-600 mt-2">
                  <CheckCircle2 className="w-3 h-3" />
                  Connected
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mt-1">Connect Clarity to see heatmaps, session recordings, and UX insights.</p>
                  <Link
                    href="/settings"
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 mt-3"
                  >
                    <Link2 className="w-3 h-3" />
                    Connect in Settings
                  </Link>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Subcomponents ----

function SummaryCard({
  icon,
  label,
  value,
  valueClass,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-semibold ${valueClass || "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Th({
  field,
  label,
  onSort,
  sortField,
  sortDir,
  right,
}: {
  field: SortField;
  label: string;
  onSort: (f: SortField) => void;
  sortField: SortField;
  sortDir: "asc" | "desc";
  right?: boolean;
}) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-4 py-3 text-xs uppercase tracking-wider font-medium cursor-pointer hover:text-gray-600 select-none ${
        right ? "text-right" : ""
      } ${active ? "text-indigo-600" : "text-gray-400"}`}
    >
      {label}
      {active && (
        sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />
      )}
    </th>
  );
}

function QuickTipsStrip({
  campaigns,
  summary,
}: {
  campaigns: CampaignPerformance[];
  summary: AnalyticsSummary | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const tips = generateQuickTips(campaigns, summary);

  if (tips.length === 0) return null;

  const visibleTips = expanded ? tips : tips.slice(0, 4);

  const severityStyles: Record<string, string> = {
    critical: "bg-red-50 border-red-200 text-red-700",
    warning: "bg-amber-50 border-amber-200 text-amber-700",
    info: "bg-blue-50 border-blue-200 text-blue-700",
  };

  const iconStyles: Record<string, string> = {
    critical: "text-red-500",
    warning: "text-amber-500",
    info: "text-blue-500",
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap className="w-4 h-4 text-indigo-500" />
        <h2 className="text-sm font-medium text-gray-700">AI Coach Tips</h2>
        <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">
          {tips.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {visibleTips.map((tip) => {
          const Icon = tip.icon;
          return (
            <div
              key={tip.id}
              className={`flex items-start gap-2.5 border rounded-lg p-3 ${severityStyles[tip.severity]}`}
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconStyles[tip.severity]}`} />
              <p className="text-xs leading-relaxed">{tip.text}</p>
            </div>
          );
        })}
      </div>
      {tips.length > 4 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mt-2 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Show all {tips.length} tips
            </>
          )}
        </button>
      )}
    </div>
  );
}

function CampaignActionsDropdown() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        title="Actions"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44">
            <button
              disabled
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-400 cursor-not-allowed"
              title="Coming soon"
            >
              <Pause className="w-3 h-3" />
              Pause ad set
              <span className="ml-auto text-[9px] bg-gray-100 text-gray-400 px-1 rounded">Soon</span>
            </button>
            <button
              disabled
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-400 cursor-not-allowed"
              title="Coming soon"
            >
              <ArrowUp className="w-3 h-3" />
              Scale budget +20%
              <span className="ml-auto text-[9px] bg-gray-100 text-gray-400 px-1 rounded">Soon</span>
            </button>
            <button
              disabled
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-400 cursor-not-allowed"
              title="Coming soon"
            >
              <ArrowDown className="w-3 h-3" />
              Cut budget -20%
              <span className="ml-auto text-[9px] bg-gray-100 text-gray-400 px-1 rounded">Soon</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-blue-100 text-blue-700",
};

const CATEGORY_STYLES: Record<string, string> = {
  budget: "bg-emerald-50 text-emerald-600",
  creative: "bg-purple-50 text-purple-600",
  audience: "bg-indigo-50 text-indigo-600",
  testing: "bg-cyan-50 text-cyan-600",
};

function CoachingTipsPanel({
  tips,
}: {
  tips: NonNullable<AIInsights["coaching_tips"]>;
}) {
  const [expandedTip, setExpandedTip] = useState<number | null>(null);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Coach Tips</span>
      </div>
      <div className="space-y-2">
        {tips.map((tip, i) => (
          <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_STYLES[tip.priority] || PRIORITY_STYLES.low}`}>
                {tip.priority}
              </span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${CATEGORY_STYLES[tip.category] || CATEGORY_STYLES.testing}`}>
                {tip.category}
              </span>
              <p className="text-xs font-medium text-gray-800 flex-1">{tip.tip}</p>
              <button
                onClick={() => setExpandedTip(expandedTip === i ? null : i)}
                className="text-gray-400 hover:text-gray-600 shrink-0"
              >
                {expandedTip === i ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            {expandedTip === i && (
              <p className="text-xs text-gray-500 mt-2 ml-0.5 border-t border-gray-200 pt-2">{tip.reasoning}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
