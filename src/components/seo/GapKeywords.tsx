"use client";

import React, { useEffect, useState, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus, Zap, ExternalLink, ChevronDown, ChevronRight, Check, X, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GapKeyword {
  query: string;
  page: string | null;
  country: string;
  market: string;
  property: string;
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  positionTrend: number;
  opportunityScore: number;
}

interface PageDiagnostics {
  found: boolean;
  slug?: string;
  inTitle: boolean;
  inH1: boolean;
  inFirstParagraph: boolean;
  inMetaDescription: boolean;
  wordCount: number;
  h2Count: number;
  internalLinkCount: number;
  keywordDensity: number;
  recommendations: string[];
}

const MARKETS = [
  { value: "", label: "All Markets" },
  { value: "swe", label: "\u{1F1F8}\u{1F1EA} Sweden" },
  { value: "dnk", label: "\u{1F1E9}\u{1F1F0} Denmark" },
  { value: "nor", label: "\u{1F1F3}\u{1F1F4} Norway" },
];

function PositionBadge({ position }: { position: number }) {
  const color =
    position <= 10 ? "bg-green-50 text-green-700 border-green-200" :
    position <= 15 ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
    "bg-orange-50 text-orange-700 border-orange-200";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", color)}>
      #{position}
    </span>
  );
}

function TrendIndicator({ value }: { value: number }) {
  if (value === 0) return <Minus className="w-4 h-4 text-gray-300" />;
  if (value > 0) return (
    <span className="flex items-center gap-0.5 text-green-600 text-xs font-medium">
      <TrendingUp className="w-3.5 h-3.5" /> +{value}
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-red-500 text-xs font-medium">
      <TrendingDown className="w-3.5 h-3.5" /> {value}
    </span>
  );
}

function DiagnosticCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
      ) : (
        <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
      )}
      <span className={ok ? "text-gray-600" : "text-gray-900 font-medium"}>{label}</span>
    </div>
  );
}

