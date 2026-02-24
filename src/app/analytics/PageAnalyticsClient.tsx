"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  LineChart,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CheckCircle2,
  Link2,
  Activity,
  BarChart3,
  ShoppingCart,
  MousePointerClick,
  ArrowUpRight,
  Target,
  Eye,
} from "lucide-react";

interface GA4Metrics {
  screenPageViews: number;
  sessions: number;
  totalUsers: number;
  bounceRate: number;
  averageSessionDuration: number;
  engagementRate: number;
  conversions: number;
}

interface ClarityEntry {
  url: string;
  totalSessionCount: number;
  scrollDepth: number;
  activeTime: number;
  deadClickCount: number;
  rageClickCount: number;
  quickbackClickCount: number;
  excessiveScrollCount: number;
}

interface ShopifyData {
  orders: number;
  revenue: number;
  currency: string;
}

interface PageMetricsData {
  ga4: Record<string, GA4Metrics>;
  clarity: ClarityEntry[];
  shopify: Record<string, ShopifyData>;
  errors: Record<string, string>;
  days: number;
}

interface PageInsights {
  summary: string;
  best_pages: Array<{ page: string; language: string; reason: string }>;
  worst_pages: Array<{ page: string; language: string; issue: string; recommendation: string }>;
  ux_issues: Array<{ page: string; signal: string; severity: string; recommendation: string }>;
  cross_market: string[];
  action_items: string[];
}

const PERIOD_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

const LANGUAGES = ["sv", "da", "no"] as const;
const LANG_LABELS: Record<string, string> = { sv: "Swedish", da: "Danish", no: "Norwegian" };

type SortField = "path" | "views" | "sessions" | "bounceRate" | "orders" | "revenue";

