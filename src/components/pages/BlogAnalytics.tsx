"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Search,
  MousePointerClick,
  Eye,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

interface TopKeyword {
  query: string;
  clicks: number;
  impressions: number;
  avgPosition: number;
}

interface BlogArticle {
  slug: string;
  title: string;
  language: string;
  category: string | null;
  publishedAt: string;
  clicks: number;
  impressions: number;
  avgPosition: number | null;
  clicksTrend: number | null;
  impressionsTrend: number | null;
  positionTrend: number | null;
  orders: number;
  revenue: number;
  currency: string;
  topKeywords: TopKeyword[];
  keywordCount: number;
}

interface BlogAnalyticsData {
  articles: BlogArticle[];
  totals: {
    totalArticles: number;
    totalClicks: number;
    totalImpressions: number;
    totalOrders: number;
    totalRevenue: number;
    avgPosition: number | null;
    totalKeywords: number;
  } | null;
  days: number;
}

function TrendBadge({ value, suffix = "%", invert = false }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value === null || value === 0) return null;
  const isPositive = invert ? value < 0 : value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
        isPositive ? "text-green-600" : "text-red-500"
      }`}
    >
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {value > 0 ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}

export default function BlogAnalytics() {
  const [data, setData] = useState<BlogAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/seo/blog-articles?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading analytics...
      </div>
    );
  }

  if (!data?.totals || data.articles.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p>No analytics data yet. Publish blog articles and wait for GSC to index them.</p>
      </div>
    );
  }

  const { totals, articles } = data;

  return (
    <div className="mb-6">
      {/* Period selector */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4" />
          Blog Performance
        </h3>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-xs border rounded px-2 py-1 text-gray-600"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-blue-600 text-xs mb-1">
            <MousePointerClick className="w-3.5 h-3.5" />
            Clicks
          </div>
          <div className="text-lg font-semibold text-blue-900">
            {totals.totalClicks.toLocaleString()}
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-purple-600 text-xs mb-1">
            <Eye className="w-3.5 h-3.5" />
            Impressions
          </div>
          <div className="text-lg font-semibold text-purple-900">
            {totals.totalImpressions.toLocaleString()}
          </div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-amber-600 text-xs mb-1">
            <Search className="w-3.5 h-3.5" />
            Avg Position
          </div>
          <div className="text-lg font-semibold text-amber-900">
            {totals.avgPosition !== null ? totals.avgPosition : "—"}
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-green-600 text-xs mb-1">
            <ShoppingCart className="w-3.5 h-3.5" />
            Orders
          </div>
          <div className="text-lg font-semibold text-green-900">
            {totals.totalOrders}
            {totals.totalRevenue > 0 && (
              <span className="text-sm font-normal text-green-600 ml-1">
                ({totals.totalRevenue.toLocaleString()} SEK)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Per-article table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Article</th>
              <th className="text-right px-3 py-2 font-medium">Clicks</th>
              <th className="text-right px-3 py-2 font-medium">Impressions</th>
              <th className="text-right px-3 py-2 font-medium">Position</th>
              <th className="text-right px-3 py-2 font-medium">Keywords</th>
              <th className="text-right px-3 py-2 font-medium">Orders</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {articles.map((article) => (
              <ArticleRow
                key={article.slug}
                article={article}
                expanded={expandedSlug === article.slug}
                onToggle={() =>
                  setExpandedSlug(expandedSlug === article.slug ? null : article.slug)
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArticleRow({
  article,
  expanded,
  onToggle,
}: {
  article: BlogArticle;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5">
          <div className="font-medium text-gray-900 truncate max-w-[250px]" title={article.title}>
            {article.title}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            /{article.slug}
            {article.category && (
              <span className="ml-1.5 bg-gray-100 px-1 rounded">{article.category}</span>
            )}
          </div>
        </td>
        <td className="text-right px-3 py-2.5 tabular-nums">
          {article.clicks.toLocaleString()}
          <div><TrendBadge value={article.clicksTrend} /></div>
        </td>
        <td className="text-right px-3 py-2.5 tabular-nums">
          {article.impressions.toLocaleString()}
          <div><TrendBadge value={article.impressionsTrend} /></div>
        </td>
        <td className="text-right px-3 py-2.5 tabular-nums">
          {article.avgPosition !== null ? article.avgPosition : "—"}
          <div><TrendBadge value={article.positionTrend} suffix="" /></div>
        </td>
        <td className="text-right px-3 py-2.5 tabular-nums text-gray-600">
          {article.keywordCount}
        </td>
        <td className="text-right px-3 py-2.5 tabular-nums">
          {article.orders > 0 ? (
            <span className="text-green-600 font-medium">{article.orders}</span>
          ) : (
            <span className="text-gray-300">0</span>
          )}
        </td>
        <td className="px-2 py-2.5 text-gray-400">
          {article.topKeywords.length > 0 && (
            expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
          )}
        </td>
      </tr>

      {/* Expanded: top keywords */}
      {expanded && article.topKeywords.length > 0 && (
        <tr>
          <td colSpan={7} className="bg-gray-50 px-3 py-2">
            <div className="text-[10px] text-gray-500 uppercase font-medium mb-1.5">
              Top Keywords
            </div>
            <div className="space-y-1">
              {article.topKeywords.map((kw) => (
                <div
                  key={kw.query}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-gray-700 truncate max-w-[300px]">&ldquo;{kw.query}&rdquo;</span>
                  <div className="flex items-center gap-4 text-gray-500 tabular-nums">
                    <span>{kw.clicks} clicks</span>
                    <span>{kw.impressions} impr</span>
                    <span>pos {kw.avgPosition}</span>
                  </div>
                </div>
              ))}
            </div>
            {article.keywordCount > 5 && (
              <div className="text-[10px] text-gray-400 mt-1">
                +{article.keywordCount - 5} more keywords
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
