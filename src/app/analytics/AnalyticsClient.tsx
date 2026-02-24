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
  shopify: {
    orders: number;
    revenue: number;
    avgOrderValue: number;
    currency: string;
  } | null;
  roas: number | null;
  dateRange: { since: string; until: string };
  errors?: { meta?: string; shopify?: string };
}

interface CampaignPerformance {
  name: string;
  internalId: string;
  product: string | null;
  language: string;
  metaCampaignId: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
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
}

const PERIOD_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

type SortField = "name" | "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "orders" | "revenue" | "roas";

export default function AnalyticsClient({
  metaConfigured,
  shopifyConfigured,
  ga4Configured,
  clarityConfigured,
}: {
  metaConfigured: boolean;
  shopifyConfigured: boolean;
  ga4Configured: boolean;
  clarityConfigured: boolean;
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
      setError("Failed to load analytics data. Try refreshing.");
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

  function formatCurrency(amount: number, currency = "USD") {
    if (currency === "USD") return `$${amount.toFixed(2)}`;
    return `${amount.toFixed(0)} ${currency}`;
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
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
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
              value={summary?.meta ? formatCurrency(summary.meta.spend) : "—"}
              sub={summary?.meta ? `${summary.meta.impressions.toLocaleString()} impressions` : undefined}
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
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCampaigns.map((c) => (
                      <tr key={c.internalId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="text-xs font-medium text-gray-800 truncate max-w-[240px]">{c.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {c.product && (
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                {c.product}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400 uppercase">{c.language}</span>
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