export default function PageAnalyticsClient({
  ga4Configured,
  clarityConfigured,
  shopifyConfigured,
}: {
  ga4Configured: boolean;
  clarityConfigured: boolean;
  shopifyConfigured: boolean;
}) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<PageMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // AI insights
  const [insights, setInsights] = useState<PageInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsCost, setInsightsCost] = useState<number | null>(null);
  const [insightsError, setInsightsError] = useState("");

  // Table state
  const [sortField, setSortField] = useState<SortField>("views");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/analytics/page-metrics?days=${days}`);
      if (!res.ok) throw new Error("Failed to load analytics");
      setData(await res.json());
    } catch {
      setError("Failed to load page analytics. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setInsights(null);
    setInsightsCost(null);
    setInsightsError("");
  }, [days]);

  async function handleAnalyze() {
    setInsightsLoading(true);
    setInsightsError("");
    try {
      const res = await fetch("/api/analytics/page-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Analysis failed");
      setInsights(result.insights);
      setInsightsCost(result.cost?.cost_usd ?? null);
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

  // Aggregate GA4 data by page path (across languages)
  const pageRows = buildPageRows(data);
  const sortedPages = [...pageRows].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const anyConfigured = ga4Configured || clarityConfigured || shopifyConfigured;

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LineChart className="w-6 h-6 text-indigo-600" />
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

      {/* Connection status */}
      {!anyConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-2">
            <AlertTriangle className="w-4 h-4" />
            No data sources connected
          </div>
          <p className="text-xs text-amber-600">
            Connect GA4, Clarity, or Shopify in{" "}
            <Link href="/settings" className="underline">Settings</Link>{" "}
            to see page analytics.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Data source errors */}
      {data?.errors && Object.keys(data.errors).length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          {Object.entries(data.errors).map(([source, msg]) => (
            <div key={source} className="flex items-center gap-2 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              {source}: {msg}
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {data && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <SummaryCard
                icon={<Eye className="w-4 h-4 text-blue-500" />}
                label="Total Views"
                value={pageRows.reduce((s, r) => s + r.views, 0).toLocaleString()}
                sub={`${pageRows.length} pages tracked`}
              />
              <SummaryCard
                icon={<Activity className="w-4 h-4 text-purple-500" />}
                label="Avg Bounce Rate"
                value={pageRows.length > 0
                  ? `${(pageRows.reduce((s, r) => s + r.bounceRate, 0) / pageRows.length * 100).toFixed(1)}%`
                  : "—"}
              />
              <SummaryCard
                icon={<ShoppingCart className="w-4 h-4 text-emerald-600" />}
                label="Total Orders"
                value={pageRows.reduce((s, r) => s + r.orders, 0).toLocaleString()}
                sub={shopifyConfigured ? "via utm_campaign" : "Shopify not connected"}
              />
              <SummaryCard
                icon={<MousePointerClick className="w-4 h-4 text-orange-500" />}
                label="UX Issues"
                value={String(data.clarity.filter((c) => c.rageClickCount > 0 || c.deadClickCount > 5).length)}
                sub={clarityConfigured ? "pages with rage/dead clicks" : "Clarity not connected"}
              />
            </div>
          )}

          {/* Page table */}
          {pageRows.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mb-6">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-sm font-medium text-gray-700">Page Performance</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="px-4 py-3 w-8" />
                      <Th field="path" label="Page" onSort={handleSort} sortField={sortField} sortDir={sortDir} />
                      {LANGUAGES.map((lang) => (
                        <th key={lang} className="px-3 py-3 text-xs uppercase tracking-wider font-medium text-gray-400 text-center" colSpan={1}>
                          {lang.toUpperCase()}
                        </th>
                      ))}
                      <Th field="views" label="Views" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <Th field="sessions" label="Sessions" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <Th field="bounceRate" label="Bounce" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <Th field="orders" label="Orders" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                      <Th field="revenue" label="Revenue" onSort={handleSort} sortField={sortField} sortDir={sortDir} right />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPages.map((row) => {
                      const isExpanded = expandedRow === row.path;
                      const clarityData = findClarityForPage(row.path, data?.clarity ?? []);
                      return (
                        <PageRow
                          key={row.path}
                          row={row}
                          isExpanded={isExpanded}
                          onToggle={() => setExpandedRow(isExpanded ? null : row.path)}
                          clarityData={clarityData}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            !loading && anyConfigured && (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center mb-6">
                <BarChart3 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No page data for this period.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Publish pages and wait for traffic data to appear in GA4.
                </p>
              </div>
            )
          )}

          {/* UX Quality Card */}
          {data && data.clarity.length > 0 && (
            <UXQualityCard clarity={data.clarity} />
          )}

          {/* AI Insights */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-medium text-gray-700">AI Conversion Insights</h2>
              </div>
              <div className="flex items-center gap-3">
                {insightsCost !== null && (
                  <span className="text-[10px] text-gray-400">Cost: ${insightsCost.toFixed(4)}</span>
                )}
                <button
                  onClick={handleAnalyze}
                  disabled={insightsLoading || !anyConfigured}
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
              <InsightsPanel insights={insights} />
            ) : !insightsLoading ? (
              <div className="px-4 py-6 text-center">
                <Sparkles className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">
                  Click &quot;Analyze with AI&quot; to get conversion optimization insights from GA4, Clarity, and Shopify data.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <span className="text-sm text-gray-500 ml-2">Analyzing your pages...</span>
              </div>
            )}
          </div>

          {/* Connection status panels */}
          <div className="grid grid-cols-3 gap-4">
            <ConnectionPanel
              icon={<BarChart3 className="w-5 h-5" />}
              name="Google Analytics 4"
              configured={ga4Configured}
              description="Pageviews, sessions, bounce rate"
            />
            <ConnectionPanel
              icon={<Activity className="w-5 h-5" />}
              name="Microsoft Clarity"
              configured={clarityConfigured}
              description="Scroll depth, rage clicks, UX signals"
              note={clarityConfigured ? "Data limited to last 3 days" : undefined}
            />
            <ConnectionPanel
              icon={<ShoppingCart className="w-5 h-5" />}
              name="Shopify"
              configured={shopifyConfigured}
              description="Orders, revenue per page"
            />
          </div>
        </>
      )}
    </div>
  );
}

// ---- Helpers ----

interface PageRow {
  path: string;
  views: number;
  sessions: number;
  bounceRate: number;
  orders: number;
  revenue: number;
  currency: string;
  perLang: Record<string, { views: number; sessions: number; bounceRate: number }>;
}

function buildPageRows(data: PageMetricsData | null): PageRow[] {
  if (!data) return [];
  const map = new Map<string, PageRow>();

  // GA4 data: keys are "lang:/path"
  for (const [key, metrics] of Object.entries(data.ga4)) {
    const [lang, ...pathParts] = key.split(":");
    const path = pathParts.join(":") || "/";

    if (!map.has(path)) {
      map.set(path, {
        path,
        views: 0,
        sessions: 0,
        bounceRate: 0,
        orders: 0,
        revenue: 0,
        currency: "",
        perLang: {},
      });
    }

    const row = map.get(path)!;
    row.views += metrics.screenPageViews;
    row.sessions += metrics.sessions;
    row.perLang[lang] = {
      views: metrics.screenPageViews,
      sessions: metrics.sessions,
      bounceRate: metrics.bounceRate,
    };
  }

  // Shopify data: keys are page slugs
  for (const [slug, shopify] of Object.entries(data.shopify)) {
    // Try to match slug to a path
    const matchPath = `/${slug}` ;
    const row = map.get(matchPath) ?? map.get(slug);
    if (row) {
      row.orders = shopify.orders;
      row.revenue = shopify.revenue;
      row.currency = shopify.currency;
    } else {
      // Page from Shopify not in GA4 — still show it
      map.set(matchPath, {
        path: matchPath,
        views: 0,
        sessions: 0,
        bounceRate: 0,
        orders: shopify.orders,
        revenue: shopify.revenue,
        currency: shopify.currency,
        perLang: {},
      });
    }
  }

  // Calculate average bounce rate per row
  for (const row of map.values()) {
    const langs = Object.values(row.perLang);
    if (langs.length > 0) {
      row.bounceRate = langs.reduce((s, l) => s + l.bounceRate, 0) / langs.length;
    }
  }

  return Array.from(map.values());
}

function findClarityForPage(path: string, clarity: ClarityEntry[]): ClarityEntry[] {
  return clarity.filter((c) => {
    try {
      const url = new URL(c.url);
      return url.pathname === path || url.pathname === path + "/";
    } catch {
      return c.url.includes(path);
    }
  });
}

// ---- Subcomponents ----

function PageRow({
  row,
  isExpanded,
  onToggle,
  clarityData,
}: {
  row: PageRow;
  isExpanded: boolean;
  onToggle: () => void;
  clarityData: ClarityEntry[];
}) {
  return (
    <>
      <tr
        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        </td>
        <td className="px-4 py-2.5">
          <div className="text-xs font-medium text-gray-800 truncate max-w-[200px]">{row.path}</div>
        </td>
        {LANGUAGES.map((lang) => {
          const langData = row.perLang[lang];
          return (
            <td key={lang} className="px-3 py-2.5 text-center">
              {langData ? (
                <span className="text-xs tabular-nums text-gray-500">{langData.views}</span>
              ) : (
                <span className="text-xs text-gray-300">—</span>
              )}
            </td>
          );
        })}
        <td className="px-4 py-2.5 text-xs text-gray-700 text-right tabular-nums font-medium">
          {row.views.toLocaleString()}
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-500 text-right tabular-nums">
          {row.sessions.toLocaleString()}
        </td>
        <td className="px-4 py-2.5 text-xs text-right tabular-nums">
          <span className={row.bounceRate > 0.7 ? "text-red-500" : row.bounceRate > 0.5 ? "text-amber-500" : "text-gray-500"}>
            {(row.bounceRate * 100).toFixed(1)}%
          </span>
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-700 text-right tabular-nums font-medium">
          {row.orders > 0 ? row.orders : "—"}
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-700 text-right tabular-nums font-medium">
          {row.revenue > 0 ? `${row.revenue.toFixed(0)} ${row.currency}` : "—"}
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={10} className="px-8 py-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Per-language GA4 breakdown */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Per-Language Breakdown</p>
                <div className="space-y-1.5">
                  {LANGUAGES.map((lang) => {
                    const ld = row.perLang[lang];
                    if (!ld) return (
                      <div key={lang} className="text-xs text-gray-300">{LANG_LABELS[lang]}: No data</div>
                    );
                    return (
                      <div key={lang} className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500 w-16">{LANG_LABELS[lang]}</span>
                        <span className="tabular-nums text-gray-700">{ld.views} views</span>
                        <span className="tabular-nums text-gray-500">{ld.sessions} sessions</span>
                        <span className={`tabular-nums ${ld.bounceRate > 0.7 ? "text-red-500" : "text-gray-500"}`}>
                          {(ld.bounceRate * 100).toFixed(1)}% bounce
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Clarity signals */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  UX Signals (Clarity)
                  <span className="text-[10px] text-gray-400 normal-case ml-1">last 3 days</span>
                </p>
                {clarityData.length > 0 ? (
                  <div className="space-y-1.5">
                    {clarityData.map((c, i) => (
                      <div key={i} className="flex flex-wrap gap-3 text-xs">
                        <span className="text-gray-500">
                          Scroll: <span className="text-gray-700 tabular-nums">{(c.scrollDepth * 100).toFixed(0)}%</span>
                        </span>
                        <span className="text-gray-500">
                          Active: <span className="text-gray-700 tabular-nums">{c.activeTime.toFixed(0)}s</span>
                        </span>
                        {c.rageClickCount > 0 && (
                          <span className="text-red-500">
                            Rage clicks: {c.rageClickCount}
                          </span>
                        )}
                        {c.deadClickCount > 0 && (
                          <span className="text-amber-500">
                            Dead clicks: {c.deadClickCount}
                          </span>
                        )}
                        {c.quickbackClickCount > 0 && (
                          <span className="text-orange-500">
                            Quickbacks: {c.quickbackClickCount}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-300">No Clarity data for this page</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function UXQualityCard({ clarity }: { clarity: ClarityEntry[] }) {
  const problemPages = clarity
    .filter((c) => c.rageClickCount > 0 || c.deadClickCount > 5)
    .sort((a, b) => (b.rageClickCount + b.deadClickCount) - (a.rageClickCount + a.deadClickCount))
    .slice(0, 5);

  if (problemPages.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <MousePointerClick className="w-4 h-4 text-orange-500" />
        <h2 className="text-sm font-medium text-gray-700">UX Issues Detected</h2>
        <span className="text-[10px] text-gray-400 ml-auto">from Clarity, last 3 days</span>
      </div>
      <div className="p-4 space-y-2">
        {problemPages.map((page, i) => {
          let url: string;
          try {
            url = new URL(page.url).pathname;
          } catch {
            url = page.url;
          }
          return (
            <div key={i} className="flex items-center gap-3 text-xs bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
              <span className="text-gray-700 font-medium truncate max-w-[200px]">{url}</span>
              {page.rageClickCount > 0 && (
                <span className="text-red-600 tabular-nums">{page.rageClickCount} rage clicks</span>
              )}
              {page.deadClickCount > 0 && (
                <span className="text-amber-600 tabular-nums">{page.deadClickCount} dead clicks</span>
              )}
              <span className="text-gray-400 tabular-nums ml-auto">
                {(page.scrollDepth * 100).toFixed(0)}% scroll depth
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InsightsPanel({ insights }: { insights: PageInsights }) {
  return (
    <div className="p-4 space-y-4">
      {/* Summary */}
      <div className="bg-indigo-50 rounded-lg p-3">
        <p className="text-sm text-indigo-800">{insights.summary}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Best pages */}
        {insights.best_pages.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Best Performing</span>
            </div>
            <div className="space-y-2">
              {insights.best_pages.map((p, i) => (
                <div key={i} className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                  <p className="text-xs font-medium text-emerald-800">{p.page} ({p.language})</p>
                  <p className="text-xs text-emerald-600 mt-0.5">{p.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Worst pages */}
        {insights.worst_pages.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Needs Improvement</span>
            </div>
            <div className="space-y-2">
              {insights.worst_pages.map((p, i) => (
                <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-2.5">
                  <p className="text-xs font-medium text-red-800">{p.page} ({p.language})</p>
                  <p className="text-xs text-red-600 mt-0.5">{p.issue}</p>
                  <p className="text-xs text-red-500 mt-0.5 italic">{p.recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* UX Issues */}
      {insights.ux_issues.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <MousePointerClick className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">UX Issues</span>
          </div>
          <div className="space-y-1.5">
            {insights.ux_issues.map((u, i) => (
              <div key={i} className="flex items-start gap-2 bg-orange-50 border border-orange-100 rounded-lg p-2.5">
                <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                  u.severity === "high" ? "bg-red-100 text-red-700" :
                  u.severity === "medium" ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {u.severity}
                </span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-orange-800">{u.page} — {u.signal}</p>
                  <p className="text-xs text-orange-600 mt-0.5">{u.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-market + Action items */}
      <div className="grid grid-cols-2 gap-4">
        {insights.cross_market.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Cross-Market</span>
            </div>
            <ul className="space-y-1">
              {insights.cross_market.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                  <span className="text-purple-400 mt-0.5 shrink-0">-</span>
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
  );
}

function ConnectionPanel({
  icon,
  name,
  configured,
  description,
  note,
}: {
  icon: React.ReactNode;
  name: string;
  configured: boolean;
  description: string;
  note?: string;
}) {
  return (
    <div className={`bg-white border rounded-xl p-4 ${configured ? "border-gray-200" : "border-dashed border-gray-300"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={configured ? "text-emerald-500" : "text-gray-300"}>{icon}</span>
        <span className="text-sm font-medium text-gray-600">{name}</span>
      </div>
      {configured ? (
        <>
          <p className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="w-3 h-3" />
            Connected
          </p>
          {note && <p className="text-[10px] text-gray-400 mt-1">{note}</p>}
        </>
      ) : (
        <>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 mt-2"
          >
            <Link2 className="w-3 h-3" />
            Connect in Settings
          </Link>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
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