function DiagnosticsPanel({ diag, keyword }: { diag: PageDiagnostics; keyword: string }) {
  if (!diag.found) {
    return (
      <div className="px-4 py-3 text-xs text-gray-500 italic">
        Page not in our database - diagnostics unavailable for external pages.
      </div>
    );
  }

  return (
    <div className="px-4 py-3 grid grid-cols-[1fr_1fr] gap-x-8 gap-y-1">
      {/* Left: checks */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Keyword placement</div>
        <DiagnosticCheck ok={diag.inTitle} label={`"${keyword}" in title`} />
        <DiagnosticCheck ok={diag.inH1} label={`"${keyword}" in H1`} />
        <DiagnosticCheck ok={diag.inFirstParagraph} label={`"${keyword}" in first paragraph`} />
        <DiagnosticCheck ok={diag.inMetaDescription} label={`"${keyword}" in meta description`} />
      </div>

      {/* Right: stats + recommendations */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Page stats</div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-gray-400">Words</div>
            <div className={cn("font-medium", diag.wordCount < 1000 ? "text-red-600" : diag.wordCount < 1500 ? "text-yellow-600" : "text-gray-900")}>
              {diag.wordCount.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-400">H2s</div>
            <div className={cn("font-medium", diag.h2Count < 3 ? "text-yellow-600" : "text-gray-900")}>{diag.h2Count}</div>
          </div>
          <div>
            <div className="text-gray-400">Int. links</div>
            <div className={cn("font-medium", diag.internalLinkCount < 2 ? "text-yellow-600" : "text-gray-900")}>{diag.internalLinkCount}</div>
          </div>
        </div>
        <div className="text-xs">
          <span className="text-gray-400">Keyword density: </span>
          <span className={cn("font-medium", diag.keywordDensity < 0.3 ? "text-yellow-600" : diag.keywordDensity > 3 ? "text-red-600" : "text-gray-900")}>
            {diag.keywordDensity}%
          </span>
        </div>

        {diag.recommendations.length > 0 && diag.recommendations[0] !== "Page looks well-optimized for this keyword" && (
          <div className="mt-2 space-y-1">
            {diag.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{rec}</span>
              </div>
            ))}
          </div>
        )}

        {diag.recommendations[0] === "Page looks well-optimized for this keyword" && (
          <div className="flex items-center gap-1.5 text-xs text-green-600 mt-2">
            <Check className="w-3.5 h-3.5" />
            <span>Page looks well-optimized for this keyword</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GapKeywords() {
  const [data, setData] = useState<GapKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [diagnosticsCache, setDiagnosticsCache] = useState<Record<string, PageDiagnostics>>({});
  const [loadingDiag, setLoadingDiag] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    params.set("limit", "100");

    fetch(`/api/seo/gap-keywords?${params}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [country]);

  const fetchDiagnostics = useCallback(async (kw: GapKeyword) => {
    const key = `${kw.query}|${kw.page}`;
    if (diagnosticsCache[key]) return;
    if (!kw.page) return;

    setLoadingDiag(key);
    try {
      const params = new URLSearchParams({ url: kw.page, keyword: kw.query });
      const res = await fetch(`/api/seo/page-diagnostics?${params}`);
      const diag: PageDiagnostics = await res.json();
      setDiagnosticsCache((prev) => ({ ...prev, [key]: diag }));
    } catch {
      setDiagnosticsCache((prev) => ({
        ...prev,
        [key]: { found: false, inTitle: false, inH1: false, inFirstParagraph: false, inMetaDescription: false, wordCount: 0, h2Count: 0, internalLinkCount: 0, keywordDensity: 0, recommendations: ["Failed to load diagnostics"] },
      }));
    } finally {
      setLoadingDiag(null);
    }
  }, [diagnosticsCache]);

  const toggleRow = useCallback((kw: GapKeyword) => {
    const key = `${kw.query}|${kw.page}`;
    if (expandedRow === key) {
      setExpandedRow(null);
    } else {
      setExpandedRow(key);
      fetchDiagnostics(kw);
    }
  }, [expandedRow, fetchDiagnostics]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Gap Keywords Found</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Gap keywords are search terms where you rank between positions 5-20. These are your best opportunities to reach page 1.
          Sync your GSC data first if you haven&apos;t already.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
        <p className="text-sm text-indigo-700">
          <strong>Gap keywords</strong> are search terms where you rank between positions 5-20.
          These are your easiest wins - click a row to see page diagnostics and what to fix.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        {MARKETS.map((m) => (
          <button
            key={m.value}
            onClick={() => setCountry(m.value)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg border transition-colors",
              country === m.value
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-8 py-3 px-2"></th>
              <th className="text-left py-3 px-4 font-medium text-gray-600">Keyword</th>
              <th className="text-center py-3 px-3 font-medium text-gray-600 w-20">Position</th>
              <th className="text-center py-3 px-3 font-medium text-gray-600 w-16">Trend</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600 w-24">Impressions</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600 w-20">Clicks</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600 w-16">CTR</th>
              <th className="text-center py-3 px-3 font-medium text-gray-600 w-16">Market</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600 w-24">Opportunity</th>
            </tr>
          </thead>
          <tbody>
            {data.map((kw, i) => {
              const rowKey = `${kw.query}|${kw.page}`;
              const isExpanded = expandedRow === rowKey;
              const diag = diagnosticsCache[rowKey];
              const isLoading = loadingDiag === rowKey;
              const hasPage = !!kw.page;

              return (
                <React.Fragment key={`${kw.query}-${kw.country}-${kw.property}`}>
                  <tr
                    className={cn(
                      "border-b border-gray-100 transition-colors",
                      i === 0 && !isExpanded && "bg-yellow-50/30",
                      isExpanded ? "bg-indigo-50/40" : "hover:bg-gray-50",
                      hasPage && "cursor-pointer"
                    )}
                    onClick={() => hasPage && toggleRow(kw)}
                  >
                    <td className="py-3 px-2 text-center">
                      {hasPage && (
                        isExpanded
                          ? <ChevronDown className="w-4 h-4 text-gray-400 mx-auto" />
                          : <ChevronRight className="w-4 h-4 text-gray-300 mx-auto" />
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{kw.query}</div>
                      {kw.page && (
                        <a
                          href={kw.page}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-400 hover:text-indigo-500 flex items-center gap-1 mt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {new URL(kw.page).pathname}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                    <td className="text-center py-3 px-3">
                      <PositionBadge position={kw.avgPosition} />
                    </td>
                    <td className="text-center py-3 px-3">
                      <TrendIndicator value={kw.positionTrend} />
                    </td>
                    <td className="text-right py-3 px-3 text-gray-700 tabular-nums">{kw.totalImpressions.toLocaleString()}</td>
                    <td className="text-right py-3 px-3 text-gray-700 tabular-nums">{kw.totalClicks.toLocaleString()}</td>
                    <td className="text-right py-3 px-3 text-gray-500 tabular-nums">{(kw.avgCtr * 100).toFixed(1)}%</td>
                    <td className="text-center py-3 px-3">
                      <span className="text-xs text-gray-500">{kw.market}</span>
                    </td>
                    <td className="text-right py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                        {kw.opportunityScore.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50/80 border-b border-gray-200">
                      <td colSpan={9}>
                        {isLoading ? (
                          <div className="flex items-center gap-2 px-4 py-4 text-xs text-gray-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Analyzing page...
                          </div>
                        ) : diag ? (
                          <DiagnosticsPanel diag={diag} keyword={kw.query} />
                        ) : null}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
